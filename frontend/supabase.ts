import { createClient } from '@supabase/supabase-js';
import type { GamePhase } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://elfjnweivqggcwbvxgmv.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_V1UmkONRRebtAJDkgyEpRQ_qXvkLss5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'jec' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const callRansenControl = async (method: 'GET' | 'POST', body?: Record<string, unknown>, roomId = 'main') => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control?room=${encodeURIComponent(roomId)}`, {
      method,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({ ok: false, message: '遥控服务响应异常' }));
    return { ...data, status: response.status } as { ok: boolean; status: number; message?: string; phase?: GamePhase; persisted?: boolean; code?: string; lobbyEndsAt?: string | null; serverNow?: string; arenaName?: string; snapshot?: Record<string, any>; page?: number; pageSize?: number; total?: number; totalPages?: number; matches?: unknown[] };
  } catch (error) {
    console.error('Ransen control request failed', error);
    return { ok: false, status: 0, message: '云端连接失败，请重试' };
  }
};

export const persistRansenSnapshot = async (snapshot: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
    method: 'PUT',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase: snapshot.phase === 'THEATER' ? 'THEATER' : 'PLAYING', snapshot, roomId }),
  });
  return response.ok;
};

export const claimRansenStart = async (snapshot: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'claim_start', public: true, snapshot, roomId }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  return { ...data, status: response.status } as { ok: boolean; status: number; code?: string; message?: string; startedAt?: number; serverNow?: string; snapshot?: Record<string, any> };
};

export const registerRansenPlayer = async (player: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'join_lobby', public: true, player, roomId }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  return { ...data, status: response.status } as { ok: boolean; admitted?: boolean; message?: string; playerCount?: number; audienceCount?: number };
};

import { createClient } from '@supabase/supabase-js';
import type { GamePhase, Question } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://elfjnweivqggcwbvxgmv.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_V1UmkONRRebtAJDkgyEpRQ_qXvkLss5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: { schema: 'jec' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const questionRequests = new Map<string, Promise<Question[]>>();

export const loadSnakeSamuraiQuestions = (levels?: string[]) => {
  const cacheKey = levels?.length ? [...levels].sort().join('|') : 'all';
  const existing = questionRequests.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    const rows: any[] = [];
    const pageSize = 1000;

    let targetTable = 'snake_samurai_questions';
    const { error: testErr } = await supabase.from(targetTable).select('id').limit(1);
    if (testErr) targetTable = 'ransen_questions';

    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from(targetTable)
        .select('id,text,options,correct_index,question_type,level')
        .eq('active', true)
        .order('id')
        .range(from, from + pageSize - 1);
      if (levels?.length) query = query.in('level', levels);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows.map(row => ({
      id: String(row.id),
      text: String(row.text),
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      correctIndex: Number(row.correct_index),
      type: row.question_type as Question['type'],
      level: row.level ? String(row.level) : undefined,
    })).filter(question => question.options.length === 4 && question.correctIndex >= 0 && question.correctIndex <= 3);
  })();
  questionRequests.set(cacheKey, request);
  request.catch(() => questionRequests.delete(cacheKey));
  return request;
};

const requestedSnakeRoom = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('arena') : null;
export const SNAKE_SAMURAI_ROOM_ID = requestedSnakeRoom === 'snake-theme' || requestedSnakeRoom === 'snake-disaster'
  ? requestedSnakeRoom
  : 'snake-free';

export const callSnakeSamuraiControl = async (method: 'GET' | 'POST', body?: Record<string, unknown>, roomId = SNAKE_SAMURAI_ROOM_ID) => {
  const tryEndpoint = async (fnName: string) => {
    const url = `${SUPABASE_URL}/functions/v1/${fnName}?room=${encodeURIComponent(roomId)}`;
    const response = await fetch(url, {
      method,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response;
  };

  try {
    // All five playlists share one authoritative state machine. Falling back
    // to the legacy snake controller would reintroduce split-room behavior.
    const response = await tryEndpoint('ransen-control');

    if (response.ok) {
      const data = await response.json().catch(() => ({ ok: true }));
      return { ...data, status: response.status, ok: true } as { ok: boolean; status: number; message?: string; phase?: GamePhase; persisted?: boolean; code?: string; role?: 'participant' | 'spectator'; lobbyEndsAt?: string | null; serverNow?: string; arenaName?: string; snapshot?: Record<string, any>; directorStatus?: 'primary' | 'fallback' | 'offline'; directorLastSeenAt?: string | null; page?: number; pageSize?: number; total?: number; totalPages?: number; matches?: unknown[] };
    }

    const errorData = await response.json().catch(() => ({ ok: false, message: '响应异常' }));
    return { ...errorData, status: response.status } as { ok: boolean; status: number; message?: string; phase?: GamePhase; persisted?: boolean; code?: string; role?: 'participant' | 'spectator'; lobbyEndsAt?: string | null; serverNow?: string; arenaName?: string; snapshot?: Record<string, any>; directorStatus?: 'primary' | 'fallback' | 'offline'; directorLastSeenAt?: string | null; page?: number; pageSize?: number; total?: number; totalPages?: number; matches?: unknown[] };
  } catch (error) {
    console.warn('Snake Samurai control request failed', error);
    return { ok: false, status: 0, message: '场次服务连接失败' };
  }
};

// Shared arena cards still query the common controller by its historical name.
export const callRansenControl = callSnakeSamuraiControl;

export const persistSnakeSamuraiSnapshot = async (snapshot: Record<string, any>, roomId = SNAKE_SAMURAI_ROOM_ID) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
      method: 'PUT',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: snapshot.phase === 'THEATER' ? 'THEATER' : 'PLAYING', snapshot, roomId }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const claimSnakeSamuraiStart = async (snapshot: Record<string, any>, roomId = SNAKE_SAMURAI_ROOM_ID) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'claim_start', public: true, snapshot, roomId }),
    });
    const data = await response.json().catch(() => ({ ok: true }));
    return { ...data, status: response.status } as { ok: boolean; status: number; code?: string; message?: string; startedAt?: number; serverNow?: string; snapshot?: Record<string, any> };
  } catch {
    return { ok: false, status: 0, message: '开局服务不可用' };
  }
};

export const registerSnakeSamuraiPlayer = async (player: Record<string, any>, roomId = SNAKE_SAMURAI_ROOM_ID) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ransen-control`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'join_lobby', public: true, player, roomId }),
    });
    const data = await response.json().catch(() => ({ ok: true, admitted: true }));
    return { ...data, status: response.status } as { ok: boolean; admitted?: boolean; message?: string; role?: 'participant' | 'spectator'; phase?: GamePhase; lobbyEndsAt?: string | null; serverNow?: string; arenaName?: string; snapshot?: Record<string, any>; playerCount?: number; audienceCount?: number };
  } catch {
    return { ok: false, admitted: false, status: 0, message: '玩家登记服务不可用' };
  }
};

export const validateSnakeComposition = async (text: string, theme: string, playlistId = SNAKE_SAMURAI_ROOM_ID) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/snake-language-validate`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, theme, playlistId }),
      signal: AbortSignal.timeout(6_000),
    });
    const data = await response.json().catch(() => ({ ok: false, valid: false, reason: 'validation_unavailable' }));
    return { ...data, status: response.status } as { ok: boolean; valid: boolean; canonical?: string; reason?: string; source?: string; evidenceId?: string; status: number };
  } catch {
    return { ok: false, valid: false, reason: 'validation_unavailable', status: 0 };
  }
};

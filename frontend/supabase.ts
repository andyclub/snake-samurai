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
    
    // Attempt querying snake_samurai_questions first, falling back to ransen_questions if needed
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

export const callSnakeSamuraiControl = async (method: 'GET' | 'POST', body?: Record<string, unknown>, roomId = 'main') => {
  try {
    // Attempt snake-samurai-control endpoint first, with fallback to ransen-control
    let endpoint = `${SUPABASE_URL}/functions/v1/snake-samurai-control?room=${encodeURIComponent(roomId)}`;
    let response = await fetch(endpoint, {
      method,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 404) {
      endpoint = `${SUPABASE_URL}/functions/v1/ransen-control?room=${encodeURIComponent(roomId)}`;
      response = await fetch(endpoint, {
        method,
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    const data = await response.json().catch(() => ({ ok: false, message: '遥控服务响应异常' }));
    return { ...data, status: response.status } as { ok: boolean; status: number; message?: string; phase?: GamePhase; persisted?: boolean; code?: string; lobbyEndsAt?: string | null; serverNow?: string; arenaName?: string; snapshot?: Record<string, any>; page?: number; pageSize?: number; total?: number; totalPages?: number; matches?: unknown[] };
  } catch (error) {
    console.error('Snake Samurai control request failed', error);
    return { ok: false, status: 0, message: '云端连接失败，请重试' };
  }
};

export const persistSnakeSamuraiSnapshot = async (snapshot: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/snake-samurai-control`, {
    method: 'PUT',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase: snapshot.phase === 'THEATER' ? 'THEATER' : 'PLAYING', snapshot, roomId }),
  });
  return response.ok;
};

export const claimSnakeSamuraiStart = async (snapshot: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/snake-samurai-control`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'claim_start', public: true, snapshot, roomId }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  return { ...data, status: response.status } as { ok: boolean; status: number; code?: string; message?: string; startedAt?: number; serverNow?: string; snapshot?: Record<string, any> };
};

export const registerSnakeSamuraiPlayer = async (player: Record<string, any>, roomId = 'main') => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/snake-samurai-control`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'join_lobby', public: true, player, roomId }),
  });
  const data = await response.json().catch(() => ({ ok: false }));
  return { ...data, status: response.status } as { ok: boolean; admitted?: boolean; message?: string; playerCount?: number; audienceCount?: number };
};

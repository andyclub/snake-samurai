import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const allowedOrigins = new Set(["https://h.kazeabc.com", "https://g.kazeabc.com", "http://localhost:5173", "http://localhost:3000"]);
const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && (allowedOrigins.has(origin) || origin.endsWith(".vercel.app")) ? origin : "https://h.kazeabc.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});
const normalize = (value: string) => value.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLocaleLowerCase("ja-JP");
const cache = new Map<string, { expires: number; value: Record<string, unknown> }>();
const THEME_TERMS: Record<string, string[]> = {
  life: ["生活", "家", "家族", "食", "買", "寝", "朝", "夜", "友"],
  study: ["学", "勉強", "学校", "先生", "質問", "本", "読む", "書く"],
  work: ["仕事", "会社", "会議", "職場", "働", "連絡", "予定"],
  travel: ["旅", "駅", "電車", "空港", "ホテル", "観光", "道", "行く"],
  culture: ["日本", "文化", "祭", "神社", "寺", "伝統", "茶", "着物"],
  disaster: ["防災", "災害", "避難", "地震", "津波", "火災", "安全", "備蓄", "警報"],
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, { headers: { "User-Agent": "KazeABC-Snake/1.0" }, signal: AbortSignal.timeout(4_500) });
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  return response.json();
};

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  const headers = headersFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false }), { status: 405, headers });
  if (origin && !allowedOrigins.has(origin) && !origin.endsWith(".vercel.app")) return new Response(JSON.stringify({ ok: false }), { status: 403, headers });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  const playlistId = String(body.playlistId || "snake-free");
  const theme = String(body.theme || "free");
  if (Array.from(text).length < 3 || Array.from(text).length > 64 || !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ヶ・、。！？]+$/u.test(text)) {
    return new Response(JSON.stringify({ ok: true, valid: false, reason: "invalid_language" }), { headers });
  }
  const key = `${playlistId}:${theme}:${normalize(text)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return new Response(JSON.stringify(cached.value), { headers });

  try {
    if (playlistId === "snake-disaster") {
      const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey!, { db: { schema: "jec" } });
      const { data, error } = await admin.from("ransen_questions").select("id,text,options").eq("active", true).eq("category", "disaster").eq("level", "防災");
      if (error) throw error;
      const needle = normalize(text);
      const match = (data || []).find((row: any) => [row.text, ...(Array.isArray(row.options) ? row.options : [])].some(value => normalize(String(value)).includes(needle)));
      const value = match
        ? { ok: true, valid: true, canonical: text, source: "disaster_corpus", evidenceId: match.id }
        : { ok: true, valid: false, reason: "disaster_mismatch" };
      cache.set(key, { expires: Date.now() + 60_000, value });
      return new Response(JSON.stringify(value), { headers });
    }

    const search = await fetchJson(`https://ja.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(text)}`);
    const pages = Object.values(search?.query?.pages || {}) as any[];
    const wiktionaryValid = pages.some(page => !page.missing && String(page?.revisions?.[0]?.slots?.main?.["*"] || "").includes("{{ja"));
    let exampleValid = false;
    if (!wiktionaryValid) {
      const examples = await fetchJson(`https://api.tatoeba.org/v1/sentences?lang=jpn&q=${encodeURIComponent(text)}&sort=relevance&is_unapproved=no&is_orphan=no&trans%3Acount=!0&limit=5`);
      exampleValid = (examples?.data || []).some((item: any) => normalize(String(item.text || "")).includes(normalize(text)));
    }
    if (!wiktionaryValid && !exampleValid) {
      const value = { ok: true, valid: false, reason: "invalid_language" };
      cache.set(key, { expires: Date.now() + 30_000, value });
      return new Response(JSON.stringify(value), { headers });
    }
    const themeMatch = theme === "free" || (THEME_TERMS[theme] || []).some(term => normalize(text).includes(normalize(term)));
    const value = themeMatch
      ? { ok: true, valid: true, canonical: text, source: wiktionaryValid ? "wiktionary" : "tatoeba" }
      : { ok: true, valid: false, reason: "theme_mismatch" };
    cache.set(key, { expires: Date.now() + 60_000, value });
    return new Response(JSON.stringify(value), { headers });
  } catch (error) {
    console.error("snake-language-validate", error);
    return new Response(JSON.stringify({ ok: false, valid: false, reason: "validation_unavailable" }), { status: 503, headers });
  }
});

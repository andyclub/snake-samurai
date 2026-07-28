import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const PASSWORD_HASH = "7eea81b2d4da5faaa2b1f9cabb94617298f8c9796e6b51d48dcbaef3731e8e47";
const SEAFOOD = ["海老", "帆立", "鮪", "真鯛", "烏賊", "蛸", "蟹", "鮭", "牡蠣", "雲丹", "甘海老", "鰹"];
const allowedOrigins = new Set(["https://g.kazeabc.com", "http://localhost:5173"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://g.kazeabc.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
});
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};
const sanitizeSnapshot = (snapshot: Record<string, unknown>) => {
  const slimes = Array.isArray(snapshot.slimes) ? snapshot.slimes : [];
  const liveIds = new Set(slimes.filter((slime: any) => !slime?.isDead && typeof slime?.id === "string").map((slime: any) => slime.id));
  const encounters = Array.isArray(snapshot.encounters)
    ? snapshot.encounters.filter((encounter: any) => !encounter?.resolved && liveIds.has(encounter?.slime1Id) && liveIds.has(encounter?.slime2Id))
    : [];
  const allowedEventTypes = new Set(["match_started", "battle_started", "battle_resolved", "match_ended"]);
  const auditEvents = Array.isArray(snapshot.auditEvents)
    ? snapshot.auditEvents.slice(-200).filter((event: any) =>
      event && typeof event.id === "string" && event.id.length <= 100
      && allowedEventTypes.has(event.type) && typeof event.at === "number" && Number.isFinite(event.at)
      && (!event.details || (typeof event.details === "object" && JSON.stringify(event.details).length <= 3000))
    )
    : [];
  const endReason = snapshot.endReason === "last_slime" ? "last_slime" : snapshot.endReason === "timeout" ? "timeout" : undefined;
  return { ...snapshot, slimes, encounters, auditEvents, endReason };
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (origin && !allowedOrigins.has(origin) && !origin.endsWith(".vercel.app")) {
    return new Response(JSON.stringify({ ok: false, message: "来源不允许" }), { status: 403, headers });
  }

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey!, { db: { schema: "jec" } });
  const queryRoomId = new URL(req.url).searchParams.get("room");
  const requestedRoomId = queryRoomId === "bousai-toyama" ? "bousai-toyama" : "main";

  if (req.method === "GET") {
    const { data, error } = await admin.from("ransen_rooms").select("phase,lobby_ends_at,arena_name,snapshot,updated_at").eq("id", requestedRoomId).maybeSingle();
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    const snapshot = sanitizeSnapshot(data?.snapshot || { slimes: [], encounters: [] });
    const expired = data?.phase === "PLAYING" && typeof snapshot.startedAt === "number" && Date.now() >= snapshot.startedAt + 300_000;
    const phase = expired ? "THEATER" : data?.phase || "OFF";
    if (expired) {
      const { error: expiryError } = await admin.from("ransen_rooms").update({
        phase: "THEATER",
        snapshot,
        updated_at: new Date().toISOString(),
      }).eq("id", requestedRoomId).eq("phase", "PLAYING");
      if (expiryError) return new Response(JSON.stringify({ ok: false, message: expiryError.message }), { status: 500, headers });
    }
    return new Response(JSON.stringify({
      ok: true,
      phase,
      lobbyEndsAt: data?.lobby_ends_at || null,
      arenaName: data?.arena_name || "海老",
      snapshot,
      updatedAt: data?.updated_at || null,
      serverNow: new Date().toISOString(),
    }), { headers });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => ({}));
    const roomId = body.roomId === "bousai-toyama" ? "bousai-toyama" : "main";
    if (body.phase !== "PLAYING" && body.phase !== "THEATER") return new Response(JSON.stringify({ ok: false, message: "阶段不允许" }), { status: 400, headers });
    const snapshot = body.snapshot;
    const validSnapshot = snapshot && Array.isArray(snapshot.slimes) && snapshot.slimes.length > 0 && snapshot.slimes.length <= 100
      && Array.isArray(snapshot.encounters) && typeof snapshot.startedAt === "number"
      && JSON.stringify(snapshot).length <= 250000;
    if (!validSnapshot) return new Response(JSON.stringify({ ok: false, message: "战局快照无效" }), { status: 400, headers });

    const sanitizedSnapshot = sanitizeSnapshot(snapshot);
    const { data: room, error: readError } = await admin.from("ransen_rooms").select("phase,lobby_ends_at,snapshot").eq("id", roomId).maybeSingle();
    if (readError) return new Response(JSON.stringify({ ok: false, message: readError.message }), { status: 500, headers });
    const deadline = room?.lobby_ends_at ? Date.parse(room.lobby_ends_at) : Number.NaN;
    const mayStart = room?.phase === "LOBBY" && Number.isFinite(deadline) && Date.now() >= deadline - 500;
    const expired = Date.now() >= snapshot.startedAt + 300_000;
    const targetPhase = body.phase === "THEATER" || expired ? "THEATER" : "PLAYING";
    const storedStartedAt = typeof room?.snapshot?.startedAt === "number" ? room.snapshot.startedAt : null;
    const sameRound = storedStartedAt === null || Math.abs(storedStartedAt - snapshot.startedAt) <= 15_000;
    const freshLobbyStart = mayStart && targetPhase === "PLAYING"
      && snapshot.startedAt >= deadline - 2_000 && snapshot.startedAt <= Date.now() + 10_000;
    const mayContinue = room?.phase === "PLAYING" && sameRound;
    const mayFinish = targetPhase === "THEATER" && (room?.phase === "PLAYING" || room?.phase === "THEATER") && sameRound;
    if (!freshLobbyStart && !mayContinue && !mayFinish) {
      return new Response(JSON.stringify({ ok: false, message: "当前阶段不能保存战局" }), { status: 409, headers });
    }

    const { error } = await admin.from("ransen_rooms").update({
      phase: targetPhase,
      lobby_ends_at: null,
      snapshot: sanitizedSnapshot,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId).in("phase", ["LOBBY", "PLAYING", "THEATER"]);
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ ok: true, phase: targetPhase, slimeCount: sanitizedSnapshot.slimes.length }), { headers });
  }

  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, message: "请求方式不允许" }), { status: 405, headers });
  const body = await req.json().catch(() => ({}));
  const roomId = body.roomId === "bousai-toyama" ? "bousai-toyama" : "main";
  const command = String(body.command || "");
  const isPublicStart = command === "on" && body.public === true;
  const isPublicClaim = command === "claim_start" && body.public === true;
  const isPublicJoin = command === "join_lobby" && body.public === true;
  if (!isPublicStart && !isPublicClaim && !isPublicJoin && await sha256(String(body.password || "")) !== PASSWORD_HASH) {
    return new Response(JSON.stringify({ ok: false, code: "INVALID_PASSWORD", message: "遥控器密码错误" }), { status: 401, headers });
  }

  if (isPublicJoin) {
    const player = body.player || {};
    const validPlayer = typeof player.id === "string" && /^[0-9a-f-]{36}$/i.test(player.id)
      && typeof player.name === "string" && player.name.trim().length >= 1 && player.name.trim().length <= 24
      && typeof player.color === "string" && /^#[0-9a-fA-F]{6}$/.test(player.color);
    if (!validPlayer) return new Response(JSON.stringify({ ok: false, message: "玩家资料无效" }), { status: 400, headers });
    const room = await admin.from("ransen_rooms").select("phase").eq("id", roomId).maybeSingle();
    if (room.error) return new Response(JSON.stringify({ ok: false, message: room.error.message }), { status: 500, headers });
    if (room.data?.phase !== "LOBBY") return new Response(JSON.stringify({ ok: false, code: "NOT_LOBBY", phase: room.data?.phase }), { status: 409, headers });
    const { error: joinError } = await admin.from("ransen_players").upsert({
      room_id: roomId,
      user_id: player.id,
      name: player.name.trim(),
      color: player.color,
      is_spectator: Boolean(player.isSpectator),
      last_seen: new Date().toISOString(),
    }, { onConflict: "room_id,user_id" });
    if (joinError) return new Response(JSON.stringify({ ok: false, message: joinError.message }), { status: 500, headers });
    const roster = await admin.from("ransen_players").select("user_id,is_spectator,joined_at").eq("room_id", roomId).order("joined_at", { ascending: true });
    if (roster.error) return new Response(JSON.stringify({ ok: false, message: roster.error.message }), { status: 500, headers });
    const audience = roster.data || [];
    const audienceIndex = audience.findIndex((entry: any) => entry.user_id === player.id);
    const participantIndex = audience.filter((entry: any) => !entry.is_spectator).findIndex((entry: any) => entry.user_id === player.id);
    const admitted = audienceIndex >= 0 && audienceIndex < 19 && (player.isSpectator || (participantIndex >= 0 && participantIndex < 13));
    return new Response(JSON.stringify({ ok: admitted, admitted, playerCount: Math.min(13, audience.filter((entry: any) => !entry.is_spectator).length), audienceCount: Math.min(19, audience.length), message: admitted ? "已登记" : "人数已满，请等待或开启第二场比赛" }), { status: admitted ? 200 : 409, headers });
  }

  if (isPublicClaim) {
    const snapshot = body.snapshot;
    const validSnapshot = snapshot && Array.isArray(snapshot.slimes) && snapshot.slimes.length > 0 && snapshot.slimes.length <= 30
      && snapshot.slimes.every((slime: any) => Array.isArray(slime?.members) && slime.members.length > 0)
      && Array.isArray(snapshot.encounters) && snapshot.encounters.length === 0
      && typeof snapshot.startedAt === "number"
      && JSON.stringify(snapshot).length <= 150000;
    if (!validSnapshot) return new Response(JSON.stringify({ ok: false, message: "开局快照无效" }), { status: 400, headers });

    const { data: room, error: readError } = await admin.from("ransen_rooms").select("phase,lobby_ends_at,arena_name").eq("id", roomId).maybeSingle();
    if (readError) return new Response(JSON.stringify({ ok: false, message: readError.message }), { status: 500, headers });
    const deadline = room?.lobby_ends_at ? Date.parse(room.lobby_ends_at) : Number.NaN;
    if (room?.phase !== "LOBBY" || !Number.isFinite(deadline) || Date.now() < deadline - 500) {
      return new Response(JSON.stringify({ ok: false, code: "NOT_CLAIMABLE", phase: room?.phase || "OFF", message: "当前招募尚未到开局时间" }), { status: 409, headers });
    }

    const roster = await admin.from("ransen_players").select("user_id,name,color,is_spectator,joined_at").eq("room_id", roomId).order("joined_at", { ascending: true }).limit(19);
    if (roster.error) return new Response(JSON.stringify({ ok: false, message: roster.error.message }), { status: 500, headers });
    const participants = (roster.data || []).filter((entry: any) => !entry.is_spectator).slice(0, 13);
    if (participants.length === 0) return new Response(JSON.stringify({ ok: false, code: "NO_PLAYERS", message: "没有已登记的参赛者" }), { status: 409, headers });
    const submittedSlimes = Array.isArray(snapshot.slimes) ? snapshot.slimes : [];
    const humanSlimes = participants.map((entry: any, index: number) => {
      const id = `slime-${entry.user_id}`;
      const submitted = submittedSlimes.find((slime: any) => slime?.id === id);
      const x = submitted?.x ?? 180 + (index % 5) * 280;
      const y = submitted?.y ?? 180 + Math.floor(index / 5) * 300;
      return {
        ...(submitted || {}), id, x, y, targetX: x, targetY: y, size: 30, color: entry.color,
        members: [{ id: entry.user_id, name: entry.name, color: entry.color, isBot: false, isSpectator: false }],
        isDead: false, memberTargets: {},
      };
    });
    const submittedBots = submittedSlimes.filter((slime: any) => slime?.members?.length && slime.members.every((member: any) => member?.isBot)).slice(0, 12);
    const serverStartedAt = Date.now();
    const sanitizedSnapshot = sanitizeSnapshot({ ...snapshot, slimes: [...humanSlimes, ...submittedBots], encounters: [], startedAt: serverStartedAt });
    const { data: claimed, error: claimError } = await admin.from("ransen_rooms").update({
      phase: "PLAYING",
      lobby_ends_at: null,
      snapshot: sanitizedSnapshot,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId).eq("phase", "LOBBY").eq("lobby_ends_at", room.lobby_ends_at).select("id").maybeSingle();
    if (claimError) return new Response(JSON.stringify({ ok: false, message: claimError.message }), { status: 500, headers });
    if (!claimed) return new Response(JSON.stringify({ ok: false, code: "CLAIM_LOST", message: "其他设备已创建战局" }), { status: 409, headers });
    return new Response(JSON.stringify({ ok: true, phase: "PLAYING", claimed: true, arenaName: room.arena_name, startedAt: serverStartedAt, snapshot: sanitizedSnapshot, serverNow: new Date().toISOString() }), { headers });
  }

  if (command === "history") {
    const pageSize = 10;
    const requestedPage = Number(body.page);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
    const from = (page - 1) * pageSize;
    const { data, error, count } = await admin
      .from("ransen_match_history")
      .select("match_number,status,termination_reason,started_at,ended_at,last_snapshot_at,duration_seconds,human_count,bot_count,participants,winners,losers,provisional_leaders,surviving_participants,events", { count: "exact" })
      .eq("room_id", roomId)
      .order("match_number", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    const total = count || 0;
    const matches = (data || []).map((match: any) => ({
      matchNumber: match.match_number,
      status: match.status,
      terminationReason: match.termination_reason,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      lastSnapshotAt: match.last_snapshot_at,
      durationSeconds: match.duration_seconds,
      humanCount: match.human_count,
      botCount: match.bot_count,
      participants: match.participants || [],
      winners: match.winners || [],
      losers: match.losers || [],
      provisionalLeaders: match.provisional_leaders || [],
      survivingParticipants: match.surviving_participants || [],
      events: match.events || [],
    }));
    return new Response(JSON.stringify({
      ok: true,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      matches,
    }), { headers });
  }

  const phases: Record<string, string> = { on: "LOBBY", restart: "LOBBY", off: "OFF" };
  if (!(command in phases)) {
    return new Response(JSON.stringify({ ok: true, persisted: false, message: "实时命令已授权" }), { headers });
  }

  const now = new Date();
  const lobbyEndsAt = command === "off" ? null : new Date(now.getTime() + 30_000).toISOString();
  const current = await admin.from("ransen_rooms").select("phase,arena_name").eq("id", roomId).maybeSingle();
  if (current.error) return new Response(JSON.stringify({ ok: false, message: current.error.message }), { status: 500, headers });
  if (isPublicStart && current.data?.phase !== "OFF" && current.data?.phase !== "THEATER") {
    return new Response(JSON.stringify({ ok: false, message: "场次已开启，请直接加入" }), { status: 409, headers });
  }

  const arenaName = roomId === "bousai-toyama"
    ? "日本・富山市防災"
    : command === "on" ? SEAFOOD[Math.floor(Math.random() * SEAFOOD.length)] : current.data?.arena_name || "海老";
  const roomState = {
    phase: phases[command],
    lobby_ends_at: lobbyEndsAt,
    arena_name: arenaName,
    snapshot: { slimes: [], encounters: [] },
    updated_at: now.toISOString(),
  };
  const write = isPublicStart && current.data
    ? await admin.from("ransen_rooms").update(roomState).eq("id", roomId).in("phase", ["OFF", "THEATER"]).select("id").maybeSingle()
    : await admin.from("ransen_rooms").upsert({ id: roomId, ...roomState }, { onConflict: "id" }).select("id").maybeSingle();
  if (write.error) return new Response(JSON.stringify({ ok: false, message: write.error.message }), { status: 500, headers });
  if (isPublicStart && !write.data) {
    return new Response(JSON.stringify({ ok: false, message: "场次已被其他玩家开启，请直接加入" }), { status: 409, headers });
  }
  if (command === "on" || command === "restart") {
    const { error: clearError } = await admin.from("ransen_players").delete().eq("room_id", roomId);
    if (clearError) return new Response(JSON.stringify({ ok: false, message: clearError.message }), { status: 500, headers });
  }

  const message = command === "off" ? "游戏已关闭" : command === "restart" ? "默认场次已重新开局" : `默认场次「${arenaName}」已开启`;
  return new Response(JSON.stringify({
    ok: true,
    persisted: true,
    phase: phases[command],
    lobbyEndsAt,
    arenaName,
    serverNow: now.toISOString(),
    message,
  }), { headers });
});

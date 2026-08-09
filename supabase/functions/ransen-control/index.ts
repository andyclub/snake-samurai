import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const PASSWORD_HASH = "7eea81b2d4da5faaa2b1f9cabb94617298f8c9796e6b51d48dcbaef3731e8e47";
const ROOM_DIRECTOR_SECRET_HASH = "fce690a580915a3ac77ccd7c5e9993de383983f3fe72a107025529826d04a0fe";
const SEAFOOD = ["海老", "帆立", "鮪", "真鯛", "烏賊", "蛸", "蟹", "鮭", "牡蠣", "雲丹", "甘海老", "鰹"];
const allowedOrigins = new Set(["https://g.kazeabc.com", "https://h.kazeabc.com", "http://localhost:5173", "http://localhost:3000"]);
const isAllowedOrigin = (origin: string | null) => !origin || allowedOrigins.has(origin) || origin.endsWith(".vercel.app");
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "https://g.kazeabc.com",
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

const sanitizeSnakeSnapshot = (snapshot: Record<string, unknown>) => {
  const rawSnakes = snapshot.snakes && typeof snapshot.snakes === "object" && !Array.isArray(snapshot.snakes)
    ? snapshot.snakes as Record<string, any> : {};
  const rawFoods = snapshot.foods && typeof snapshot.foods === "object" && !Array.isArray(snapshot.foods)
    ? snapshot.foods as Record<string, any> : {};
  const snakes = Object.fromEntries(Object.entries(rawSnakes).slice(0, 30).filter(([id, snake]) =>
    id.length <= 100 && snake && typeof snake === "object" && snake.id === id && typeof snake.playerId === "string"
  ));
  const foods = Object.fromEntries(Object.entries(rawFoods).slice(0, 600).filter(([id, food]) =>
    id.length <= 100 && food && typeof food === "object" && food.id === id
  ));
  const auditEvents = Array.isArray(snapshot.auditEvents)
    ? snapshot.auditEvents.slice(-200).filter((event: any) =>
      event && typeof event.id === "string" && event.id.length <= 100
      && ["match_started", "word_completed", "sentence_completed", "tail_spill", "match_ended"].includes(event.type)
      && typeof event.at === "number" && Number.isFinite(event.at)
    ) : [];
  return { ...snapshot, id: typeof snapshot.id === "string" ? snapshot.id : "snake-free", snakes, foods, auditEvents };
};

const FOOD_GLYPHS = ["日","本","語","防","災","避","難","水","食","安","全","地","震","津","波","火","山","家","族","守","る","の","に","を","は","が","と"];
const buildDirectorSnake = (entry: any, index: number) => {
  const x = (index + 1) * 190 * (index % 2 === 0 ? 1 : -1);
  const y = (index + 1) * 140 * (index % 2 === 0 ? -1 : 1);
  return {
    id: `snake-${entry.user_id}`, playerId: entry.user_id, nickname: entry.name, baseColor: entry.color,
    head: { x, y }, direction: { x: 1, y: 0 }, target: { x: x + 50, y: y + 50 },
    bodyPath: Array.from({ length: 9 }, (_, bodyIndex) => ({ x: x - bodyIndex * 14, y })),
    bodySegments: [], baseLength: 9, earnedLength: 0, totalLength: 9, currentSpeed: 180,
    heldFoods: [], buildState: { status: "INVALID", candidates: [], sentenceCandidates: [], version: 1 },
    completionHistory: [], isBot: false, connected: true,
  };
};
const buildDirectorFoods = (count = 160) => Object.fromEntries(Array.from({ length: count }, (_, index) => {
  const glyph = FOOD_GLYPHS[index % FOOD_GLYPHS.length];
  const id = `food-${crypto.randomUUID()}`;
  return [id, { id, displayedGlyph: glyph, normalizedGlyph: glyph, type: /[\u3040-\u30ff]/.test(glyph) ? "hiragana" : "kanji", color: `hsl(${(index * 47) % 360} 75% 58%)`, x: (index % 20) * 150 - 1425, y: Math.floor(index / 20) * 150 - 525, collisionRadius: 18, state: "ground", heldByPlayerId: null }];
}));

const PLAYLIST_IDS = ["main", "bousai-toyama", "snake-free", "snake-theme", "snake-disaster"] as const;
const normalizeRoomId = (value: unknown) => {
  const id = value === "snake-samurai" ? "snake-free" : String(value || "main");
  return PLAYLIST_IDS.includes(id as any) ? id : "main";
};
const isSnakeRoom = (roomId: string) => roomId.startsWith("snake-");
const arenaNameFor = (roomId: string) => roomId === "bousai-toyama"
  ? "日本・富山市防災"
  : roomId === "snake-disaster" ? "防灾专场 · 高难度"
  : roomId === "snake-theme" ? "聴風・侍蛇 · 主题"
  : roomId === "snake-free" ? "聴風・侍蛇 · 自由"
  : SEAFOOD[Math.floor(Math.random() * SEAFOOD.length)];

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ ok: false, message: "来源不允许" }), { status: 403, headers });
  }

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey!, { db: { schema: "jec" } });
  const queryRoomId = new URL(req.url).searchParams.get("room");
  const requestedRoomId = normalizeRoomId(queryRoomId);
  const requestedSnakeRoom = isSnakeRoom(requestedRoomId);

  if (req.method === "GET") {
    const [{ data, error }, director] = await Promise.all([
      admin.from("ransen_rooms").select("phase,lobby_ends_at,arena_name,snapshot,updated_at").eq("id", requestedRoomId).maybeSingle(),
      admin.from("game_room_director").select("holder,lease_expires_at,last_seen_at,fallback_active").eq("singleton", true).maybeSingle(),
    ]);
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    const snapshot = requestedSnakeRoom
      ? sanitizeSnakeSnapshot(data?.snapshot || { snakes: {}, foods: {} })
      : sanitizeSnapshot(data?.snapshot || { slimes: [], encounters: [] });
    const matchDuration = requestedSnakeRoom ? 120_000 : 300_000;
    const expired = data?.phase === "PLAYING" && typeof snapshot.startedAt === "number" && Date.now() >= snapshot.startedAt + matchDuration;
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
      directorStatus: director.data?.fallback_active && Date.parse(director.data?.lease_expires_at || "") > Date.now()
        ? "fallback"
        : director.data?.holder === "shanghai-primary" && Date.parse(director.data?.lease_expires_at || "") > Date.now()
          ? "primary" : "offline",
      directorLastSeenAt: director.data?.last_seen_at || null,
    }), { headers });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => ({}));
    const roomId = normalizeRoomId(body.roomId);
    const snakeRoom = isSnakeRoom(roomId);
    if (body.phase !== "PLAYING" && body.phase !== "THEATER") return new Response(JSON.stringify({ ok: false, message: "阶段不允许" }), { status: 400, headers });
    const snapshot = body.snapshot;
    const validSnapshot = snakeRoom
      ? snapshot && snapshot.snakes && typeof snapshot.snakes === "object" && !Array.isArray(snapshot.snakes)
        && Object.keys(snapshot.snakes).length <= 30
        && snapshot.foods && typeof snapshot.foods === "object" && typeof snapshot.startedAt === "number"
        && JSON.stringify(snapshot).length <= 500000
      : snapshot && Array.isArray(snapshot.slimes) && snapshot.slimes.length > 0 && snapshot.slimes.length <= 100
        && Array.isArray(snapshot.encounters) && typeof snapshot.startedAt === "number"
        && JSON.stringify(snapshot).length <= 250000;
    if (!validSnapshot) return new Response(JSON.stringify({ ok: false, message: "战局快照无效" }), { status: 400, headers });

    const sanitizedSnapshot = snakeRoom ? sanitizeSnakeSnapshot(snapshot) : sanitizeSnapshot(snapshot);
    const { data: room, error: readError } = await admin.from("ransen_rooms").select("phase,lobby_ends_at,snapshot").eq("id", roomId).maybeSingle();
    if (readError) return new Response(JSON.stringify({ ok: false, message: readError.message }), { status: 500, headers });
    const deadline = room?.lobby_ends_at ? Date.parse(room.lobby_ends_at) : Number.NaN;
    const mayStart = room?.phase === "LOBBY" && Number.isFinite(deadline) && Date.now() >= deadline - 500;
    const expired = Date.now() >= snapshot.startedAt + (snakeRoom ? 120_000 : 300_000);
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
    return new Response(JSON.stringify({ ok: true, phase: targetPhase, participantCount: snakeRoom ? Object.keys((sanitizedSnapshot as any).snakes).length : (sanitizedSnapshot as any).slimes.length }), { headers });
  }

  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, message: "请求方式不允许" }), { status: 405, headers });
  const body = await req.json().catch(() => ({}));
  const roomId = normalizeRoomId(body.roomId);
  const snakeRoom = isSnakeRoom(roomId);
  const command = String(body.command || "");
  const suppliedDirectorSecret = req.headers.get("x-room-director-secret") || "";
  const isDirector = suppliedDirectorSecret.length >= 32 && await sha256(suppliedDirectorSecret) === ROOM_DIRECTOR_SECRET_HASH;
  const isPublicStart = false;
  const isPublicClaim = false;
  const isPublicJoin = command === "join_lobby" && body.public === true;
  if (!isDirector && !isPublicJoin && await sha256(String(body.password || "")) !== PASSWORD_HASH) {
    return new Response(JSON.stringify({ ok: false, code: "INVALID_PASSWORD", message: "遥控器密码错误" }), { status: 401, headers });
  }

  if (command === "director_heartbeat" || command === "fallback_tick") {
    const holder = command === "fallback_tick" ? "remote-fallback" : "shanghai-primary";
    if (holder === "shanghai-primary" && !isDirector) return new Response(JSON.stringify({ ok: false }), { status: 401, headers });
    const lease = await admin.from("game_room_director").select("holder,fencing_token,lease_expires_at,fallback_active").eq("singleton", true).maybeSingle();
    if (lease.error) return new Response(JSON.stringify({ ok: false, message: lease.error.message }), { status: 500, headers });
    const current = lease.data || { holder: null, fencing_token: 0, lease_expires_at: null, fallback_active: false };
    const expired = !current.lease_expires_at || Date.parse(current.lease_expires_at) <= Date.now();
    if (holder === "shanghai-primary" && current.fallback_active) {
      return new Response(JSON.stringify({ ok: false, code: "REMOTE_TAKEOVER_ACTIVE", message: "等待管理员恢复主控" }), { status: 409, headers });
    }
    if (!expired && current.holder !== holder) {
      return new Response(JSON.stringify({ ok: false, code: "DIRECTOR_BUSY", message: "场次主控正在工作" }), { status: 409, headers });
    }
    const fencingToken = current.holder === holder ? Number(current.fencing_token) : Number(current.fencing_token) + 1;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 15_000).toISOString();
    const leaseWrite = await admin.from("game_room_director").update({
      holder, fencing_token: fencingToken, lease_expires_at: leaseExpiresAt,
      last_seen_at: now.toISOString(), fallback_active: holder === "remote-fallback", updated_at: now.toISOString(),
    }).eq("singleton", true).eq("fencing_token", current.fencing_token).select("fencing_token").maybeSingle();
    if (leaseWrite.error) return new Response(JSON.stringify({ ok: false, message: leaseWrite.error.message }), { status: 500, headers });
    if (!leaseWrite.data) return new Response(JSON.stringify({ ok: false, code: "LEASE_CHANGED" }), { status: 409, headers });

    const sweep = await admin.rpc("sweep_game_lobbies", { p_now: now.toISOString() });
    if (sweep.error) return new Response(JSON.stringify({ ok: false, message: sweep.error.message }), { status: 500, headers });

    const playlists = await admin.from("game_playlists").select("id,enabled,title").order("sort_order");
    if (playlists.error) return new Response(JSON.stringify({ ok: false, message: playlists.error.message }), { status: 500, headers });
    const states: any[] = [];
    for (const playlist of playlists.data || []) {
      const room = await admin.from("ransen_rooms").select("phase,lobby_ends_at,snapshot").eq("id", playlist.id).maybeSingle();
      if (room.error) return new Response(JSON.stringify({ ok: false, message: room.error.message }), { status: 500, headers });
      if (playlist.enabled && (!room.data || room.data.phase === "OFF" || room.data.phase === "THEATER")) {
        const matchId = crypto.randomUUID();
        const snake = isSnakeRoom(playlist.id);
        const snapshot = snake
          ? { id: playlist.id, matchId, mode: playlist.id === "snake-disaster" ? "disaster" : playlist.id === "snake-theme" ? "random" : "free", theme: playlist.id === "snake-disaster" ? "disaster" : "free", snakes: {}, foods: {} }
          : { matchId, slimes: [], encounters: [] };
        const roomState = { phase: "LOBBY", lobby_ends_at: null, arena_name: arenaNameFor(playlist.id), snapshot, updated_at: now.toISOString() };
        const write = await admin.from("ransen_rooms").upsert({ id: playlist.id, ...roomState }, { onConflict: "id" });
        if (write.error) return new Response(JSON.stringify({ ok: false, message: write.error.message }), { status: 500, headers });
        await admin.from("ransen_players").delete().eq("room_id", playlist.id);
        await admin.from("game_matches").insert({ id: matchId, playlist_id: playlist.id, phase: "WAITING", fencing_token: fencingToken, snapshot });
        states.push({ playlistId: playlist.id, phase: "LOBBY", lobbyEndsAt: null, matchId });
      } else {
        states.push({ playlistId: playlist.id, phase: playlist.enabled ? room.data?.phase || "OFF" : "OFF", lobbyEndsAt: room.data?.lobby_ends_at || null, matchId: room.data?.snapshot?.matchId || null });
      }
    }
    return new Response(JSON.stringify({ ok: true, holder, fencingToken, leaseExpiresAt, playlists: states }), { headers });
  }

  if (command === "pause_playlist" || command === "resume_playlist") {
    const enabled = command === "resume_playlist";
    const update = await admin.from("game_playlists").update({ enabled, updated_at: new Date().toISOString() }).eq("id", roomId);
    if (update.error) return new Response(JSON.stringify({ ok: false, message: update.error.message }), { status: 500, headers });
    if (!enabled) await admin.from("ransen_rooms").update({ phase: "OFF", lobby_ends_at: null, updated_at: new Date().toISOString() }).eq("id", roomId).in("phase", ["LOBBY", "OFF"]);
    return new Response(JSON.stringify({ ok: true, persisted: true, message: enabled ? "该场次已恢复" : "该场次已暂停" }), { headers });
  }

  if (command === "takeover" || command === "restore_primary") {
    const lease = await admin.from("game_room_director").select("fencing_token").eq("singleton", true).single();
    if (lease.error) return new Response(JSON.stringify({ ok: false, message: lease.error.message }), { status: 500, headers });
    const fallback = command === "takeover";
    const update = await admin.from("game_room_director").update({
      holder: fallback ? "remote-fallback" : null,
      fencing_token: Number(lease.data.fencing_token) + 1,
      lease_expires_at: fallback ? new Date(Date.now() + 15_000).toISOString() : new Date(0).toISOString(),
      last_seen_at: new Date().toISOString(), fallback_active: fallback, updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    if (update.error) return new Response(JSON.stringify({ ok: false, message: update.error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ ok: true, persisted: true, message: fallback ? "遥控器已临时接管" : "主控恢复已允许" }), { headers });
  }

  if (isPublicJoin) {
    const player = body.player || {};
    const validPlayer = typeof player.id === "string" && /^[0-9a-f-]{36}$/i.test(player.id)
      && typeof player.name === "string" && player.name.trim().length >= 1 && player.name.trim().length <= 24
      && typeof player.color === "string" && /^#[0-9a-fA-F]{6}$/.test(player.color);
    if (!validPlayer) return new Response(JSON.stringify({ ok: false, message: "玩家资料无效" }), { status: 400, headers });
    const room = await admin.from("ransen_rooms").select("phase,lobby_ends_at,snapshot,arena_name").eq("id", roomId).maybeSingle();
    if (room.error) return new Response(JSON.stringify({ ok: false, message: room.error.message }), { status: 500, headers });
    const now = new Date();
    const registration = await admin.rpc("register_game_presence", {
      p_room_id: roomId,
      p_user_id: player.id,
      p_name: player.name.trim(),
      p_color: player.color,
      p_is_spectator: Boolean(player.isSpectator),
      p_now: now.toISOString(),
    });
    if (registration.error) return new Response(JSON.stringify({ ok: false, message: registration.error.message }), { status: 500, headers });
    const registered = registration.data || {};
    if (!registered.ok) return new Response(JSON.stringify(registered), { status: registered.code === "ROOM_OFF" ? 409 : 400, headers });
    if (registered.phase === "PLAYING" || registered.phase === "THEATER") {
      return new Response(JSON.stringify({
        ...registered, admitted: true, arenaName: room.data?.arena_name,
        matchId: room.data?.snapshot?.matchId || null,
        snapshot: requestedSnakeRoom ? sanitizeSnakeSnapshot(room.data?.snapshot || {}) : sanitizeSnapshot(room.data?.snapshot || {}),
        serverNow: now.toISOString(),
      }), { headers });
    }
    const roster = await admin.from("ransen_players").select("user_id,is_spectator,joined_at").eq("room_id", roomId)
      .gte("last_seen", new Date(Date.now() - 15_000).toISOString()).order("joined_at", { ascending: true });
    if (roster.error) return new Response(JSON.stringify({ ok: false, message: roster.error.message }), { status: 500, headers });
    const audience = roster.data || [];
    const audienceIndex = audience.findIndex((entry: any) => entry.user_id === player.id);
    const participantIndex = audience.filter((entry: any) => !entry.is_spectator).findIndex((entry: any) => entry.user_id === player.id);
    const admitted = audienceIndex >= 0 && audienceIndex < 19 && (player.isSpectator || (participantIndex >= 0 && participantIndex < 13));
    console.log(JSON.stringify({ event: "join_lobby", roomId, matchId: room.data?.snapshot?.matchId || null, admitted, playerCount: audience.filter((entry: any) => !entry.is_spectator).length }));
    return new Response(JSON.stringify({ ok: admitted, admitted, role: registered.role, phase: "LOBBY", lobbyEndsAt: registered.lobbyEndsAt, matchId: room.data?.snapshot?.matchId || null, playerCount: Math.min(13, audience.filter((entry: any) => !entry.is_spectator).length), audienceCount: Math.min(19, audience.length), message: admitted ? "已登记" : "本场人数已满，可以观看或等待下一场" }), { status: admitted ? 200 : 409, headers });
  }

  if (command === "claim_start") {
    const lease = await admin.from("game_room_director").select("holder,fencing_token,lease_expires_at,fallback_active").eq("singleton", true).single();
    if (lease.error) return new Response(JSON.stringify({ ok: false, message: lease.error.message }), { status: 500, headers });
    const expectedHolder = isDirector ? "shanghai-primary" : "remote-fallback";
    if (lease.data.holder !== expectedHolder || Boolean(lease.data.fallback_active) !== !isDirector
      || Date.parse(lease.data.lease_expires_at || "") <= Date.now()
      || Number(body.fencingToken) !== Number(lease.data.fencing_token)) {
      return new Response(JSON.stringify({ ok: false, code: "STALE_DIRECTOR", message: "场次主控已变更" }), { status: 409, headers });
    }
    const snapshot = body.snapshot;
    const validSnapshot = snakeRoom
      ? snapshot && snapshot.snakes && typeof snapshot.snakes === "object" && !Array.isArray(snapshot.snakes)
        && Object.keys(snapshot.snakes).length <= 30
        && snapshot.foods && typeof snapshot.foods === "object" && typeof snapshot.startedAt === "number"
        && JSON.stringify(snapshot).length <= 500000
      : snapshot && Array.isArray(snapshot.slimes) && snapshot.slimes.length > 0 && snapshot.slimes.length <= 30
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

    const roster = await admin.from("ransen_players").select("user_id,name,color,is_spectator,joined_at").eq("room_id", roomId)
      .gte("last_seen", new Date(Date.now() - 15_000).toISOString()).order("joined_at", { ascending: true }).limit(19);
    if (roster.error) return new Response(JSON.stringify({ ok: false, message: roster.error.message }), { status: 500, headers });
    const participants = (roster.data || []).filter((entry: any) => !entry.is_spectator).slice(0, 13);
    if (participants.length === 0) {
      await admin.from("ransen_rooms").update({ lobby_ends_at: null, updated_at: new Date().toISOString() })
        .eq("id", roomId).eq("phase", "LOBBY").eq("lobby_ends_at", room.lobby_ends_at);
      if (snapshot.matchId) await admin.from("game_matches").update({ phase: "WAITING", lobby_ends_at: null, updated_at: new Date().toISOString() }).eq("id", snapshot.matchId);
      console.log(JSON.stringify({ event: "claim_skipped", roomId, matchId: snapshot.matchId || null, reason: "NO_PLAYERS" }));
      return new Response(JSON.stringify({ ok: true, skipped: true, code: "NO_PLAYERS", message: "无人在线，已重置候场" }), { headers });
    }
    const serverStartedAt = Date.now();
    if (snakeRoom) {
      const submittedSnakes = snapshot.snakes as Record<string, any>;
      const humanSnakes = Object.fromEntries(participants.map((entry: any, index: number) => {
        const id = `snake-${entry.user_id}`;
        const submitted = submittedSnakes[id];
        const base = submitted || buildDirectorSnake(entry, index);
        return [id, {
          ...base, id, playerId: entry.user_id, nickname: entry.name,
          baseColor: entry.color, isBot: false, connected: true,
        }];
      }));
      const submittedBots = Object.values(submittedSnakes).filter((snake: any) => snake?.isBot);
      const manualBots = submittedBots.filter((snake: any) => snake.botOrigin === "manual").slice(0, 12);
      const automaticBots = participants.length === 1
        ? submittedBots.filter((snake: any) => snake.botOrigin !== "manual").slice(0, 3)
        : [];
      const generatedBots = participants.length === 1 && automaticBots.length === 0
        ? Array.from({ length: 3 }, (_, index) => {
          const entry = { user_id: `auto-bot-${index + 1}`, name: `Bot ${index + 1}`, color: ["#f59e0b", "#8b5cf6", "#10b981"][index] };
          return { ...buildDirectorSnake(entry, index + 1), isBot: true, connected: true, botOrigin: "automatic", botLevel: index + 1 };
        }) : [];
      const bots = Object.fromEntries([...manualBots, ...automaticBots, ...generatedBots].map((snake: any) => [snake.id, snake]));
      const sanitizedSnapshot = sanitizeSnakeSnapshot({
        ...snapshot, snakes: { ...humanSnakes, ...bots }, foods: Object.keys(snapshot.foods || {}).length ? snapshot.foods : buildDirectorFoods(), startedAt: serverStartedAt,
        endsAt: serverStartedAt + 120_000,
      });
      const { data: claimed, error: claimError } = await admin.from("ransen_rooms").update({
        phase: "PLAYING", lobby_ends_at: null, snapshot: sanitizedSnapshot, updated_at: new Date().toISOString(),
      }).eq("id", roomId).eq("phase", "LOBBY").eq("lobby_ends_at", room.lobby_ends_at).select("id").maybeSingle();
      if (claimError) return new Response(JSON.stringify({ ok: false, message: claimError.message }), { status: 500, headers });
      if (!claimed) return new Response(JSON.stringify({ ok: false, code: "CLAIM_LOST", message: "其他设备已创建战局" }), { status: 409, headers });
      if (snapshot.matchId) await admin.from("game_matches").update({ phase: "PLAYING", started_at: new Date(serverStartedAt).toISOString(), snapshot: sanitizedSnapshot, updated_at: new Date().toISOString() }).eq("id", snapshot.matchId);
      console.log(JSON.stringify({ event: "claim_start", roomId, matchId: snapshot.matchId || null, participantCount: participants.length, botCount: Object.values(bots).length }));
      return new Response(JSON.stringify({ ok: true, phase: "PLAYING", claimed: true, arenaName: room.arena_name, startedAt: serverStartedAt, snapshot: sanitizedSnapshot, serverNow: new Date().toISOString() }), { headers });
    }
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
    const manualBots = submittedBots.filter((slime: any) => slime.botOrigin === "manual");
    const automaticBots = participants.length === 1 ? submittedBots.filter((slime: any) => slime.botOrigin !== "manual").slice(0, 3) : [];
    const sanitizedSnapshot = sanitizeSnapshot({ ...snapshot, slimes: [...humanSlimes, ...manualBots, ...automaticBots], encounters: [], startedAt: serverStartedAt });
    const { data: claimed, error: claimError } = await admin.from("ransen_rooms").update({
      phase: "PLAYING",
      lobby_ends_at: null,
      snapshot: sanitizedSnapshot,
      updated_at: new Date().toISOString(),
    }).eq("id", roomId).eq("phase", "LOBBY").eq("lobby_ends_at", room.lobby_ends_at).select("id").maybeSingle();
    if (claimError) return new Response(JSON.stringify({ ok: false, message: claimError.message }), { status: 500, headers });
    if (!claimed) return new Response(JSON.stringify({ ok: false, code: "CLAIM_LOST", message: "其他设备已创建战局" }), { status: 409, headers });
    if (snapshot.matchId) await admin.from("game_matches").update({ phase: "PLAYING", started_at: new Date(serverStartedAt).toISOString(), snapshot: sanitizedSnapshot, updated_at: new Date().toISOString() }).eq("id", snapshot.matchId);
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
  const lobbyEndsAt = command === "off" ? null : new Date(now.getTime() + 25_000).toISOString();
  const current = await admin.from("ransen_rooms").select("phase,arena_name").eq("id", roomId).maybeSingle();
  if (current.error) return new Response(JSON.stringify({ ok: false, message: current.error.message }), { status: 500, headers });
  if (isPublicStart && current.data && current.data.phase !== "OFF" && current.data.phase !== "THEATER") {
    return new Response(JSON.stringify({ ok: false, message: "场次已开启，请直接加入" }), { status: 409, headers });
  }

  const arenaName = command === "on" ? arenaNameFor(roomId) : current.data?.arena_name || arenaNameFor(roomId);
  const roomState = {
    phase: phases[command],
    lobby_ends_at: lobbyEndsAt,
    arena_name: arenaName,
    snapshot: snakeRoom ? { id: roomId, matchId: crypto.randomUUID(), snakes: {}, foods: {} } : { matchId: crypto.randomUUID(), slimes: [], encounters: [] },
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

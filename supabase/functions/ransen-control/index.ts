import { withEdgeUsage } from "../_shared/game-usage.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const PASSWORD_HASH = "7eea81b2d4da5faaa2b1f9cabb94617298f8c9796e6b51d48dcbaef3731e8e47";
const ROOM_DIRECTOR_SECRET_HASH = "fce690a580915a3ac77ccd7c5e9993de383983f3fe72a107025529826d04a0fe";
const SEAFOOD = ["海老", "帆立", "鮪", "真鯛", "烏賊", "蛸", "蟹", "鮭", "牡蠣", "雲丹", "甘海老", "鰹"];
const allowedOrigins = new Set(["https://g.kazeabc.com", "https://h.kazeabc.com", "http://localhost:5173", "http://localhost:3000"]);
const isAllowedOrigin = (origin: string | null) => !origin || allowedOrigins.has(origin) || origin.endsWith(".vercel.app");
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "https://g.kazeabc.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-room-director-secret, x-game-fallback-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
});
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};
const sanitizeSnapshot = (snapshot: Record<string, unknown>, disaster = false) => {
  const slimes = Array.isArray(snapshot.slimes) ? snapshot.slimes : [];
  const liveIds = new Set(slimes.filter((slime: any) => !slime?.isDead && typeof slime?.id === "string").map((slime: any) => slime.id));
  const encounters = Array.isArray(snapshot.encounters)
    ? snapshot.encounters.filter((encounter: any) => !encounter?.resolved && liveIds.has(encounter?.slime1Id) && liveIds.has(encounter?.slime2Id) && (!disaster || encounter?.question?.level === "防災"))
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

Deno.serve(withEdgeUsage(async (req, usage) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ ok: false, message: "来源不允许" }), { status: 403, headers });
  }

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey!, { db: { schema: "jec" }, global: { fetch: usage.fetch } });
  const queryRoomId = new URL(req.url).searchParams.get("room");
  const requestedRoomId = normalizeRoomId(queryRoomId);
  const requestedSnakeRoom = isSnakeRoom(requestedRoomId);

  if (req.method === "GET") {
    if (new URL(req.url).searchParams.get("route") === "1") {
      const route = await admin.from("game_room_director").select("host_mode,fencing_token").eq("singleton", true).single();
      if (route.error) return new Response(JSON.stringify({ ok: false, code: "HOST_MODE_UNAVAILABLE" }), { status: 503, headers });
      return new Response(JSON.stringify({ ok: true, hostMode: route.data.host_mode, fencingToken: Number(route.data.fencing_token) }), { headers });
    }
    const [{ data, error }, director] = await Promise.all([
      admin.from("ransen_rooms").select("phase,lobby_ends_at,arena_name,snapshot,updated_at").eq("id", requestedRoomId).maybeSingle(),
      admin.from("game_room_director").select("holder,lease_expires_at,last_seen_at,fallback_active").eq("singleton", true).maybeSingle(),
    ]);
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    const snapshot = requestedSnakeRoom
      ? sanitizeSnakeSnapshot(data?.snapshot || { snakes: {}, foods: {} })
      : sanitizeSnapshot(data?.snapshot || { slimes: [], encounters: [] }, requestedRoomId === "bousai-toyama");
    const phase = data?.phase || "OFF";
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
    const primarySecret = req.headers.get("x-room-director-secret") || "";
    const fallbackSecret = req.headers.get("x-game-fallback-secret") || "";
    const fallbackHash = Deno.env.get("GAME_FALLBACK_SECRET_HASH") || "";
    const primaryHost = primarySecret.length >= 32 && await sha256(primarySecret) === ROOM_DIRECTOR_SECRET_HASH;
    const fallbackHost = fallbackHash.length === 64 && fallbackSecret.length >= 32 && await sha256(fallbackSecret) === fallbackHash;
    if (!primaryHost && !fallbackHost) return new Response(JSON.stringify({ ok: false, code: "TRUSTED_HOST_REQUIRED" }), { status: 403, headers });
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

    const sanitizedSnapshot = snakeRoom ? sanitizeSnakeSnapshot(snapshot) : sanitizeSnapshot(snapshot, roomId === "bousai-toyama");
    const committed = await admin.rpc("commit_game_snapshot", {
      p_room_id: roomId, p_holder: primaryHost ? "shanghai-primary" : "korea-fallback",
      p_fencing_token: body.fencingToken, p_phase: body.phase, p_snapshot: sanitizedSnapshot,
    });
    if (committed.error) return new Response(JSON.stringify({ ok: false, message: committed.error.message }), { status: 500, headers });
    return new Response(JSON.stringify(committed.data), { status: committed.data?.ok ? 200 : 409, headers });
  }

  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, message: "请求方式不允许" }), { status: 405, headers });
  const body = await req.json().catch(() => ({}));
  const roomId = normalizeRoomId(body.roomId);
  const snakeRoom = isSnakeRoom(roomId);
  const command = String(body.command || "");
  const suppliedDirectorSecret = req.headers.get("x-room-director-secret") || "";
  const isDirector = suppliedDirectorSecret.length >= 32 && await sha256(suppliedDirectorSecret) === ROOM_DIRECTOR_SECRET_HASH;
  const suppliedFallbackSecret = req.headers.get("x-game-fallback-secret") || "";
  const fallbackHash = Deno.env.get("GAME_FALLBACK_SECRET_HASH") || "";
  const isFallbackHost = fallbackHash.length === 64 && suppliedFallbackSecret.length >= 32
    && await sha256(suppliedFallbackSecret) === fallbackHash;
  const trustedHost = isDirector || isFallbackHost;
  const isPublicStart = false;
  const isPublicClaim = false;
  const isPublicJoin = command === "join_lobby" && body.public === true;
  if (!trustedHost && await sha256(String(body.password || "")) !== PASSWORD_HASH) {
    return new Response(JSON.stringify({ ok: false, code: "INVALID_PASSWORD", message: "遥控器密码错误" }), { status: 401, headers });
  }

  if (command === "host_bootstrap" || command === "host_acquire" || command === "host_start") {
    if (!trustedHost) return new Response(JSON.stringify({ ok: false, code: "TRUSTED_HOST_REQUIRED" }), { status: 403, headers });
    if (command === "host_acquire" || command === "host_start") {
      const acquired = await admin.rpc(command === "host_start" ? "start_game_host" : "acquire_game_host", {
        p_holder: isDirector ? "shanghai-primary" : "korea-fallback",
        p_mode: isDirector ? "shanghai" : body.hostMode,
        p_expected_fence: body.fencingToken,
      });
      if (acquired.error) return new Response(JSON.stringify({ ok: false, message: acquired.error.message }), { status: 500, headers });
      return new Response(JSON.stringify(acquired.data), { status: acquired.data?.ok ? 200 : 409, headers });
    }
    const [rooms, playlists, lease] = await Promise.all([
      admin.from("ransen_rooms").select("id,phase,lobby_ends_at,arena_name,snapshot"),
      admin.from("game_playlists").select("id,enabled,title").order("sort_order"),
      admin.from("game_room_director").select("holder,fencing_token,host_mode,designated_player_id,lease_expires_at").eq("singleton", true).single(),
    ]);
    const error = rooms.error || playlists.error || lease.error;
    if (error) return new Response(JSON.stringify({ ok: false, message: error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ ok: true, rooms: rooms.data, playlists: playlists.data, lease: lease.data }), { headers });
  }

  if (command === "host_roster") {
    if (!trustedHost) return new Response(JSON.stringify({ ok: false, code: "TRUSTED_HOST_REQUIRED" }), { status: 403, headers });
    const result = await admin.rpc("sync_game_lobby", {
      p_room_id: roomId, p_holder: isDirector ? "shanghai-primary" : "korea-fallback",
      p_fencing_token: body.fencingToken, p_players: body.players, p_match_id: body.matchId,
    });
    if (result.error) return new Response(JSON.stringify({ ok: false, message: result.error.message }), { status: 500, headers });
    return new Response(JSON.stringify(result.data), { status: result.data?.ok ? 200 : 409, headers });
  }

  // Legacy browser registrations and election-era ticks cannot renew a host
  // or mutate an idle room. The authenticated game service owns these paths.
  if (isPublicJoin || command === "claim_start" || command === "director_heartbeat" || command === "fallback_tick") {
    return new Response(JSON.stringify({ ok: false, code: "USE_TRUSTED_GAME_SERVICE" }), { status: 409, headers });
  }

  if (command === "pause_playlist" || command === "resume_playlist") {
    const enabled = command === "resume_playlist";
    const update = await admin.from("game_playlists").update({ enabled, updated_at: new Date().toISOString() }).eq("id", roomId);
    if (update.error) return new Response(JSON.stringify({ ok: false, message: update.error.message }), { status: 500, headers });
    if (!enabled) {
      const roomUpdate = await admin.from("ransen_rooms").update({ phase: "OFF", lobby_ends_at: null, updated_at: new Date().toISOString() }).eq("id", roomId).in("phase", ["LOBBY", "OFF"]);
      if (roomUpdate.error) {
        return new Response(JSON.stringify({
          ok: false,
          persisted: true,
          code: "ROOM_PAUSE_PARTIAL_FAILURE",
          playlistEnabled: false,
          roomUpdated: false,
          message: `场次已禁用，但房间状态更新失败：${roomUpdate.error.message}`,
        }), { status: 500, headers });
      }
    }
    return new Response(JSON.stringify({ ok: true, persisted: true, message: enabled ? "该场次已恢复" : "该场次已暂停" }), { headers });
  }

  if (command === "takeover" || command === "restore_primary" || command === "enable_player_host") {
    if (trustedHost) return new Response(JSON.stringify({ ok: false, code: "ADMIN_PASSWORD_REQUIRED" }), { status: 403, headers });
    const mode = command === "restore_primary" ? "shanghai" : command === "takeover" ? "fallback" : "player";
    const playerId = mode === "player" ? body.designatedPlayerId : null;
    if (mode === "player" && (typeof playerId !== "string" || !/^[0-9a-f-]{36}$/i.test(playerId))) {
      return new Response(JSON.stringify({ ok: false, code: "PLAYER_REQUIRED" }), { status: 400, headers });
    }
    const changed = await admin.rpc("set_game_host_mode", { p_mode: mode, p_player_id: playerId });
    if (changed.error) return new Response(JSON.stringify({ ok: false, message: changed.error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ ...changed.data, persisted: Boolean(changed.data?.ok) }), { status: changed.data?.ok ? 200 : 409, headers });
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
}));

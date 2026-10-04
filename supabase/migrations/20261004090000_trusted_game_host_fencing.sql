-- Guest browser state is never a hosting grant. Only trusted services may
-- acquire a lease or atomically persist a snapshot under its current fence.
alter table jec.game_room_director
  add column if not exists host_mode text not null default 'shanghai'
    check (host_mode in ('shanghai', 'fallback', 'player')),
  add column if not exists designated_player_id uuid;
update jec.game_room_director set host_mode = 'fallback'
  where fallback_active and host_mode = 'shanghai';

create or replace function jec.acquire_game_host(
  p_holder text, p_mode text, p_expected_fence bigint
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  lease jec.game_room_director%rowtype;
  token bigint;
begin
  select * into lease from jec.game_room_director where singleton for update;
  if not found or lease.host_mode <> p_mode
    or lease.fencing_token <> p_expected_fence
    or (p_mode = 'shanghai' and p_holder <> 'shanghai-primary')
    or (p_mode in ('fallback', 'player') and p_holder <> 'korea-fallback')
    or p_mode not in ('shanghai', 'fallback', 'player')
    or (lease.holder is not null and lease.holder <> p_holder
        and lease.lease_expires_at > clock_timestamp()) then
    return jsonb_build_object('ok', false, 'code', 'STALE_HOST');
  end if;
  token := lease.fencing_token;
  if lease.holder is distinct from p_holder
      or lease.lease_expires_at is null or lease.lease_expires_at <= clock_timestamp() then
    token := token + 1;
  end if;
  update jec.game_room_director set
    holder = p_holder, fencing_token = token,
    lease_expires_at = clock_timestamp() + interval '45 seconds',
    last_seen_at = clock_timestamp(), updated_at = clock_timestamp()
    where singleton;
  return jsonb_build_object('ok', true, 'fencingToken', token,
    'leaseExpiresAt', clock_timestamp() + interval '45 seconds',
    'hostMode', p_mode, 'designatedPlayerId', lease.designated_player_id);
end;
$$;

create or replace function jec.set_game_host_mode(p_mode text, p_player_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare token bigint;
begin
  if p_mode not in ('shanghai', 'fallback', 'player')
    or (p_mode = 'player' and p_player_id is null)
    or (p_mode <> 'player' and p_player_id is not null) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MODE');
  end if;
  perform 1 from jec.game_room_director where singleton for update;
  update jec.game_room_director set
    host_mode = p_mode, designated_player_id = p_player_id,
    holder = null, fencing_token = fencing_token + 1,
    lease_expires_at = 'epoch', fallback_active = p_mode <> 'shanghai',
    updated_at = clock_timestamp()
    where singleton returning fencing_token into token;
  return jsonb_build_object('ok', true, 'fencingToken', token, 'hostMode', p_mode);
end;
$$;

create or replace function jec.commit_game_snapshot(
  p_room_id text, p_holder text, p_fencing_token bigint,
  p_phase text, p_snapshot jsonb
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  lease jec.game_room_director%rowtype;
  room jec.ransen_rooms%rowtype;
begin
  -- Switching mode and snapshot commit lock the same row. A checked lease
  -- cannot become stale between authorization and the room UPDATE.
  select * into lease from jec.game_room_director where singleton for update;
  if not found or lease.holder is distinct from p_holder
    or lease.fencing_token <> p_fencing_token
    or lease.lease_expires_at is null or lease.lease_expires_at <= clock_timestamp()
    or (lease.host_mode = 'shanghai' and p_holder <> 'shanghai-primary')
    or (lease.host_mode in ('fallback', 'player') and p_holder <> 'korea-fallback') then
    return jsonb_build_object('ok', false, 'code', 'STALE_HOST');
  end if;
  select * into room from jec.ransen_rooms where id = p_room_id for update;
  if not found or p_room_id not in ('main','bousai-toyama','snake-free','snake-theme','snake-disaster')
    or p_phase not in ('PLAYING', 'THEATER')
    or jsonb_typeof(p_snapshot) <> 'object'
    or coalesce(p_snapshot->>'matchId', '') = ''
    or p_snapshot->>'matchId' is distinct from room.snapshot->>'matchId'
    or not ((room.phase = 'PLAYING' and p_phase in ('PLAYING','THEATER'))
      or (room.phase = 'THEATER' and p_phase = 'THEATER')
      or (room.phase = 'LOBBY' and p_phase = 'PLAYING'
          and room.lobby_ends_at is not null
          and room.lobby_ends_at <= clock_timestamp())) then
    return jsonb_build_object('ok', false, 'code', 'STALE_ROUND');
  end if;
  if room.phase = 'THEATER' then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;
  update jec.ransen_rooms set phase = p_phase, snapshot = p_snapshot,
    lobby_ends_at = null, updated_at = clock_timestamp()
    where id = p_room_id;
  update jec.game_matches set phase = p_phase, snapshot = p_snapshot,
    fencing_token = p_fencing_token,
    started_at = coalesce(started_at, to_timestamp((p_snapshot->>'startedAt')::double precision / 1000)),
    ended_at = case when p_phase = 'THEATER' then clock_timestamp() else ended_at end,
    updated_at = clock_timestamp()
    where id::text = p_snapshot->>'matchId';
  return jsonb_build_object('ok', true, 'phase', p_phase);
end;
$$;

revoke all on function jec.acquire_game_host(text,text,bigint) from public, anon, authenticated;
revoke all on function jec.set_game_host_mode(text,uuid) from public, anon, authenticated;
revoke all on function jec.commit_game_snapshot(text,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function jec.acquire_game_host(text,text,bigint) to service_role;
grant execute on function jec.set_game_host_mode(text,uuid) to service_role;
grant execute on function jec.commit_game_snapshot(text,text,bigint,text,jsonb) to service_role;

-- The connected roster is reconciled on join/leave, never on a timer. Only
-- the holder of the current lease may supply identities proved by its socket.
create or replace function jec.sync_game_lobby(
  p_room_id text, p_holder text, p_fencing_token bigint, p_players jsonb,
  p_match_id uuid
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  lease jec.game_room_director%rowtype;
  room jec.ransen_rooms%rowtype;
  participant_count integer;
  deadline timestamptz;
begin
  select * into lease from jec.game_room_director where singleton for update;
  if not found or lease.holder is distinct from p_holder
    or lease.fencing_token <> p_fencing_token
    or lease.lease_expires_at is null or lease.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'STALE_HOST');
  end if;
  select * into room from jec.ransen_rooms where id = p_room_id for update;
  if not found or not exists (select 1 from jec.game_playlists where id = p_room_id and enabled) then
    return jsonb_build_object('ok', false, 'code', 'PLAYLIST_DISABLED');
  end if;
  if room.phase = 'PLAYING' then
    return jsonb_build_object('ok', false, 'code', 'ROUND_ALREADY_STARTED');
  end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) > 19
    or exists (select 1 from jsonb_array_elements(p_players) entry
      where coalesce(entry->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(entry->>'name','') = '' or char_length(entry->>'name') > 24
        or coalesce(entry->>'color','') !~ '^#[0-9a-fA-F]{6}$') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROSTER');
  end if;
  select count(*) into participant_count from jsonb_array_elements(p_players) entry
    where not coalesce((entry->>'isSpectator')::boolean, true);
  if participant_count > 13 then
    return jsonb_build_object('ok', false, 'code', 'ROOM_FULL');
  end if;
  if room.phase in ('OFF','THEATER') and participant_count > 0 then
    update jec.game_matches set phase = 'CLOSED', updated_at = clock_timestamp()
      where playlist_id = p_room_id and phase in ('WAITING','LOBBY');
    update jec.ransen_rooms set phase = 'LOBBY',
      snapshot = jsonb_build_object('matchId', p_match_id, 'slimes', '[]'::jsonb, 'encounters', '[]'::jsonb,
        'snakes', '{}'::jsonb, 'foods', '{}'::jsonb),
      lobby_ends_at = null, updated_at = clock_timestamp() where id = p_room_id;
    insert into jec.game_matches (id,playlist_id,phase,fencing_token,snapshot)
      values (p_match_id,p_room_id,'WAITING',p_fencing_token,jsonb_build_object('matchId',p_match_id));
    select * into room from jec.ransen_rooms where id = p_room_id;
  end if;
  if room.phase <> 'LOBBY' then
    return jsonb_build_object('ok', true, 'phase', room.phase, 'lobbyEndsAt', null, 'matchId', room.snapshot->>'matchId');
  end if;
  delete from jec.ransen_players where room_id = p_room_id;
  insert into jec.ransen_players (room_id,user_id,name,color,is_spectator,last_seen)
    select p_room_id,(entry->>'id')::uuid,entry->>'name',entry->>'color',
      coalesce((entry->>'isSpectator')::boolean,true),clock_timestamp()
    from jsonb_array_elements(p_players) entry;
  deadline := case when participant_count = 0 then null
    else coalesce(room.lobby_ends_at,clock_timestamp() + interval '25 seconds') end;
  update jec.ransen_rooms set lobby_ends_at = deadline, updated_at = clock_timestamp() where id = p_room_id;
  update jec.game_matches set phase = case when deadline is null then 'WAITING' else 'LOBBY' end,
    lobby_ends_at = deadline, updated_at = clock_timestamp()
    where playlist_id = p_room_id and phase in ('WAITING','LOBBY');
  return jsonb_build_object('ok', true, 'phase', 'LOBBY', 'lobbyEndsAt', deadline, 'matchId', room.snapshot->>'matchId');
end;
$$;
revoke all on function jec.sync_game_lobby(text,text,bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function jec.sync_game_lobby(text,text,bigint,jsonb,uuid) to service_role;

-- A trusted process must fence packets from its previous incarnation before
-- accepting sessions. Called once after binding the service ports, not on idle ticks.
create or replace function jec.start_game_host(p_holder text, p_mode text, p_expected_fence bigint)
returns jsonb language plpgsql security definer set search_path = jec, pg_temp as $$
declare d jec.game_room_director%rowtype; t timestamptz := clock_timestamp();
begin
  select * into d from jec.game_room_director where singleton = true for update;
  if d.host_mode <> p_mode or d.fencing_token <> p_expected_fence
    or not ((p_holder='shanghai-primary' and p_mode='shanghai') or (p_holder='korea-fallback' and p_mode in ('fallback','player')))
  then return jsonb_build_object('ok',false,'code','STALE_HOST_START'); end if;
  update jec.game_room_director set holder=p_holder,fencing_token=d.fencing_token+1,
    lease_expires_at=t+interval '45 seconds',last_seen_at=t,updated_at=t where singleton=true;
  return jsonb_build_object('ok',true,'fencingToken',d.fencing_token+1,'leaseExpiresAt',t+interval '45 seconds');
end $$;
revoke all on function jec.start_game_host(text,text,bigint) from public,anon,authenticated;
grant execute on function jec.start_game_host(text,text,bigint) to service_role;

-- The legacy SECURITY DEFINER election must not remain an alternate browser path.
do $$
begin
  if to_regprocedure('jec.ransen_claim_host(text)') is not null then
    execute 'revoke all on function jec.ransen_claim_host(text) from public,anon,authenticated';
  end if;
end $$;
revoke insert,update,delete on jec.ransen_rooms,jec.ransen_players from anon,authenticated;

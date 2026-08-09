create index if not exists ransen_players_user_id_idx
  on jec.ransen_players (user_id);
create index if not exists ransen_players_room_role_seen_idx
  on jec.ransen_players (room_id, is_spectator, last_seen desc);

create or replace function jec.register_game_presence(
  p_room_id text,
  p_user_id uuid,
  p_name text,
  p_color text,
  p_is_spectator boolean,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_room text;
  target_room jec.ransen_rooms%rowtype;
  active_players integer := 0;
  active_audience integer := 0;
  deadline timestamptz;
  role_name text := 'spectator';
begin
  -- Serialize switches and countdown changes for the five managed playlists.
  perform 1 from jec.ransen_rooms
    where id in ('main', 'bousai-toyama', 'snake-free', 'snake-theme', 'snake-disaster')
    order by id for update;

  for previous_room in
    select distinct room_id from jec.ransen_players
      where user_id = p_user_id and room_id <> p_room_id
  loop
    delete from jec.ransen_players where room_id = previous_room and user_id = p_user_id;
    if not exists (
      select 1 from jec.ransen_players
      where room_id = previous_room and not is_spectator
        and last_seen >= p_now - interval '15 seconds'
    ) then
      update jec.ransen_rooms set lobby_ends_at = null, updated_at = p_now
        where id = previous_room and phase = 'LOBBY' and lobby_ends_at is not null;
      update jec.game_matches set phase = 'WAITING', lobby_ends_at = null, updated_at = p_now
        where playlist_id = previous_room and phase = 'LOBBY';
    end if;
  end loop;

  select * into target_room from jec.ransen_rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  -- A late visitor observes the active/result snapshot and is never queued.
  if target_room.phase in ('PLAYING', 'THEATER') then
    delete from jec.ransen_players where room_id = p_room_id and user_id = p_user_id;
    return jsonb_build_object(
      'ok', true, 'role', 'spectator', 'phase', target_room.phase,
      'lobbyEndsAt', null, 'playerCount', 0, 'audienceCount', 0
    );
  end if;

  if target_room.phase <> 'LOBBY' then
    return jsonb_build_object('ok', false, 'code', 'ROOM_OFF', 'phase', target_room.phase);
  end if;

  delete from jec.ransen_players
    where room_id = p_room_id and last_seen < p_now - interval '15 seconds';

  insert into jec.ransen_players (room_id, user_id, name, color, is_spectator, last_seen)
  values (p_room_id, p_user_id, trim(p_name), p_color, p_is_spectator, p_now)
  on conflict (room_id, user_id) do update set
    name = excluded.name,
    color = excluded.color,
    is_spectator = excluded.is_spectator,
    last_seen = excluded.last_seen;

  select count(*) filter (where not is_spectator), count(*)
    into active_players, active_audience
    from jec.ransen_players
    where room_id = p_room_id and last_seen >= p_now - interval '15 seconds';

  deadline := target_room.lobby_ends_at;
  if active_players = 0 then
    deadline := null;
    update jec.ransen_rooms set lobby_ends_at = null, updated_at = p_now
      where id = p_room_id and phase = 'LOBBY';
    update jec.game_matches set phase = 'WAITING', lobby_ends_at = null, updated_at = p_now
      where playlist_id = p_room_id and phase = 'LOBBY';
  elsif deadline is null then
    deadline := p_now + interval '25 seconds';
    update jec.ransen_rooms set lobby_ends_at = deadline, updated_at = p_now
      where id = p_room_id and phase = 'LOBBY' and lobby_ends_at is null;
    select lobby_ends_at into deadline from jec.ransen_rooms where id = p_room_id;
    update jec.game_matches set phase = 'LOBBY', lobby_ends_at = deadline, updated_at = p_now
      where playlist_id = p_room_id and phase = 'WAITING';
  end if;

  if not p_is_spectator then role_name := 'participant'; end if;
  return jsonb_build_object(
    'ok', true, 'role', role_name, 'phase', 'LOBBY',
    'lobbyEndsAt', deadline, 'playerCount', least(active_players, 13),
    'audienceCount', least(active_audience, 19)
  );
end;
$$;

create or replace function jec.sweep_game_lobbies(p_now timestamptz default now())
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  empty_room text;
begin
  delete from jec.ransen_players where last_seen < p_now - interval '15 seconds';
  for empty_room in
    select room.id from jec.ransen_rooms room
    where room.phase = 'LOBBY' and room.lobby_ends_at is not null
      and not exists (
        select 1 from jec.ransen_players player
        where player.room_id = room.id and not player.is_spectator
          and player.last_seen >= p_now - interval '15 seconds'
      )
    for update
  loop
    update jec.ransen_rooms set lobby_ends_at = null, updated_at = p_now where id = empty_room;
    update jec.game_matches set phase = 'WAITING', lobby_ends_at = null, updated_at = p_now
      where playlist_id = empty_room and phase = 'LOBBY';
  end loop;
end;
$$;

revoke all on function jec.register_game_presence(text, uuid, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function jec.sweep_game_lobbies(timestamptz) from public, anon, authenticated;
grant execute on function jec.register_game_presence(text, uuid, text, text, boolean, timestamptz) to service_role;
grant execute on function jec.sweep_game_lobbies(timestamptz) to service_role;

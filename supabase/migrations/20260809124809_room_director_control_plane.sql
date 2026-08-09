create table if not exists jec.game_playlists (
  id text primary key,
  game_id text not null check (game_id in ('ransen', 'snake')),
  title text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists jec.game_room_director (
  singleton boolean primary key default true check (singleton),
  holder text,
  fencing_token bigint not null default 0,
  lease_expires_at timestamptz,
  last_seen_at timestamptz,
  fallback_active boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists jec.game_matches (
  id uuid primary key default gen_random_uuid(),
  playlist_id text not null references jec.game_playlists(id),
  phase text not null check (phase in ('WAITING', 'LOBBY', 'PLAYING', 'THEATER', 'CLOSED')),
  fencing_token bigint not null,
  lobby_ends_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists game_matches_one_joinable_per_playlist
  on jec.game_matches (playlist_id)
  where phase in ('WAITING', 'LOBBY');
create index if not exists game_matches_playlist_created_idx
  on jec.game_matches (playlist_id, created_at desc);
create index if not exists game_matches_phase_idx
  on jec.game_matches (phase, updated_at desc);

insert into jec.game_room_director (singleton) values (true)
on conflict (singleton) do nothing;

insert into jec.game_playlists (id, game_id, title, sort_order) values
  ('main', 'ransen', '乱戦・通常', 10),
  ('bousai-toyama', 'ransen', '乱戦・防灾富山', 20),
  ('snake-free', 'snake', '侍蛇・自由', 30),
  ('snake-theme', 'snake', '侍蛇・主题', 40),
  ('snake-disaster', 'snake', '防灾专场 · 高难度', 50)
on conflict (id) do update set
  game_id = excluded.game_id,
  title = excluded.title,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table jec.game_playlists enable row level security;
alter table jec.game_room_director enable row level security;
alter table jec.game_matches enable row level security;

revoke all on jec.game_playlists from anon, authenticated;
revoke all on jec.game_room_director from anon, authenticated;
revoke all on jec.game_matches from anon, authenticated;
grant all on jec.game_playlists to service_role;
grant all on jec.game_room_director to service_role;
grant all on jec.game_matches to service_role;

comment on table jec.game_room_director is 'Single-writer lease for the Shanghai room director and explicit remote fallback.';
comment on column jec.game_room_director.fencing_token is 'Monotonic token; stale directors must never mutate a match.';

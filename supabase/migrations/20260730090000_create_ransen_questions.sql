create table if not exists jec.ransen_questions (
  id text primary key,
  source_key text not null,
  variant smallint not null check (variant between 1 and 20),
  category text not null check (category in ('culture', 'language', 'disaster', 'toyama')),
  question_type text not null check (question_type in ('grammar', 'vocab', 'culture')),
  level text,
  text text not null check (char_length(text) between 2 and 500),
  options jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) = 4
  ),
  correct_index smallint not null check (correct_index between 0 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, variant)
);

create index if not exists ransen_questions_active_level_idx
  on jec.ransen_questions (active, level);

create index if not exists ransen_questions_active_category_idx
  on jec.ransen_questions (active, category);

alter table jec.ransen_questions enable row level security;

drop policy if exists "Public can read active ransen questions" on jec.ransen_questions;
create policy "Public can read active ransen questions"
  on jec.ransen_questions
  for select
  to anon, authenticated
  using (active);

grant usage on schema jec to anon, authenticated;
grant select on table jec.ransen_questions to anon, authenticated;
grant select, insert, update, delete on table jec.ransen_questions to service_role;

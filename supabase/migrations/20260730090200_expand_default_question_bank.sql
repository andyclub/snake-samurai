alter table jec.ransen_questions
  drop constraint if exists ransen_questions_variant_check;

alter table jec.ransen_questions
  add constraint ransen_questions_variant_check
  check (variant between 1 and 20);

create index if not exists ransen_questions_active_category_idx
  on jec.ransen_questions (active, category);

grant select, insert, update, delete
  on table jec.ransen_questions
  to service_role;

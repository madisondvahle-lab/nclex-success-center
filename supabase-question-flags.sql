-- Lets students flag a question as confusing/wrong, and lets the tutor review flags.
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists question_flags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id) on delete set null,
  question_no bigint,
  question_ref text,
  question_stem text,
  student_id uuid references students(id) on delete set null,
  reason text,
  note text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_question_flags_status on question_flags(status, created_at desc);
alter table question_flags enable row level security;

drop policy if exists "students flag questions" on question_flags;
drop policy if exists "admins manage question flags" on question_flags;

create policy "students flag questions" on question_flags
  for insert to authenticated
  with check (exists (select 1 from students s where s.id = question_flags.student_id and s.auth_user_id = auth.uid()));

create policy "admins manage question flags" on question_flags
  for all to authenticated using (is_app_admin()) with check (is_app_admin());

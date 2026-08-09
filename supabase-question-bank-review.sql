-- Private question-bank review workflow.
-- Run once in the Supabase SQL Editor before using question-bank-review.html.

alter table questions add column if not exists source_key text;
create unique index if not exists idx_questions_source_key_unique
  on questions(source_key) where source_key is not null;

-- Students can read active questions; only an app admin can create or change them.
alter table questions enable row level security;
drop policy if exists "public reads active questions" on questions;
drop policy if exists "admins manage questions" on questions;
create policy "public reads active questions" on questions
  for select using (active = true or is_app_admin());
create policy "admins manage questions" on questions
  for all to authenticated using (is_app_admin()) with check (is_app_admin());

create table if not exists question_import_reviews (
  source_key text primary key,
  source_name text not null default 'legacy-question-bank',
  status text not null default 'pending' check (status in ('pending', 'ignored', 'draft', 'published')),
  note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  imported_question_id uuid references questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table question_import_reviews enable row level security;
drop policy if exists "admins manage question import reviews" on question_import_reviews;
create policy "admins manage question import reviews" on question_import_reviews
  for all to authenticated using (is_app_admin()) with check (is_app_admin());

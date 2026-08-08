-- NCLEX Success Center v2
-- Run this AFTER supabase-secure-access-migration.sql.
-- This creates the private student-plan and guest-diagnostic data model.
-- Do not re-enable public PIN access after this migration.

create extension if not exists pgcrypto;

create table if not exists diagnostic_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (position('@' in email) > 1),
  nclex_target_date date,
  readiness_band text check (readiness_band in ('building_foundation', 'developing', 'on_track', 'strong')),
  overall_score numeric(5,2) check (overall_score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb,
  consent_to_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists student_study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  title text not null default 'NCLEX Roadmap',
  starts_on date,
  ends_on date,
  weekly_focus jsonb not null default '[]'::jsonb,
  daily_priorities jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists student_resources (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  title text not null,
  resource_type text not null check (resource_type in ('study_guide', 'practice_set', 'video', 'link', 'document')),
  url text,
  note text,
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table diagnostic_leads enable row level security;
alter table student_study_plans enable row level security;
alter table student_resources enable row level security;

-- Guest diagnostic submissions must go through the Edge Function below.
-- The function uses the service role after validating Turnstile and never exposes leads to anon users.
revoke all on diagnostic_leads from anon, authenticated;
grant select, insert, update, delete on diagnostic_leads to authenticated;

drop policy if exists "admins manage diagnostic leads" on diagnostic_leads;
create policy "admins manage diagnostic leads" on diagnostic_leads
  for all to authenticated using (is_app_admin()) with check (is_app_admin());

drop policy if exists "admins manage study plans" on student_study_plans;
drop policy if exists "students read own study plans" on student_study_plans;
create policy "admins manage study plans" on student_study_plans
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students read own study plans" on student_study_plans
  for select to authenticated using (
    exists (select 1 from students where students.id = student_study_plans.student_id and students.auth_user_id = auth.uid())
  );

drop policy if exists "admins manage resources" on student_resources;
drop policy if exists "students read own resources" on student_resources;
create policy "admins manage resources" on student_resources
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students read own resources" on student_resources
  for select to authenticated using (
    exists (select 1 from students where students.id = student_resources.student_id and students.auth_user_id = auth.uid())
  );

-- Recommended one-time cleanup after every current student has accepted a magic-link invitation:
-- alter table students drop column pin;

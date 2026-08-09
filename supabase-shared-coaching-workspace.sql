-- Shared NCLEX coaching workspace
-- Run this AFTER supabase-secure-access-migration.sql and supabase-success-center-v2.sql.
-- Creates private report storage plus the shared assessment/progress data model.

create table if not exists student_assessment_uploads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  platform text not null check (platform in ('kaplan', 'archer', 'bootcamp', 'uworld', 'cpr', 'other')),
  assessment_type text not null check (assessment_type in ('cat', 'readiness_exam', 'cpr_report', 'qbank_report', 'other')),
  taken_on date,
  overall_score numeric(5,2) check (overall_score is null or overall_score between 0 and 100),
  report_path text not null unique,
  report_filename text not null,
  report_mime_type text not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Safe to run after the initial workspace migration. These fields distinguish
-- repeat readiness/CAT attempts without changing any existing reports.
alter table student_assessment_uploads
  add column if not exists report_label text,
  add column if not exists attempt_number integer check (attempt_number is null or attempt_number >= 1);

create table if not exists student_assessment_insights (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references student_assessment_uploads(id) on delete cascade,
  shared_summary text,
  strengths jsonb not null default '[]'::jsonb,
  focus_areas jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  shared_with_student boolean not null default true,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists student_assessment_categories (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references student_assessment_uploads(id) on delete cascade,
  category text not null,
  score numeric(5,2) check (score is null or score between 0 and 100),
  correct_count integer check (correct_count is null or correct_count >= 0),
  total_count integer check (total_count is null or total_count > 0),
  created_at timestamptz not null default now(),
  unique (assessment_id, category)
);

create table if not exists student_focus_areas (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  focus_area text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'maintenance')),
  current_score numeric(5,2) check (current_score is null or current_score between 0 and 100),
  previous_score numeric(5,2) check (previous_score is null or previous_score between 0 and 100),
  trend text not null default 'steady' check (trend in ('improving', 'steady', 'needs_attention')),
  next_step text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (student_id, focus_area)
);

alter table student_assessment_uploads enable row level security;
alter table student_assessment_insights enable row level security;
alter table student_assessment_categories enable row level security;
alter table student_focus_areas enable row level security;

drop policy if exists "admins manage assessment uploads" on student_assessment_uploads;
drop policy if exists "students view own assessment uploads" on student_assessment_uploads;
drop policy if exists "students upload own assessment reports" on student_assessment_uploads;
create policy "admins manage assessment uploads" on student_assessment_uploads
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students view own assessment uploads" on student_assessment_uploads
  for select to authenticated using (
    exists (select 1 from students where students.id = student_assessment_uploads.student_id and students.auth_user_id = auth.uid())
  );
create policy "students upload own assessment reports" on student_assessment_uploads
  for insert to authenticated with check (
    uploaded_by = auth.uid() and report_path like (student_id::text || '/%') and exists (
      select 1 from students where students.id = student_assessment_uploads.student_id and students.auth_user_id = auth.uid()
    )
  );

drop policy if exists "admins manage assessment insights" on student_assessment_insights;
drop policy if exists "students view shared assessment insights" on student_assessment_insights;
create policy "admins manage assessment insights" on student_assessment_insights
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students view shared assessment insights" on student_assessment_insights
  for select to authenticated using (
    shared_with_student and exists (
      select 1 from student_assessment_uploads uploads join students on students.id = uploads.student_id
      where uploads.id = student_assessment_insights.assessment_id and students.auth_user_id = auth.uid()
    )
  );

drop policy if exists "admins manage assessment categories" on student_assessment_categories;
drop policy if exists "students view own assessment categories" on student_assessment_categories;
create policy "admins manage assessment categories" on student_assessment_categories
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students view own assessment categories" on student_assessment_categories
  for select to authenticated using (
    exists (
      select 1 from student_assessment_uploads uploads join students on students.id = uploads.student_id
      where uploads.id = student_assessment_categories.assessment_id and students.auth_user_id = auth.uid()
    )
  );

drop policy if exists "admins manage student focus areas" on student_focus_areas;
drop policy if exists "students view own focus areas" on student_focus_areas;
create policy "admins manage student focus areas" on student_focus_areas
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
create policy "students view own focus areas" on student_focus_areas
  for select to authenticated using (
    exists (select 1 from students where students.id = student_focus_areas.student_id and students.auth_user_id = auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-reports',
  'assessment-reports',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authorized users view private assessment reports" on storage.objects;
drop policy if exists "students upload private assessment reports" on storage.objects;
drop policy if exists "admins manage private assessment reports" on storage.objects;
create policy "authorized users view private assessment reports" on storage.objects
  for select to authenticated using (
    bucket_id = 'assessment-reports' and (
      is_app_admin() or exists (
        select 1 from students
        where students.auth_user_id = auth.uid() and students.id::text = (storage.foldername(name))[1]
      )
    )
  );
create policy "students upload private assessment reports" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'assessment-reports' and exists (
      select 1 from students
      where students.auth_user_id = auth.uid() and students.id::text = (storage.foldername(name))[1]
    )
  );
create policy "admins manage private assessment reports" on storage.objects
  for all to authenticated using (bucket_id = 'assessment-reports' and is_app_admin())
  with check (bucket_id = 'assessment-reports' and is_app_admin());

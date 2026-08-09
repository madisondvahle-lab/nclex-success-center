-- Organize repeat CAT/readiness/CPR reports by attempt.
-- Safe to run once in the Supabase SQL Editor.

alter table student_assessment_uploads
  add column if not exists report_label text,
  add column if not exists attempt_number integer check (attempt_number is null or attempt_number >= 1);

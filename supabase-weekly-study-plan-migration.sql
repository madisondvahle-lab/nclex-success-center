-- NCLEX Success Center - weekly study plan + focus categories (step 1)
-- Run once in Supabase SQL Editor after supabase-success-center-v2.sql.
--
-- Extends the existing student_study_plans table (already admin-managed and
-- student-read-own under RLS) instead of creating a competing plan table.
-- Additive only: new columns have defaults, existing roadmap columns are untouched.

ALTER TABLE student_study_plans
  ADD COLUMN IF NOT EXISTS practice_days text[] NOT NULL DEFAULT ARRAY['mon','wed','fri']::text[],
  ADD COLUMN IF NOT EXISTS practice_questions_per_day integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS practice_platform text NOT NULL DEFAULT 'UWorld',
  ADD COLUMN IF NOT EXISTS cat_days text[] NOT NULL DEFAULT ARRAY['tue','sat']::text[],
  ADD COLUMN IF NOT EXISTS cat_platform text NOT NULL DEFAULT 'UWorld',
  ADD COLUMN IF NOT EXISTS focus_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS focus_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS plan_notes text,
  ADD COLUMN IF NOT EXISTS focus_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE student_study_plans DROP CONSTRAINT IF EXISTS student_study_plans_practice_days_check;
ALTER TABLE student_study_plans ADD CONSTRAINT student_study_plans_practice_days_check
  CHECK (practice_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);
ALTER TABLE student_study_plans DROP CONSTRAINT IF EXISTS student_study_plans_cat_days_check;
ALTER TABLE student_study_plans ADD CONSTRAINT student_study_plans_cat_days_check
  CHECK (cat_days <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);
ALTER TABLE student_study_plans DROP CONSTRAINT IF EXISTS student_study_plans_questions_check;
ALTER TABLE student_study_plans ADD CONSTRAINT student_study_plans_questions_check
  CHECK (practice_questions_per_day BETWEEN 1 AND 300);

-- One current plan per student so the coach page can upsert by student_id.
-- Fails safely (no change) if duplicate plan rows already exist; resolve them first.
CREATE UNIQUE INDEX IF NOT EXISTS student_study_plans_student_id_key ON student_study_plans(student_id);

ALTER TABLE student_study_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage study plans" ON student_study_plans;
DROP POLICY IF EXISTS "students read own study plans" ON student_study_plans;
CREATE POLICY "admins manage study plans" ON student_study_plans
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "students read own study plans" ON student_study_plans
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM students WHERE students.id = student_study_plans.student_id AND students.auth_user_id = auth.uid())
  );

REVOKE ALL ON student_study_plans FROM anon;

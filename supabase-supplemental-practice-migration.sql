-- NCLEX Success Center - supplemental practice results
-- Run once in Supabase SQL Editor after supabase-shared-progress-migration.sql.

CREATE TABLE IF NOT EXISTS student_supplemental_practice_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  practice_key text NOT NULL,
  practice_title text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  total_questions integer NOT NULL CHECK (total_questions > 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_supplemental_practice_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage supplemental practice results" ON student_supplemental_practice_results;
DROP POLICY IF EXISTS "students read own supplemental practice results" ON student_supplemental_practice_results;
DROP POLICY IF EXISTS "students insert own supplemental practice results" ON student_supplemental_practice_results;

CREATE POLICY "admins manage supplemental practice results"
ON student_supplemental_practice_results
FOR ALL TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

CREATE POLICY "students read own supplemental practice results"
ON student_supplemental_practice_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students
    WHERE students.id = student_supplemental_practice_results.student_id
      AND students.auth_user_id = auth.uid()
  )
);

CREATE POLICY "students insert own supplemental practice results"
ON student_supplemental_practice_results
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students
    WHERE students.id = student_supplemental_practice_results.student_id
      AND students.auth_user_id = auth.uid()
  )
);

REVOKE ALL ON student_supplemental_practice_results FROM anon;

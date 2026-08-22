-- NCLEX Success Center — authenticated module results
-- Run once in Supabase SQL Editor before re-enabling M3+ student module assignment.

CREATE TABLE IF NOT EXISTS module_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  score integer NOT NULL CHECK (score >= 0),
  total integer NOT NULL CHECK (total > 0),
  percentage numeric(5,2) GENERATED ALWAYS AS ((score::numeric / total::numeric) * 100) STORED,
  answers jsonb,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_results_student_module_idx
  ON module_results (student_id, module_key, completed_at DESC);

ALTER TABLE module_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage module results" ON module_results;
DROP POLICY IF EXISTS "students read own module results" ON module_results;
DROP POLICY IF EXISTS "students insert own module results" ON module_results;

CREATE POLICY "admins manage module results"
ON module_results
FOR ALL TO authenticated
USING (is_app_admin())
WITH CHECK (is_app_admin());

CREATE POLICY "students read own module results"
ON module_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM students
    WHERE students.id = module_results.student_id
      AND students.auth_user_id = auth.uid()
  )
);

CREATE POLICY "students insert own module results"
ON module_results
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM students
    WHERE students.id = module_results.student_id
      AND students.auth_user_id = auth.uid()
  )
);

REVOKE ALL ON module_results FROM anon;
GRANT SELECT, INSERT ON module_results TO authenticated;

-- This table replaces legacy module-specific result code that hard-coded
-- student names/emails or relied on public/anonymous writes.

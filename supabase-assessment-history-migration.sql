-- NCLEX Success Center — assessment-history personalization
-- Run once in the Supabase SQL Editor after supabase-secure-access-migration.sql.
-- External scores are entered by an app admin and read only by the matching student.

CREATE TABLE IF NOT EXISTS external_assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (char_length(trim(platform)) BETWEEN 1 AND 120),
  assessment_name text NOT NULL DEFAULT '',
  taken_at date,
  overall_score numeric CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  readiness_level text NOT NULL DEFAULT '',
  category_scores jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(category_scores) = 'object'),
  notes text NOT NULL DEFAULT '',
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_assessments_student_taken_at_idx
  ON external_assessments (student_id, taken_at DESC, created_at DESC);

ALTER TABLE external_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage external assessments" ON external_assessments;
DROP POLICY IF EXISTS "students read own external assessments" ON external_assessments;

CREATE POLICY "admins manage external assessments"
  ON external_assessments FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

CREATE POLICY "students read own external assessments"
  ON external_assessments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = external_assessments.student_id
        AND students.auth_user_id = auth.uid()
    )
  );

REVOKE ALL ON external_assessments FROM anon;
-- NCLEX Success Center — in-house assessment analytics
-- Run once in Supabase SQL Editor after supabase-secure-access-migration.sql.
-- Stores student outcomes, not question wording or answer keys.

CREATE TABLE IF NOT EXISTS in_house_assessment_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_version text NOT NULL DEFAULT 'in-house-core-v1',
  mode text NOT NULL CHECK (mode IN ('practice', 'nclex', 'mock', 'remediation')),
  result text CHECK (result IN ('PASS', 'FAIL')),
  ability_estimate numeric,
  total_questions integer NOT NULL CHECK (total_questions > 0),
  correct_questions integer NOT NULL CHECK (correct_questions >= 0 AND correct_questions <= total_questions),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS in_house_assessment_item_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES in_house_assessment_attempts(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_source text NOT NULL DEFAULT 'nclex-success-center-original',
  blueprint text,
  nclex_category text,
  topic text,
  cognitive_level text,
  difficulty integer CHECK (difficulty BETWEEN 1 AND 3),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_house_attempts_student_completed
  ON in_house_assessment_attempts(student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_house_responses_item
  ON in_house_assessment_item_responses(item_id);
CREATE INDEX IF NOT EXISTS idx_in_house_responses_topic
  ON in_house_assessment_item_responses(topic);

ALTER TABLE in_house_assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_house_assessment_item_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage in-house assessment attempts" ON in_house_assessment_attempts;
DROP POLICY IF EXISTS "students read own in-house assessment attempts" ON in_house_assessment_attempts;
DROP POLICY IF EXISTS "students create own in-house assessment attempts" ON in_house_assessment_attempts;
CREATE POLICY "admins manage in-house assessment attempts"
  ON in_house_assessment_attempts FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "students read own in-house assessment attempts"
  ON in_house_assessment_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = in_house_assessment_attempts.student_id AND students.auth_user_id = auth.uid()));
CREATE POLICY "students create own in-house assessment attempts"
  ON in_house_assessment_attempts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = in_house_assessment_attempts.student_id AND students.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admins manage in-house item responses" ON in_house_assessment_item_responses;
DROP POLICY IF EXISTS "students read own in-house item responses" ON in_house_assessment_item_responses;
DROP POLICY IF EXISTS "students create own in-house item responses" ON in_house_assessment_item_responses;
CREATE POLICY "admins manage in-house item responses"
  ON in_house_assessment_item_responses FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "students read own in-house item responses"
  ON in_house_assessment_item_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM in_house_assessment_attempts attempts
    JOIN students ON students.id = attempts.student_id
    WHERE attempts.id = in_house_assessment_item_responses.attempt_id
      AND students.auth_user_id = auth.uid()
  ));
CREATE POLICY "students create own in-house item responses"
  ON in_house_assessment_item_responses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM in_house_assessment_attempts attempts
    JOIN students ON students.id = attempts.student_id
    WHERE attempts.id = in_house_assessment_item_responses.attempt_id
      AND students.auth_user_id = auth.uid()
  ));

REVOKE ALL ON in_house_assessment_attempts, in_house_assessment_item_responses FROM anon;

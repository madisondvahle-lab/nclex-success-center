-- Synthetic, disposable integration schema. Never apply to an existing database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role'
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE students (
  id uuid PRIMARY KEY, auth_user_id uuid UNIQUE, name text, portal_stage text
);
CREATE TABLE app_admins (user_id uuid PRIMARY KEY);
CREATE FUNCTION is_app_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid())
$$;
CREATE TABLE in_house_assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid REFERENCES students(id),
  session_key text, assessment_key text, assessment_title text, assessment_version text,
  mode text, status text, result text, ability_estimate numeric, target_questions integer,
  total_questions integer DEFAULT 0, correct_questions integer DEFAULT 0, checkpoint jsonb,
  checkpoint_revision integer DEFAULT 0, qa_mode boolean DEFAULT false,
  started_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(), completed_at timestamptz
);
CREATE TABLE in_house_assessment_item_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid REFERENCES in_house_assessment_attempts(id),
  item_id text, item_source text, blueprint text, nclex_category text, system text, topic text,
  cognitive_level text, difficulty integer, question_type text,
  selected_answer jsonb, correct_answer jsonb, is_correct boolean, answered_at timestamptz,
  UNIQUE(attempt_id, item_id)
);
CREATE INDEX ON in_house_assessment_item_responses(attempt_id);
CREATE INDEX ON in_house_assessment_attempts(student_id);
CREATE TABLE questions (
  id uuid PRIMARY KEY, stem text, rationale text, option_rationales jsonb, active boolean,
  source_key text, item_type text, item_data jsonb, difficulty text, nclex_category text, topic text
);
CREATE TABLE question_import_reviews (source_key text PRIMARY KEY, status text);
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_house_assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_house_assessment_item_responses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION is_app_admin() TO authenticated, service_role;
INSERT INTO students VALUES
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Synthetic one','active'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','Synthetic two','assessment');
INSERT INTO app_admins VALUES ('00000000-0000-4000-8000-000000000099');

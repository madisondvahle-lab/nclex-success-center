-- NCLEX Success Center — secure access migration
-- Run once in Supabase SQL Editor after creating your first admin Auth user.

ALTER TABLE students ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_key text NOT NULL UNIQUE,
  module_number integer NOT NULL UNIQUE CHECK (module_number > 0),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '📚',
  description text NOT NULL DEFAULT '',
  guide_url text,
  quiz_url text,
  is_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) $$;

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage students" ON students;
DROP POLICY IF EXISTS "students read own profile" ON students;
CREATE POLICY "admins manage students" ON students FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "students read own profile" ON students FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage module access" ON student_module_access;
DROP POLICY IF EXISTS "students read own module access" ON student_module_access;
CREATE POLICY "admins manage module access" ON student_module_access FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "students read own module access" ON student_module_access FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_module_access.student_id AND students.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admins manage scores" ON student_scores;
DROP POLICY IF EXISTS "students read own scores" ON student_scores;
CREATE POLICY "admins manage scores" ON student_scores FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY "students read own scores" ON student_scores FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_scores.student_id AND students.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admins manage notes" ON session_notes;
CREATE POLICY "admins manage notes" ON session_notes FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "authenticated users read modules" ON modules;
DROP POLICY IF EXISTS "admins manage modules" ON modules;
CREATE POLICY "authenticated users read modules" ON modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage modules" ON modules FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "users read own admin record" ON app_admins;
CREATE POLICY "users read own admin record" ON app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON students, student_module_access, student_scores, session_notes, modules, app_admins FROM anon;

-- One-time setup, after creating Auth users in Supabase Dashboard > Authentication > Users:
-- INSERT INTO app_admins (user_id) VALUES ('UUID_FOR_studywithmadisonrn@gmail.com');
-- UPDATE students SET auth_user_id = 'AUTH_USER_UUID' WHERE email = 'alyssadababneh@yahoo.com';
-- UPDATE students SET auth_user_id = 'AUTH_USER_UUID' WHERE email = 'southviewconsultingservices@gmail.com';
-- UPDATE students SET auth_user_id = 'AUTH_USER_UUID' WHERE email = 'stewartxcrunner@gmail.com';
-- UPDATE students SET auth_user_id = 'AUTH_USER_UUID' WHERE email = 'kylebatacan22@gmail.com';

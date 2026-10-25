-- Disposable local fixture. Mirrors the exposed live student columns/policies.
DO $$ BEGIN
  IF current_setting('app.profile_security_test', true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'Disposable profile security test database required';
  END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'local-only-profile-test';
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email text,
  pin text NOT NULL,
  nclex_target_date date,
  created_at timestamptz DEFAULT now(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  portal_stage text DEFAULT 'active' CHECK (portal_stage IN ('assessment','active','inactive')),
  student_type text DEFAULT 'nclex' CHECK (student_type IN ('nclex','nursing_student')),
  exam_date date,
  course_name text,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  archived_at timestamptz,
  portal_invite_sent_at timestamptz
);
CREATE TABLE public.app_admins (user_id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
$$;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage students" ON students FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY allow_anon_update_students ON students FOR UPDATE TO PUBLIC
  USING (true) WITH CHECK (true);
CREATE POLICY "students read own profile" ON students FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY "users read own admin record" ON app_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON public.students, public.app_admins TO authenticated, service_role;
-- Mirrors the independently deployed narrow RPC, without historical data changes.
CREATE FUNCTION public.update_my_nclex_target_date(new_target_date date)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved_date date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
  IF new_target_date IS NOT NULL AND new_target_date < current_date THEN
    RAISE EXCEPTION 'NCLEX target date must be today or later.';
  END IF;
  UPDATE public.students SET nclex_target_date = new_target_date
  WHERE auth_user_id = auth.uid() RETURNING nclex_target_date INTO saved_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'No student profile is linked to this account.'; END IF;
  RETURN saved_date;
END;
$$;
REVOKE ALL ON FUNCTION update_my_nclex_target_date(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_my_nclex_target_date(date) TO authenticated, service_role;
INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000099');
INSERT INTO app_admins VALUES ('00000000-0000-0000-0000-000000000099');
INSERT INTO students (id,auth_user_id,name,pin,portal_stage,student_type,course_name,exam_date) VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Synthetic Student A','local-only','assessment','nursing_student','Original course','2099-01-01'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','Synthetic Student B','local-only','active','nclex','Other course','2099-02-01');

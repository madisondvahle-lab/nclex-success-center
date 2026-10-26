-- Synthetic fixture, only for the disposable local database runner.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.students (
  id uuid PRIMARY KEY, auth_user_id uuid, student_type text, archived_at timestamptz
);
CREATE TABLE public.app_admins (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.is_app_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM app_admins WHERE user_id = auth.uid())
$$;
CREATE TABLE public.modules (
  module_key text PRIMARY KEY, module_number integer NOT NULL UNIQUE,
  name text NOT NULL, description text DEFAULT '', guide_url text,
  is_available boolean NOT NULL DEFAULT false
);
CREATE TABLE public.student_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  course_key text NOT NULL, course_name text NOT NULL, active boolean NOT NULL DEFAULT true,
  UNIQUE(student_id,course_key)
);
CREATE TABLE public.student_module_access (
  student_id uuid REFERENCES students(id), module_key text,
  enabled boolean NOT NULL DEFAULT false, PRIMARY KEY (student_id, module_key)
);
CREATE TABLE public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid REFERENCES students(id),
  class_code text, resource_type text, url text, note text
);
ALTER TABLE public.student_module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY manage_access ON public.student_module_access FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
CREATE POLICY read_access ON public.student_module_access FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM students WHERE id = student_id AND auth_user_id = auth.uid()));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_module_access TO authenticated;
INSERT INTO students VALUES
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','nursing_student',NULL),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','nclex',NULL),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000013','nursing_student',NULL);
INSERT INTO app_admins VALUES ('00000000-0000-0000-0000-000000000099');
INSERT INTO modules (module_key,module_number,name,guide_url)
VALUES ('m5',5,'Respiratory','module5-guide.html'),('m3',3,'Pharmacology','module3-guide.html');
INSERT INTO student_courses (student_id,course_key,course_name)
SELECT s.id,c.key,c.name FROM students s
CROSS JOIN (VALUES ('nur312','NUR 312'),('nur416','NUR 416')) c(key,name)
WHERE s.student_type = 'nursing_student';
ALTER TABLE student_courses ENABLE ROW LEVEL SECURITY;
INSERT INTO student_module_access VALUES
  ('00000000-0000-0000-0000-000000000001','m3',true),
  ('00000000-0000-0000-0000-000000000002','m4',true);
INSERT INTO student_resources (student_id, class_code, resource_type, url, note) VALUES
  ('00000000-0000-0000-0000-000000000003','NUR 312','study_guide','module4-guide.html','legacy link'),
  ('00000000-0000-0000-0000-000000000003','NUR 312','study_guide','module4-guide.html','duplicate legacy link'),
  ('00000000-0000-0000-0000-000000000001',NULL,'document','unrelated.pdf','preserve me');

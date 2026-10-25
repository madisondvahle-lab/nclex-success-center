-- Synthetic local database only; never use this fixture against Supabase.
DO $$
BEGIN
  IF current_setting('app.question_draft_audit_local_test',true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'This fixture requires the disposable local test database marker.';
  END IF;
END;
$$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
CREATE TABLE public.app_admins(user_id uuid PRIMARY KEY);
CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM app_admins WHERE user_id=auth.uid());
$$;
CREATE TABLE public.students(id uuid PRIMARY KEY,auth_user_id uuid);
CREATE TABLE public.in_house_assessment_attempts(id uuid PRIMARY KEY,checkpoint jsonb);
CREATE TABLE public.in_house_assessment_item_responses(id uuid PRIMARY KEY,correct_answer jsonb,is_correct boolean);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO app_admins VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO in_house_assessment_attempts VALUES ('00000000-0000-0000-0000-000000000003','{"key":[1],"contentVersion":"old","stem":"Saved historical content"}');
INSERT INTO in_house_assessment_item_responses VALUES ('00000000-0000-0000-0000-000000000004','[1]',true);

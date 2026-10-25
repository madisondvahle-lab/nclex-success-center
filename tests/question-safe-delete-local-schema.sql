-- Local-only fixture for supabase-question-safe-delete.sql.
-- Mirrors the production tables and foreign-key delete rules that refer to questions.
-- Never run against Supabase; the guard below requires an explicitly marked local database.
DO $guard$
BEGIN
  IF current_setting('app.question_delete_local_test', true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'This fixture may only be installed in the explicitly marked local test database.';
  END IF;
END;
$guard$;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.app_admins (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

CREATE TABLE public.students (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_no bigint UNIQUE,
  stem text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  source_key text
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage questions" ON public.questions FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;

CREATE TABLE public.question_revision_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  base_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_summary text NOT NULL DEFAULT 'synthetic',
  status text NOT NULL DEFAULT 'pending_review',
  proposed_by uuid,
  proposed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.question_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.question_revision_drafts(id) ON DELETE SET NULL,
  audit_status text NOT NULL DEFAULT 'screened',
  audited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_revision_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read question revision drafts" ON public.question_revision_drafts FOR SELECT TO authenticated USING (is_app_admin());
CREATE POLICY "admins read question audits" ON public.question_audits FOR SELECT TO authenticated USING (is_app_admin());
GRANT SELECT ON public.question_revision_drafts, public.question_audits TO authenticated;
CREATE TABLE public.question_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  question_stem text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.question_import_reviews (
  source_key text PRIMARY KEY,
  status text NOT NULL,
  imported_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL
);
CREATE TABLE public.question_set_items (
  set_key text NOT NULL,
  legacy_id text NOT NULL,
  position integer NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  PRIMARY KEY (set_key, legacy_id)
);
CREATE TABLE public.student_supplemental_practice_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  answer_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  missed_question_ids text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE public.in_house_assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  status text NOT NULL DEFAULT 'in_progress',
  checkpoint jsonb
);
CREATE TABLE public.in_house_assessment_item_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.in_house_assessment_attempts(id),
  item_id text NOT NULL,
  item_source text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false
);
CREATE TABLE public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  url text,
  assignment_details jsonb
);
CREATE TABLE public.student_assignment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  previous jsonb,
  updated jsonb
);
CREATE TABLE public.quiz_results (id bigserial PRIMARY KEY, answers jsonb);
CREATE TABLE public.module_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL, answers jsonb);
CREATE TABLE public.consult_diagnostic_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_results jsonb NOT NULL DEFAULT '[]'::jsonb);
CREATE TABLE public.exam_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL, analysis jsonb);
-- Lets the test verify (read-only) that student records are untouched.
GRANT SELECT ON public.question_flags, public.question_import_reviews, public.question_set_items,
  public.student_supplemental_practice_results, public.in_house_assessment_attempts,
  public.in_house_assessment_item_responses, public.quiz_results, public.module_results,
  public.consult_diagnostic_results, public.exam_reports, public.student_resources,
  public.student_assignment_revisions TO authenticated;

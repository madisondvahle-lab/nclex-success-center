-- NCLEX Success Center — structured student onboarding
-- Additive migration. Run in Supabase SQL Editor after
-- supabase-consult-intake-migration.sql and the current student migrations.

BEGIN;

ALTER TABLE public.consult_intakes
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS student_type text,
  ADD COLUMN IF NOT EXISTS program_name text,
  ADD COLUMN IF NOT EXISTS consult_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS tutoring_frequency text,
  ADD COLUMN IF NOT EXISTS preferred_learning_styles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reported_concerns text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reported_problem text,
  ADD COLUMN IF NOT EXISTS tutor_assessment text,
  ADD COLUMN IF NOT EXISTS tutor_focus_areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS initial_plan text,
  ADD COLUMN IF NOT EXISTS additional_notes text;

ALTER TABLE public.consult_intakes
  DROP CONSTRAINT IF EXISTS consult_intakes_status_check;

ALTER TABLE public.consult_intakes
  ADD CONSTRAINT consult_intakes_status_check
  CHECK (status IN (
    'new_lead', 'consult_scheduled', 'consult_completed', 'follow_up_needed',
    'active_student', 'on_hold', 'completed', 'archived', 'declined', 'no_response'
  )) NOT VALID;

CREATE TABLE IF NOT EXISTS public.nclex_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_intake_id uuid NOT NULL REFERENCES public.consult_intakes(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  test_date date,
  question_count integer CHECK (question_count IS NULL OR question_count > 0),
  result text CHECK (result IS NULL OR result IN ('pass', 'fail', 'unknown')),
  end_reason text CHECK (end_reason IS NULL OR end_reason IN (
    'computer_shut_off', 'maximum_items', 'ran_out_of_time', 'does_not_remember'
  )),
  testing_minutes integer CHECK (testing_minutes IS NULL OR testing_minutes > 0),
  cpr_available boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consult_intake_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.nclex_cpr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.nclex_attempts(id) ON DELETE CASCADE,
  domain text NOT NULL,
  rating text NOT NULL CHECK (rating IN (
    'above_passing', 'near_passing', 'below_passing', 'not_reported'
  )),
  UNIQUE (attempt_id, domain)
);

CREATE TABLE IF NOT EXISTS public.consult_prep_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_intake_id uuid NOT NULL REFERENCES public.consult_intakes(id) ON DELETE CASCADE,
  resource_name text NOT NULL,
  usage_status text,
  usage_dates text,
  questions_completed integer CHECK (questions_completed IS NULL OR questions_completed >= 0),
  percent_correct numeric(5,2) CHECK (
    percent_correct IS NULL OR percent_correct BETWEEN 0 AND 100
  ),
  cat_results text,
  readiness_results text,
  student_opinion text,
  notes text,
  UNIQUE (consult_intake_id, resource_name)
);

CREATE TABLE IF NOT EXISTS public.consult_intake_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consult_intake_id uuid NOT NULL REFERENCES public.consult_intakes(id) ON DELETE CASCADE,
  category text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_intakes_status
  ON public.consult_intakes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nclex_attempts_consult
  ON public.nclex_attempts (consult_intake_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_cpr_results_attempt
  ON public.nclex_cpr_results (attempt_id, domain);

ALTER TABLE public.nclex_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nclex_cpr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_prep_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_intake_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage NCLEX attempts" ON public.nclex_attempts;
CREATE POLICY "admins manage NCLEX attempts" ON public.nclex_attempts
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "admins manage CPR results" ON public.nclex_cpr_results;
CREATE POLICY "admins manage CPR results" ON public.nclex_cpr_results
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "admins manage consult prep resources" ON public.consult_prep_resources;
CREATE POLICY "admins manage consult prep resources" ON public.consult_prep_resources
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "admins manage consult intake files" ON public.consult_intake_files;
CREATE POLICY "admins manage consult intake files" ON public.consult_intake_files
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.nclex_attempts FROM anon;
REVOKE ALL ON public.nclex_cpr_results FROM anon;
REVOKE ALL ON public.consult_prep_resources FROM anon;
REVOKE ALL ON public.consult_intake_files FROM anon;

COMMIT;

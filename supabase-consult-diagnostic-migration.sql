-- NCLEX Success Center — consult diagnostic results
-- Additive. Run in Supabase SQL Editor after supabase-calendly-consultations-migration.sql.
-- Admin-only: stores tutor-run diagnostic results against a consultation / student / intake.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consult_diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  consult_intake_id uuid REFERENCES public.consult_intakes(id) ON DELETE CASCADE,
  item_count integer NOT NULL CHECK (item_count > 0),
  score_percent numeric(5,2) NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  fully_correct integer NOT NULL CHECK (fully_correct >= 0),
  elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  timed_out boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  tutor_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (consultation_id IS NOT NULL OR student_id IS NOT NULL OR consult_intake_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_consult_diag_consultation ON public.consult_diagnostic_results (consultation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_diag_student ON public.consult_diagnostic_results (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_diag_intake ON public.consult_diagnostic_results (consult_intake_id, created_at DESC);

ALTER TABLE public.consult_diagnostic_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage consult diagnostic results" ON public.consult_diagnostic_results;
CREATE POLICY "admins manage consult diagnostic results"
  ON public.consult_diagnostic_results FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

REVOKE ALL ON public.consult_diagnostic_results FROM anon;

COMMIT;

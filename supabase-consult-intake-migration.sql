BEGIN;

CREATE TABLE IF NOT EXISTS public.consult_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  preferred_contact text,
  time_zone text,
  nclex_exam text,
  graduation_date date,
  prior_attempts integer NOT NULL DEFAULT 0 CHECK (prior_attempts >= 0),
  prior_feedback text,
  nclex_target_date date,
  study_resources text,
  challenge_areas text,
  strengths text,
  accommodations_notes text,
  learning_preferences text,
  success_goal text,
  biggest_concern text,
  weekly_study_hours numeric CHECK (weekly_study_hours >= 0),
  support_interest text,
  coach_notes text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  converted_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consult_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage consult intakes" ON public.consult_intakes;
CREATE POLICY "admins manage consult intakes"
  ON public.consult_intakes
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

REVOKE ALL ON public.consult_intakes FROM anon;

COMMIT;

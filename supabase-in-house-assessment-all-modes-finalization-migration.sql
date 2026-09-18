BEGIN;

-- Extend the deployed lifecycle finalizer to support every diagnostic mode.
-- Readiness remains exact-target and PASS/FAIL; other diagnostic modes may
-- finish at their adaptive stopping point and retain their existing result.
CREATE OR REPLACE FUNCTION public.finalize_in_house_assessment_attempt(
  p_attempt_id uuid,
  p_result text,
  p_ability_estimate numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempt public.in_house_assessment_attempts;
  v_total integer;
  v_correct integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  SELECT * INTO v_attempt
  FROM public.in_house_assessment_attempts attempts
  WHERE attempts.id = p_attempt_id
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1 FROM public.students
        WHERE students.id = attempts.student_id
          AND students.auth_user_id = auth.uid()
      )
    )
  FOR UPDATE;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Assessment attempt not found';
  END IF;
  IF v_attempt.status = 'completed' THEN
    RETURN v_attempt.id;
  END IF;
  IF p_ability_estimate IS NULL THEN
    RAISE EXCEPTION 'Final ability estimate is required';
  END IF;
  IF v_attempt.status = 'abandoned' THEN
    RAISE EXCEPTION 'Abandoned assessment attempts cannot be finalized';
  END IF;
  IF v_attempt.assessment_key = 'readiness-assessment'
     AND (p_result IS NULL OR p_result NOT IN ('PASS', 'FAIL')) THEN
    RAISE EXCEPTION 'Readiness final result must be PASS or FAIL';
  END IF;
  IF v_attempt.assessment_key <> 'readiness-assessment'
     AND p_result IS NOT NULL
     AND btrim(p_result) = '' THEN
    RAISE EXCEPTION 'Final result must be null or a non-empty value';
  END IF;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE is_correct)::integer
  INTO v_total, v_correct
  FROM public.in_house_assessment_item_responses
  WHERE attempt_id = p_attempt_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Cannot finalize an assessment with no submitted responses';
  END IF;
  IF v_attempt.assessment_key = 'readiness-assessment'
     AND v_total <> v_attempt.target_questions THEN
    RAISE EXCEPTION
      'Cannot finalize readiness assessment: submitted response count (%) must equal target (%)',
      v_total, v_attempt.target_questions;
  END IF;
  IF v_attempt.assessment_key <> 'readiness-assessment'
     AND v_total > v_attempt.target_questions THEN
    RAISE EXCEPTION
      'Cannot finalize assessment: submitted response count (%) exceeds target (%)',
      v_total, v_attempt.target_questions;
  END IF;

  UPDATE public.in_house_assessment_attempts attempts
  SET status = 'completed',
      result = p_result,
      ability_estimate = p_ability_estimate,
      total_questions = v_total,
      correct_questions = v_correct,
      completed_at = COALESCE(attempts.completed_at, now()),
      updated_at = now()
  WHERE attempts.id = p_attempt_id;

  RETURN p_attempt_id;
END;
$$;

ALTER FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) TO authenticated;

COMMIT;

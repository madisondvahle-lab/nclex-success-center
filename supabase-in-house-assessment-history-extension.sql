-- NCLEX Success Center - canonical in-house assessment history extension
-- Run after supabase-in-house-item-analytics-migration.sql.

ALTER TABLE public.in_house_assessment_attempts
  ADD COLUMN IF NOT EXISTS assessment_key text,
  ADD COLUMN IF NOT EXISTS assessment_title text,
  ADD COLUMN IF NOT EXISTS session_key text;

ALTER TABLE public.in_house_assessment_item_responses
  ADD COLUMN IF NOT EXISTS system text,
  ADD COLUMN IF NOT EXISTS question_type text,
  ADD COLUMN IF NOT EXISTS selected_answer jsonb,
  ADD COLUMN IF NOT EXISTS correct_answer jsonb;

CREATE INDEX IF NOT EXISTS idx_in_house_attempts_student_assessment
  ON public.in_house_assessment_attempts(student_id, assessment_key, completed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_house_attempts_student_session
  ON public.in_house_assessment_attempts(student_id, session_key)
  WHERE session_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.save_in_house_assessment_attempt(
  uuid, text, text, text, text, text, numeric, integer, integer, timestamptz, jsonb
);

CREATE OR REPLACE FUNCTION public.save_in_house_assessment_attempt(
  p_student_id uuid,
  p_session_key text,
  p_assessment_key text,
  p_assessment_title text,
  p_assessment_version text,
  p_mode text,
  p_result text,
  p_ability_estimate numeric,
  p_total_questions integer,
  p_correct_questions integer,
  p_completed_at timestamptz,
  p_responses jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_attempt_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF NOT (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.students
      WHERE id = p_student_id AND auth_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Student ownership validation failed';
  END IF;

  IF p_assessment_key IS NULL OR btrim(p_assessment_key) = '' THEN
    RAISE EXCEPTION 'Assessment key is required';
  END IF;
  IF p_session_key IS NULL OR btrim(p_session_key) = '' THEN
    RAISE EXCEPTION 'Session key is required';
  END IF;
  IF p_assessment_title IS NULL OR btrim(p_assessment_title) = '' THEN
    RAISE EXCEPTION 'Assessment title is required';
  END IF;
  IF p_responses IS NULL OR jsonb_typeof(p_responses) <> 'array' THEN
    RAISE EXCEPTION 'Responses must be a JSON array';
  END IF;
  IF jsonb_array_length(p_responses) <> p_total_questions THEN
    RAISE EXCEPTION 'Response count must equal total question count';
  END IF;

  SELECT id INTO v_attempt_id
  FROM public.in_house_assessment_attempts
  WHERE student_id = p_student_id AND session_key = p_session_key
  FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    BEGIN
      INSERT INTO public.in_house_assessment_attempts (
        student_id, session_key, assessment_key, assessment_title,
        assessment_version, mode, result, ability_estimate, total_questions,
        correct_questions, completed_at
      )
      VALUES (
        p_student_id, p_session_key, p_assessment_key, p_assessment_title,
        COALESCE(NULLIF(btrim(p_assessment_version), ''), 'in-house-core-v1'),
        p_mode, p_result, p_ability_estimate, p_total_questions,
        p_correct_questions, COALESCE(p_completed_at, now())
      )
      RETURNING id INTO v_attempt_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_attempt_id
      FROM public.in_house_assessment_attempts
      WHERE student_id = p_student_id AND session_key = p_session_key
      FOR UPDATE;
    END;
  END IF;

  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Unable to create or find the assessment attempt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.in_house_assessment_item_responses
    WHERE attempt_id = v_attempt_id
  ) THEN
    RETURN v_attempt_id;
  END IF;

  INSERT INTO public.in_house_assessment_item_responses (
    attempt_id, item_id, item_source, blueprint, nclex_category, system, topic,
    cognitive_level, difficulty, question_type, selected_answer, correct_answer,
    is_correct, answered_at
  )
  SELECT
    v_attempt_id, response.item_id,
    COALESCE(response.item_source, 'nclex-success-center-original'),
    response.blueprint, response.nclex_category, response.system, response.topic,
    response.cognitive_level, response.difficulty, response.question_type,
    response.selected_answer, response.correct_answer, response.is_correct,
    COALESCE(response.answered_at, now())
  FROM jsonb_to_recordset(p_responses) AS response(
    item_id text, item_source text, blueprint text, nclex_category text,
    system text, topic text, cognitive_level text, difficulty integer,
    question_type text, selected_answer jsonb, correct_answer jsonb,
    is_correct boolean, answered_at timestamptz
  );

  RETURN v_attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_in_house_assessment_attempt(
  uuid, text, text, text, text, text, text, numeric, integer, integer, timestamptz, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_in_house_assessment_attempt(
  uuid, text, text, text, text, text, text, numeric, integer, integer, timestamptz, jsonb
) TO authenticated;

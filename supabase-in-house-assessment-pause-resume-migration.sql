-- NCLEX Success Center - in-house assessment pause/resume lifecycle
-- DRAFT ONLY. Review before applying. This file has not been executed.
--
-- Requires:
--   supabase-in-house-item-analytics-migration.sql
--   supabase-in-house-assessment-history-extension.sql
--
-- This migration preserves completed attempts and their response rows. It does
-- not touch supplemental practice tables.

BEGIN;

-- Existing deployments created total_questions > 0 as an unnamed CHECK
-- constraint. Resolve it from the catalog instead of guessing its generated
-- PostgreSQL name. Refuse to continue if the deployed definition is missing
-- or ambiguous.
DO $$
DECLARE
  matching_constraints text[];
  constraint_name text;
BEGIN
  SELECT array_agg(conname ORDER BY conname)
  INTO matching_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.in_house_assessment_attempts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%total_questions%> 0%';

  IF COALESCE(array_length(matching_constraints, 1), 0) <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one existing total_questions > 0 check constraint; found %',
      COALESCE(array_to_string(matching_constraints, ', '), 'none');
  END IF;

  constraint_name := matching_constraints[1];
  EXECUTE format(
    'ALTER TABLE public.in_house_assessment_attempts DROP CONSTRAINT %I',
    constraint_name
  );
END;
$$;

-- Add lifecycle state without introducing migration-day timestamps. Nullable
-- additions are backfilled before NOT NULL/default enforcement below.
ALTER TABLE public.in_house_assessment_attempts
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS target_questions integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkpoint jsonb,
  ADD COLUMN IF NOT EXISTS checkpoint_revision integer,
  ADD COLUMN IF NOT EXISTS qa_mode boolean;

-- Existing rows are completed historical attempts. Preserve their actual
-- total_questions as the best available target and preserve completed_at.
UPDATE public.in_house_assessment_attempts
SET
  status = COALESCE(status, 'completed'),
  target_questions = COALESCE(target_questions, GREATEST(total_questions, 1)),
  started_at = COALESCE(started_at, created_at, completed_at),
  updated_at = COALESCE(updated_at, completed_at, created_at),
  checkpoint = COALESCE(checkpoint, '{}'::jsonb),
  checkpoint_revision = COALESCE(checkpoint_revision, 0),
  qa_mode = COALESCE(qa_mode, false);

ALTER TABLE public.in_house_assessment_attempts
  ALTER COLUMN status SET DEFAULT 'completed',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN target_questions SET NOT NULL,
  ALTER COLUMN target_questions SET DEFAULT 85,
  ALTER COLUMN started_at SET DEFAULT now(),
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN checkpoint SET DEFAULT '{}'::jsonb,
  ALTER COLUMN checkpoint SET NOT NULL,
  ALTER COLUMN checkpoint_revision SET DEFAULT 0,
  ALTER COLUMN checkpoint_revision SET NOT NULL,
  ALTER COLUMN qa_mode SET DEFAULT false,
  ALTER COLUMN qa_mode SET NOT NULL,
  ALTER COLUMN completed_at DROP NOT NULL;

ALTER TABLE public.in_house_assessment_attempts
  ADD CONSTRAINT in_house_assessment_attempts_status_check
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  ADD CONSTRAINT in_house_assessment_attempts_target_questions_check
    CHECK (target_questions > 0),
  ADD CONSTRAINT in_house_assessment_attempts_total_questions_nonnegative_check
    CHECK (total_questions >= 0),
  ADD CONSTRAINT in_house_assessment_attempts_completed_total_check
    CHECK (status <> 'completed' OR total_questions > 0),
  ADD CONSTRAINT in_house_assessment_attempts_completed_at_check
    CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  ADD CONSTRAINT in_house_assessment_attempts_in_progress_at_check
    CHECK (status = 'completed' OR completed_at IS NULL);

-- The existing correct_questions constraint remains valid for zero-count
-- unfinished attempts because correct_questions starts at zero.

-- Verify canonical response identity before adding the idempotency index.
-- The identity is one response unit within one attempt, distinguished by its
-- source and item ID. Case-study subquestions use their existing composite
-- item IDs (for example, case-id:subquestion-id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.in_house_assessment_item_responses
    GROUP BY attempt_id, item_source, item_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate canonical response units exist for (attempt_id, item_source, item_id); review before applying pause/resume migration';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_in_house_responses_attempt_source_item
  ON public.in_house_assessment_item_responses(attempt_id, item_source, item_id);

-- Only one unfinished readiness assessment may exist per student. Other
-- assessment/practice modes are intentionally not restricted by this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_house_readiness_active_attempt
  ON public.in_house_assessment_attempts(student_id, assessment_key)
  WHERE status = 'in_progress'
    AND assessment_key = 'readiness-assessment';

CREATE INDEX IF NOT EXISTS idx_in_house_attempts_student_status_updated
  ON public.in_house_assessment_attempts(student_id, assessment_key, status, updated_at DESC);

-- The existing completed-attempt function remains available to legacy callers,
-- but newly created legacy rows receive an explicit completed lifecycle state
-- and target equal to their actual submitted count.
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
SET search_path = pg_catalog, public
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
    INSERT INTO public.in_house_assessment_attempts (
      student_id, session_key, assessment_key, assessment_title,
      assessment_version, mode, status, result, ability_estimate,
      target_questions, total_questions, correct_questions,
      started_at, updated_at, completed_at
    )
    VALUES (
      p_student_id, p_session_key, p_assessment_key, p_assessment_title,
      COALESCE(NULLIF(btrim(p_assessment_version), ''), 'in-house-core-v1'),
      p_mode, 'completed', p_result, p_ability_estimate,
      p_total_questions, p_total_questions, p_correct_questions,
      COALESCE(p_completed_at, now()), now(), COALESCE(p_completed_at, now())
    )
    RETURNING id INTO v_attempt_id;
  END IF;

  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Unable to create or find the assessment attempt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.in_house_assessment_attempts
    WHERE id = v_attempt_id
      AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION
      'Legacy completed-save cannot finalize an in-progress assessment attempt';
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
  )
  ON CONFLICT (attempt_id, item_source, item_id) DO NOTHING;

  RETURN v_attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_in_house_assessment_attempt(
  p_student_id uuid,
  p_session_key text,
  p_assessment_key text,
  p_assessment_title text,
  p_assessment_version text,
  p_target_questions integer,
  p_qa_mode boolean,
  p_checkpoint jsonb
)
RETURNS TABLE (
  attempt_id uuid,
  checkpoint_revision integer,
  target_questions integer,
  qa_mode boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempt public.in_house_assessment_attempts;
  v_qa_student_id constant uuid := '4a0944d5-46d0-40e8-aab4-373ef42d17b8';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND auth_user_id = auth.uid()
  ) AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Student ownership validation failed';
  END IF;
  IF p_assessment_key IS NULL OR btrim(p_assessment_key) = '' THEN
    RAISE EXCEPTION 'Assessment key is required';
  END IF;
  IF p_session_key IS NULL OR btrim(p_session_key) = '' THEN
    RAISE EXCEPTION 'Session key is required';
  END IF;
  IF p_checkpoint IS NOT NULL
     AND jsonb_typeof(p_checkpoint) <> 'object' THEN
    RAISE EXCEPTION 'Checkpoint must be a JSON object';
  END IF;
  IF p_target_questions <= 0 THEN
    RAISE EXCEPTION 'Target question count must be positive';
  END IF;
  IF p_assessment_key = 'readiness-assessment' AND p_qa_mode
     AND p_student_id <> v_qa_student_id THEN
    RAISE EXCEPTION 'QA assessment authorization failed';
  END IF;
  IF p_assessment_key = 'readiness-assessment' AND NOT p_qa_mode
     AND p_target_questions <> 85 THEN
    RAISE EXCEPTION 'Normal readiness assessments must target 85 questions';
  END IF;
  IF p_assessment_key = 'readiness-assessment' AND p_qa_mode
     AND p_target_questions <> 10 THEN
    RAISE EXCEPTION 'QA readiness assessments must target 10 questions';
  END IF;

  SELECT * INTO v_attempt
  FROM public.in_house_assessment_attempts
  WHERE student_id = p_student_id
    AND session_key = p_session_key
  FOR UPDATE;

  IF v_attempt.id IS NULL THEN
    BEGIN
      INSERT INTO public.in_house_assessment_attempts (
        student_id, session_key, assessment_key, assessment_title,
        assessment_version, mode, status, result, ability_estimate,
        target_questions, total_questions, correct_questions,
        started_at, updated_at, completed_at, checkpoint,
        checkpoint_revision, qa_mode
      )
      VALUES (
        p_student_id, p_session_key, p_assessment_key, p_assessment_title,
        COALESCE(NULLIF(btrim(p_assessment_version), ''), 'in-house-core-v1'),
        'practice', 'in_progress', NULL, 0.5,
        p_target_questions, 0, 0, now(), now(), NULL,
        COALESCE(p_checkpoint, '{}'::jsonb), 0, p_qa_mode
      )
      RETURNING * INTO v_attempt;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_attempt
      FROM public.in_house_assessment_attempts
      WHERE (
        student_id = p_student_id
        AND session_key = p_session_key
      ) OR (
        p_assessment_key = 'readiness-assessment'
        AND assessment_key = 'readiness-assessment'
        AND status = 'in_progress'
        AND student_id = p_student_id
      )
      ORDER BY CASE WHEN session_key = p_session_key THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE;

      IF v_attempt.id IS NULL THEN
        RAISE EXCEPTION
          'Assessment start conflicted with another active attempt; retry resume';
      END IF;
    END;
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Assessment session is no longer in progress';
  END IF;

  IF p_assessment_key = 'readiness-assessment'
     AND v_attempt.assessment_key = 'readiness-assessment'
     AND (
       v_attempt.target_questions <> p_target_questions
       OR v_attempt.qa_mode <> p_qa_mode
     ) THEN
    RAISE EXCEPTION
      'An active readiness assessment already exists with different target or QA settings; resume or abandon it first';
  END IF;

  RETURN QUERY
  SELECT v_attempt.id, v_attempt.checkpoint_revision,
         v_attempt.target_questions, v_attempt.qa_mode;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_in_house_assessment_attempt(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_checkpoint jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_revision integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF p_checkpoint IS NOT NULL
     AND jsonb_typeof(p_checkpoint) <> 'object' THEN
    RAISE EXCEPTION 'Checkpoint must be a JSON object';
  END IF;

  UPDATE public.in_house_assessment_attempts attempts
  SET checkpoint = COALESCE(p_checkpoint, '{}'::jsonb),
      checkpoint_revision = attempts.checkpoint_revision + 1,
      updated_at = now()
  WHERE attempts.id = p_attempt_id
    AND attempts.status = 'in_progress'
    AND attempts.checkpoint_revision = p_expected_revision
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1 FROM public.students
        WHERE students.id = attempts.student_id
          AND students.auth_user_id = auth.uid()
      )
    )
  RETURNING attempts.checkpoint_revision INTO v_revision;

  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'Checkpoint conflict or assessment is no longer active';
  END IF;
  RETURN v_revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_in_house_assessment_response(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_response jsonb,
  p_checkpoint jsonb,
  p_ability_estimate numeric
)
RETURNS TABLE (
  checkpoint_revision integer,
  total_questions integer,
  correct_questions integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempt public.in_house_assessment_attempts;
  v_item_id text;
  v_item_source text;
  v_inserted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;
  IF p_response IS NULL OR jsonb_typeof(p_response) <> 'object' THEN
    RAISE EXCEPTION 'Response must be a JSON object';
  END IF;
  IF NULLIF(p_response->>'item_id', '') IS NULL THEN
    RAISE EXCEPTION 'Response item_id is required';
  END IF;
  IF p_response ? 'item_source'
     AND jsonb_typeof(p_response->'item_source') <> 'string' THEN
    RAISE EXCEPTION 'Response item_source must be a string';
  END IF;
  IF NOT (p_response ? 'is_correct')
     OR jsonb_typeof(p_response->'is_correct') <> 'boolean' THEN
    RAISE EXCEPTION 'Response is_correct must be a boolean';
  END IF;
  IF p_response ? 'selected_answer'
     AND jsonb_typeof(p_response->'selected_answer') = 'null' THEN
    RAISE EXCEPTION 'Response selected_answer cannot be JSON null';
  END IF;
  IF p_response ? 'correct_answer'
     AND jsonb_typeof(p_response->'correct_answer') = 'null' THEN
    RAISE EXCEPTION 'Response correct_answer cannot be JSON null';
  END IF;
  IF p_checkpoint IS NOT NULL
     AND jsonb_typeof(p_checkpoint) <> 'object' THEN
    RAISE EXCEPTION 'Checkpoint must be a JSON object';
  END IF;

  SELECT * INTO v_attempt
  FROM public.in_house_assessment_attempts attempts
  WHERE attempts.id = p_attempt_id
    AND attempts.status = 'in_progress'
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
    RAISE EXCEPTION 'Response conflict or assessment is no longer active';
  END IF;

  v_item_id := NULLIF(p_response->>'item_id', '');
  v_item_source := COALESCE(
    NULLIF(p_response->>'item_source', ''),
    'nclex-success-center-original'
  );

  IF EXISTS (
    SELECT 1
    FROM public.in_house_assessment_item_responses
    WHERE attempt_id = p_attempt_id
      AND item_id = v_item_id
      AND item_source = v_item_source
  ) THEN
    SELECT COUNT(*)::integer,
           COUNT(*) FILTER (WHERE is_correct)::integer
    INTO v_attempt.total_questions, v_attempt.correct_questions
    FROM public.in_house_assessment_item_responses
    WHERE attempt_id = p_attempt_id;

    RETURN QUERY
    SELECT v_attempt.checkpoint_revision,
           v_attempt.total_questions,
           v_attempt.correct_questions;
    RETURN;
  END IF;

  IF v_attempt.checkpoint_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Response conflict or assessment is no longer active';
  END IF;

  INSERT INTO public.in_house_assessment_item_responses (
    attempt_id, item_id, item_source, blueprint, nclex_category, system, topic,
    cognitive_level, difficulty, question_type, selected_answer, correct_answer,
    is_correct, answered_at
  )
  VALUES (
    p_attempt_id,
    v_item_id,
    v_item_source,
    p_response->>'blueprint',
    p_response->>'nclex_category',
    p_response->>'system',
    p_response->>'topic',
    p_response->>'cognitive_level',
    NULLIF(p_response->>'difficulty', '')::integer,
    p_response->>'question_type',
    p_response->'selected_answer',
    p_response->'correct_answer',
    (p_response->>'is_correct')::boolean,
    COALESCE(NULLIF(p_response->>'answered_at', '')::timestamptz, now())
  )
  ON CONFLICT (attempt_id, item_source, item_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE is_correct)::integer
  INTO v_attempt.total_questions, v_attempt.correct_questions
  FROM public.in_house_assessment_item_responses
  WHERE attempt_id = p_attempt_id;

  UPDATE public.in_house_assessment_attempts attempts
  SET ability_estimate = COALESCE(p_ability_estimate, attempts.ability_estimate),
      total_questions = v_attempt.total_questions,
      correct_questions = v_attempt.correct_questions,
      checkpoint = COALESCE(p_checkpoint, '{}'::jsonb),
      checkpoint_revision = attempts.checkpoint_revision + 1,
      updated_at = now()
  WHERE attempts.id = p_attempt_id;

  RETURN QUERY
  SELECT v_attempt.checkpoint_revision + 1,
         v_attempt.total_questions,
         v_attempt.correct_questions;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_in_house_assessment_attempt(
  p_student_id uuid,
  p_assessment_key text
)
RETURNS SETOF public.in_house_assessment_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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

  RETURN QUERY
  SELECT attempts.*
  FROM public.in_house_assessment_attempts attempts
  WHERE attempts.student_id = p_student_id
    AND attempts.assessment_key = p_assessment_key
    AND attempts.status = 'in_progress'
  ORDER BY attempts.updated_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.abandon_in_house_assessment_attempt(
  p_attempt_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  UPDATE public.in_house_assessment_attempts attempts
  SET status = 'abandoned',
      updated_at = now()
  WHERE attempts.id = p_attempt_id
    AND attempts.status = 'in_progress'
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1 FROM public.students
        WHERE students.id = attempts.student_id
          AND students.auth_user_id = auth.uid()
      )
    )
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

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
  IF p_result IS NULL OR p_result NOT IN ('PASS', 'FAIL') THEN
    RAISE EXCEPTION 'Final result must be PASS or FAIL';
  END IF;
  IF p_ability_estimate IS NULL THEN
    RAISE EXCEPTION 'Final ability estimate is required';
  END IF;
  IF v_attempt.status = 'abandoned' THEN
    RAISE EXCEPTION 'Abandoned assessment attempts cannot be finalized';
  END IF;

  SELECT COUNT(*)::integer,
         COUNT(*) FILTER (WHERE is_correct)::integer
  INTO v_total, v_correct
  FROM public.in_house_assessment_item_responses
  WHERE attempt_id = p_attempt_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Cannot finalize an assessment with no submitted responses';
  END IF;
  IF v_total <> v_attempt.target_questions THEN
    RAISE EXCEPTION
      'Cannot finalize assessment: submitted response count (%) must equal target (%)',
      v_total, v_attempt.target_questions;
  END IF;

  UPDATE public.in_house_assessment_attempts attempts
  SET status = 'completed',
      result = p_result,
      ability_estimate = COALESCE(p_ability_estimate, attempts.ability_estimate),
      total_questions = v_total,
      correct_questions = v_correct,
      completed_at = COALESCE(attempts.completed_at, now()),
      updated_at = now()
  WHERE attempts.id = p_attempt_id;

  RETURN p_attempt_id;
END;
$$;

-- SECURITY DEFINER functions must be owned by the privileged database owner,
-- not by an untrusted caller role. Supabase deployments use postgres for this
-- owner; fail if that role is unavailable rather than silently weakening the
-- function security model.
ALTER FUNCTION public.create_in_house_assessment_attempt(
  uuid, text, text, text, text, integer, boolean, jsonb
) OWNER TO postgres;
ALTER FUNCTION public.checkpoint_in_house_assessment_attempt(
  uuid, integer, jsonb
) OWNER TO postgres;
ALTER FUNCTION public.record_in_house_assessment_response(
  uuid, integer, jsonb, jsonb, numeric
) OWNER TO postgres;
ALTER FUNCTION public.resume_in_house_assessment_attempt(
  uuid, text
) OWNER TO postgres;
ALTER FUNCTION public.abandon_in_house_assessment_attempt(
  uuid
) OWNER TO postgres;
ALTER FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_in_house_assessment_attempt(
  uuid, text, text, text, text, integer, boolean, jsonb
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.checkpoint_in_house_assessment_attempt(
  uuid, integer, jsonb
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_in_house_assessment_response(
  uuid, integer, jsonb, jsonb, numeric
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_in_house_assessment_attempt(
  uuid, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abandon_in_house_assessment_attempt(
  uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_in_house_assessment_attempt(
  uuid, text, text, text, text, integer, boolean, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_in_house_assessment_attempt(
  uuid, integer, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_in_house_assessment_response(
  uuid, integer, jsonb, jsonb, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_in_house_assessment_attempt(
  uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_in_house_assessment_attempt(
  uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_in_house_assessment_attempt(
  uuid, text, numeric
) TO authenticated;

COMMIT;

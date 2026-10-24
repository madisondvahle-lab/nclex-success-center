DO $guard$
BEGIN
  IF current_setting('app.mcq_local_test', true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'This fixture may only be installed in the explicitly marked local test database.';
  END IF;
END;
$guard$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  pin text,
  auth_user_id uuid NOT NULL UNIQUE,
  portal_stage text NOT NULL DEFAULT 'active'
);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin text;

CREATE TABLE IF NOT EXISTS public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  url text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.in_house_assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id),
  session_key text NOT NULL,
  assessment_key text NOT NULL,
  assessment_title text NOT NULL,
  assessment_version text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  result text,
  ability_estimate numeric,
  target_questions integer NOT NULL,
  total_questions integer NOT NULL DEFAULT 0,
  correct_questions integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_revision integer NOT NULL DEFAULT 0,
  qa_mode boolean NOT NULL DEFAULT false,
  UNIQUE (student_id,session_key)
);

CREATE TABLE IF NOT EXISTS public.in_house_assessment_item_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.in_house_assessment_attempts(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_source text NOT NULL,
  blueprint text,
  nclex_category text,
  system text,
  topic text,
  cognitive_level text,
  difficulty integer,
  question_type text,
  selected_answer jsonb,
  correct_answer jsonb,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id,item_source,item_id)
);
ALTER TABLE public.in_house_assessment_item_responses ADD COLUMN IF NOT EXISTS blueprint text;
ALTER TABLE public.in_house_assessment_item_responses ADD COLUMN IF NOT EXISTS nclex_category text;
ALTER TABLE public.in_house_assessment_item_responses ADD COLUMN IF NOT EXISTS system text;
ALTER TABLE public.in_house_assessment_item_responses ADD COLUMN IF NOT EXISTS cognitive_level text;

CREATE TABLE IF NOT EXISTS public.in_house_diagnostic_item_keys (
  bank_scope text NOT NULL CHECK (bank_scope IN ('diagnostic','remediation')),
  item_id text NOT NULL,
  item_source text NOT NULL,
  parent_item_id text,
  selectable boolean NOT NULL DEFAULT true,
  item_type text NOT NULL,
  difficulty integer CHECK (difficulty BETWEEN 1 AND 3),
  blueprint text,
  category text,
  nclex_category text,
  topic text,
  cognitive_level text,
  core_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_response jsonb,
  rationale jsonb,
  sequence_order integer,
  case_length integer,
  PRIMARY KEY (bank_scope,item_id)
);

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $function$
  SELECT false
$function$;

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
RETURNS TABLE (attempt_id uuid,checkpoint_revision integer,target_questions integer,qa_mode boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_attempt public.in_house_assessment_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.students WHERE id=p_student_id AND auth_user_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Student ownership validation failed';
  END IF;

  SELECT * INTO v_attempt
  FROM public.in_house_assessment_attempts
  WHERE student_id=p_student_id AND session_key=p_session_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.in_house_assessment_attempts (
      student_id,session_key,assessment_key,assessment_title,assessment_version,mode,status,
      ability_estimate,target_questions,checkpoint,checkpoint_revision,qa_mode
    ) VALUES (
      p_student_id,p_session_key,p_assessment_key,p_assessment_title,p_assessment_version,'practice',
      'in_progress',0.5,p_target_questions,p_checkpoint,0,p_qa_mode
    ) RETURNING * INTO v_attempt;
  END IF;

  IF v_attempt.status <> 'in_progress' OR v_attempt.assessment_key <> p_assessment_key THEN
    RAISE EXCEPTION 'Practice session is no longer in progress or belongs to another assessment.';
  END IF;

  RETURN QUERY SELECT v_attempt.id,v_attempt.checkpoint_revision,v_attempt.target_questions,v_attempt.qa_mode;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_in_house_assessment_response(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_response jsonb,
  p_checkpoint jsonb,
  p_ability_estimate numeric
)
RETURNS TABLE (checkpoint_revision integer,total_questions integer,correct_questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_attempt public.in_house_assessment_attempts%ROWTYPE;
  v_total integer;
  v_correct integer;
BEGIN
  SELECT * INTO v_attempt
  FROM public.in_house_assessment_attempts
  WHERE id=p_attempt_id AND status='in_progress'
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id=in_house_assessment_attempts.student_id AND s.auth_user_id=auth.uid()
    )
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt is not available to this account.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.in_house_assessment_item_responses
    WHERE attempt_id=p_attempt_id AND item_source=p_response->>'item_source' AND item_id=p_response->>'item_id'
  ) THEN
    SELECT count(*)::integer,count(*) FILTER (WHERE is_correct)::integer
    INTO v_total,v_correct FROM public.in_house_assessment_item_responses WHERE attempt_id=p_attempt_id;
    RETURN QUERY SELECT v_attempt.checkpoint_revision,v_total,v_correct;
    RETURN;
  END IF;

  IF v_attempt.checkpoint_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Response conflict or assessment is no longer active';
  END IF;

  INSERT INTO public.in_house_assessment_item_responses (
    attempt_id,item_id,item_source,topic,difficulty,question_type,selected_answer,correct_answer,is_correct
  ) VALUES (
    p_attempt_id,p_response->>'item_id',COALESCE(p_response->>'item_source','nclex-success-center-original'),
    p_response->>'topic',NULLIF(p_response->>'difficulty','')::integer,p_response->>'question_type',
    p_response->'selected_answer',p_response->'correct_answer',(p_response->>'is_correct')::boolean
  );

  SELECT count(*)::integer,count(*) FILTER (WHERE is_correct)::integer
  INTO v_total,v_correct FROM public.in_house_assessment_item_responses WHERE attempt_id=p_attempt_id;

  UPDATE public.in_house_assessment_attempts attempts
  SET total_questions=v_total,correct_questions=v_correct,
      checkpoint=COALESCE(p_checkpoint,'{}'::jsonb),
      checkpoint_revision=attempts.checkpoint_revision+1,updated_at=now()
  WHERE attempts.id=p_attempt_id;

  RETURN QUERY SELECT p_expected_revision+1,v_total,v_correct;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_in_house_assessment_attempt(
  p_attempt_id uuid,
  p_result text,
  p_ability_estimate numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_attempt public.in_house_assessment_attempts%ROWTYPE;
  v_total integer;
  v_correct integer;
BEGIN
  SELECT * INTO v_attempt FROM public.in_house_assessment_attempts a
  WHERE id=p_attempt_id AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.id=a.student_id AND s.auth_user_id=auth.uid()
  ) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt is not available to this account.'; END IF;
  IF v_attempt.status='completed' THEN RETURN v_attempt.id; END IF;
  SELECT count(*)::integer,count(*) FILTER (WHERE is_correct)::integer
  INTO v_total,v_correct FROM public.in_house_assessment_item_responses WHERE attempt_id=p_attempt_id;
  IF v_total<>v_attempt.target_questions THEN RAISE EXCEPTION 'Not all responses have been saved.'; END IF;
  UPDATE public.in_house_assessment_attempts
  SET status='completed',result=p_result,ability_estimate=COALESCE(p_ability_estimate,ability_estimate),
      completed_at=now(),updated_at=now(),total_questions=v_total,correct_questions=v_correct
  WHERE id=p_attempt_id;
  RETURN p_attempt_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_in_house_diagnostic_answer(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_responses jsonb,
  p_checkpoint jsonb,
  p_ability_estimate numeric,
  p_result text,
  p_complete boolean
)
RETURNS TABLE (checkpoint_revision integer,total_questions integer,correct_questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public,auth
AS $function$
DECLARE
  v_total integer;
  v_correct integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Server assessment access is required';
  END IF;
  UPDATE public.in_house_assessment_attempts attempts
  SET ability_estimate=p_ability_estimate,checkpoint=p_checkpoint,
      checkpoint_revision=p_expected_revision+1,
      status=CASE WHEN p_complete THEN 'completed' ELSE 'in_progress' END,
      result=p_result,completed_at=CASE WHEN p_complete THEN now() ELSE NULL END,updated_at=now()
  WHERE attempts.id=p_attempt_id AND attempts.status='in_progress'
    AND attempts.checkpoint_revision=p_expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assessment response conflict or attempt is no longer active'; END IF;

  INSERT INTO public.in_house_assessment_item_responses (
    attempt_id,item_id,item_source,blueprint,nclex_category,system,topic,cognitive_level,
    difficulty,question_type,selected_answer,correct_answer,is_correct,answered_at
  )
  SELECT p_attempt_id,r.item_id,COALESCE(NULLIF(r.item_source,''),'existing-original-bank'),
    r.blueprint,r.nclex_category,r.system,r.topic,r.cognitive_level,r.difficulty,r.question_type,
    r.selected_answer,r.correct_answer,r.is_correct,COALESCE(r.answered_at,now())
  FROM jsonb_to_recordset(p_responses) AS r(
    item_id text,item_source text,blueprint text,nclex_category text,system text,topic text,
    cognitive_level text,difficulty integer,question_type text,selected_answer jsonb,
    correct_answer jsonb,is_correct boolean,answered_at timestamptz
  );

  SELECT count(*)::integer,count(*) FILTER (WHERE is_correct)::integer
  INTO v_total,v_correct FROM public.in_house_assessment_item_responses WHERE attempt_id=p_attempt_id;
  UPDATE public.in_house_assessment_attempts
  SET total_questions=v_total,correct_questions=v_correct
  WHERE id=p_attempt_id;
  RETURN QUERY SELECT p_expected_revision+1,v_total,v_correct;
END;
$function$;

GRANT ALL ON public.students,public.student_resources,public.in_house_assessment_attempts,
  public.in_house_assessment_item_responses,public.in_house_diagnostic_item_keys TO service_role;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_in_house_assessment_attempt(uuid,text,text,text,text,integer,boolean,jsonb)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_in_house_assessment_response(uuid,integer,jsonb,jsonb,numeric)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_in_house_assessment_attempt(uuid,text,numeric)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.commit_in_house_diagnostic_answer(uuid,integer,jsonb,jsonb,numeric,text,boolean)
  TO service_role;
NOTIFY pgrst,'reload schema';

COMMIT;

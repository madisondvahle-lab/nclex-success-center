-- Rollback-only validation using an already assigned student account.
BEGIN;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',(
    SELECT s.auth_user_id::text FROM public.students s
    JOIN public.student_resources r ON r.student_id=s.id
    WHERE r.url='nur312-exam2-parallel.html' AND s.auth_user_id IS NOT NULL LIMIT 1
  ),true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  attempt jsonb;
  saved jsonb;
  retried jsonb;
  finished jsonb;
  refused boolean;
  revision integer := 0;
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'An assigned account is required for validation'; END IF;
  refused := false;
  BEGIN
    PERFORM public.save_nur312_parallel_practice('answer',p_attempt_id:=gen_random_uuid(),
      p_expected_revision:=0,p_item_id:='nur312-exam2-parallel-001',p_answer:=0);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Foreign or missing attempt accepted'; END IF;
  attempt := public.save_nur312_parallel_practice('start','validation-'||gen_random_uuid()::text);
  refused := false;
  BEGIN
    PERFORM public.save_nur312_parallel_practice('finish',p_attempt_id:=(attempt->>'id')::uuid);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Premature completion accepted'; END IF;

  refused := false;
  BEGIN
    PERFORM public.save_nur312_parallel_practice('answer',p_attempt_id:=(attempt->>'id')::uuid,
      p_expected_revision:=0,p_item_id:='diagnostic-item',p_answer:=0);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Non-course item accepted'; END IF;

  FOR n IN 1..116 LOOP
    saved := public.save_nur312_parallel_practice('answer',p_attempt_id:=(attempt->>'id')::uuid,
      p_expected_revision:=revision,p_item_id:='nur312-exam2-parallel-'||lpad(n::text,3,'0'),p_answer:=0);
    IF (saved->>'totalQuestions')::integer <> n THEN RAISE EXCEPTION 'Response count mismatch'; END IF;
    retried := public.save_nur312_parallel_practice('answer',p_attempt_id:=(attempt->>'id')::uuid,
      p_expected_revision:=revision,p_item_id:='nur312-exam2-parallel-'||lpad(n::text,3,'0'),p_answer:=0);
    IF retried IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Retry was not idempotent'; END IF;
    revision := (saved->>'checkpointRevision')::integer;
    IF n=1 THEN
      refused := false;
      BEGIN
        PERFORM public.save_nur312_parallel_practice('answer',p_attempt_id:=(attempt->>'id')::uuid,
          p_expected_revision:=0,p_item_id:='nur312-exam2-parallel-002',p_answer:=0);
      EXCEPTION WHEN raise_exception THEN refused := true;
      END;
      IF NOT refused THEN RAISE EXCEPTION 'Stale revision accepted'; END IF;
    END IF;
  END LOOP;
  finished := public.save_nur312_parallel_practice('finish',p_attempt_id:=(attempt->>'id')::uuid);
  IF finished->>'totalQuestions' <> '116' OR finished->>'correctQuestions' <> saved->>'correctQuestions' THEN
    RAISE EXCEPTION 'Completion totals mismatch';
  END IF;
  retried := public.save_nur312_parallel_practice('finish',p_attempt_id:=(attempt->>'id')::uuid);
  IF retried IS DISTINCT FROM finished THEN RAISE EXCEPTION 'Completion retry not idempotent'; END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  refused := false;
  BEGIN
    PERFORM public.save_nur312_parallel_practice('finish',p_attempt_id:=(attempt->>'id')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Unlinked account accepted'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('anon','public.save_nur312_parallel_practice(text,text,uuid,integer,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous access is enabled';
  END IF;
  IF has_function_privilege('authenticated','public.create_in_house_assessment_attempt(uuid,text,text,text,text,integer,boolean,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Diagnostic RPC access was reopened';
  END IF;
END;
$$;
ROLLBACK;

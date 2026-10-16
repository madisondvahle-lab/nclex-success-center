-- Synthetic fixtures only; all records roll back.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $$
DECLARE
  owner_auth uuid := gen_random_uuid();
  other_auth uuid := gen_random_uuid();
  owner_id uuid;
  other_id uuid;
  stamp timestamptz;
  result jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES(owner_auth),(other_auth);
  INSERT INTO public.students(name,pin,auth_user_id,student_type)
    VALUES('Schedule test owner',gen_random_uuid()::text,owner_auth,'nclex') RETURNING id INTO owner_id;
  INSERT INTO public.students(name,pin,auth_user_id,student_type)
    VALUES('Schedule test other',gen_random_uuid()::text,other_auth,'nclex') RETURNING id INTO other_id;
  INSERT INTO public.student_study_plans(student_id,focus_topics,practice_platform,cat_platform)
    VALUES(owner_id,ARRAY['fixture focus'],'Archer','UWorld') RETURNING updated_at INTO stamp;
  INSERT INTO public.student_study_plans(student_id) VALUES(other_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  result := public.update_my_study_days(ARRAY['sun','thu','tue'],ARRAY['fri','mon'],stamp);
  ASSERT result->'practice_days' = '["tue","thu","sun"]'::jsonb;
  ASSERT result->'cat_days' = '["mon","fri"]'::jsonb;
  ASSERT result->>'practice_questions_per_day' = '50';
  ASSERT result->>'practice_platform' = 'Archer';
  ASSERT result->>'cat_platform' = 'UWorld';
  ASSERT result->'focus_topics' = '["fixture focus"]'::jsonb;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['mon','wed','fri'],ARRAY['tue','sat'],stamp);
    RAISE EXCEPTION 'Stale save accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Your plan changed.%' THEN RAISE; END IF;
  END;
  stamp := (result->>'updated_at')::timestamptz;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Workload change accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Keep the number%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['tue','fri'],stamp);
    RAISE EXCEPTION 'Overlap accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Choose separate%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','thu','fri'],ARRAY['sun','mon'],stamp);
    RAISE EXCEPTION 'Adjacent CATs accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Leave at least one day%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','tue','sun'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Duplicate days accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Choose each day%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue',NULL,'sun'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Null day accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Choose valid days%' THEN RAISE; END IF;
  END;
  ASSERT NOT EXISTS(SELECT 1 FROM public.student_study_plans WHERE student_id=other_id), 'RLS isolates plans';
  BEGIN
    UPDATE public.student_study_plans SET practice_questions_per_day=1 WHERE student_id=owner_id;
    ASSERT NOT FOUND, 'Direct plan updates remain denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  ASSERT (SELECT practice_days=ARRAY['mon','wed','fri'] FROM public.student_study_plans WHERE student_id=other_id);
  UPDATE public.students SET archived_at=now() WHERE id=owner_id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Archived account accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'No active NCLEX weekly plan%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  UPDATE public.students SET archived_at=NULL,student_type='nursing_student' WHERE id=owner_id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Nursing account accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'No active NCLEX weekly plan%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['mon','fri'],stamp);
    RAISE EXCEPTION 'Anonymous call accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END;
$$;
ROLLBACK;

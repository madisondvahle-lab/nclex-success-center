-- Synthetic fixtures only. Run after supabase-weekly-cat-details-migration.sql.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $$
DECLARE
  admin_auth uuid := gen_random_uuid();
  owner_auth uuid := gen_random_uuid();
  other_auth uuid := gen_random_uuid();
  sid uuid;
  other_id uuid;
  result jsonb;
  stamp timestamptz;
  assignment_id uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES(admin_auth),(owner_auth),(other_auth);
  INSERT INTO public.app_admins(user_id) VALUES(admin_auth);
  INSERT INTO public.students(name,pin,auth_user_id,student_type,nclex_target_date)
    VALUES('CAT fixture owner',gen_random_uuid()::text,owner_auth,'nclex','2099-01-08')
    RETURNING id INTO sid;
  INSERT INTO public.students(name,pin,auth_user_id,student_type)
    VALUES('CAT fixture other',gen_random_uuid()::text,other_auth,'nclex')
    RETURNING id INTO other_id;
  INSERT INTO public.student_study_plans(student_id,focus_categories,cat_platform,cat_assignments)
    VALUES(sid,ARRAY['Management of Care'],'Archer',
      '{"tue":{"platform":"Bootcamp","title":"Bootcamp CAT assessment","instructions":"Log the report afterward."},"sat":{"platform":"Remar","title":"Readiness task","instructions":"Tutor directions."}}')
    RETURNING updated_at INTO stamp;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-05',sid);
  ASSERT (result->>'created')::int = 3, 'Only Mon/Tue/Wed assignments before the Thursday exam';
  ASSERT NOT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=sid AND due_on>='2099-01-08');
  SELECT id INTO STRICT assignment_id FROM public.student_resources
    WHERE student_id=sid AND due_on='2099-01-06' AND assignment_kind='cat'
      AND title='Bootcamp CAT assessment' AND url IS NULL
      AND assignment_details->>'platform'='Bootcamp'
      AND note LIKE '%Log the report afterward.%';
  PERFORM public.set_weekly_assignment_complete(assignment_id,true);
  result := public.generate_weekly_assignments('2099-01-05',sid);
  ASSERT (result->>'created')::int=0 AND (result->>'existing')::int=3;
  ASSERT (SELECT completed_at IS NOT NULL FROM public.student_resources WHERE id=assignment_id);
  result := public.generate_weekly_assignments('2099-01-12',sid);
  ASSERT (result->>'created')::int=0, 'No work after an earlier exam';
  RESET ROLE;
  UPDATE public.students SET nclex_target_date=NULL WHERE id=sid;
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-12',sid);
  ASSERT (result->>'created')::int=5, 'Unscheduled exam leaves the usual full week';
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=sid AND due_on='2099-01-17'
    AND title='Readiness task' AND assignment_details->>'platform'='Remar');
  RESET ROLE;
  UPDATE public.students SET nclex_target_date='2099-01-19' WHERE id=sid;
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-19',sid);
  ASSERT (result->>'created')::int=0, 'Monday exam protects the entire week';
  RESET ROLE;
  UPDATE public.students SET nclex_target_date='2099-01-25' WHERE id=sid;
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-19',sid);
  ASSERT (result->>'created')::int=5, 'Sunday exam preserves the preceding scheduled slots';
  UPDATE public.student_study_plans SET cat_assignments='{}',cat_platform='NurseMeg' WHERE student_id=sid;
  RESET ROLE;
  UPDATE public.students SET nclex_target_date=NULL WHERE id=sid;
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-26',sid);
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=sid AND assignment_week='2099-01-26'
    AND assignment_kind='cat' AND title='NurseMeg CAT / readiness exam');
  UPDATE public.student_study_plans SET cat_assignments=
    '{"tue":{"platform":"Bootcamp","title":"First CAT","instructions":"First directions"},"sat":{"platform":"Archer","title":"Second CAT","instructions":"Second directions"}}'
    WHERE student_id=sid RETURNING updated_at INTO stamp;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  result := public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['mon','fri'],stamp);
  ASSERT result->'cat_assignments' =
    '{"mon":{"platform":"Bootcamp","title":"First CAT","instructions":"First directions"},"fri":{"platform":"Archer","title":"Second CAT","instructions":"Second directions"}}'::jsonb,
    'Student day changes preserve both CAT tasks in weekly order';
  ASSERT result->>'cat_platform'='NurseMeg';
  ASSERT NOT EXISTS(SELECT 1 FROM public.student_study_plans WHERE student_id=other_id);
  BEGIN
    PERFORM public.generate_weekly_assignments('2099-02-02',sid);
    RAISE EXCEPTION 'Student generated assignments';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Admin access required' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
  result := public.generate_weekly_assignments('2099-02-02',sid);
  ASSERT (result->>'created')::int=5;
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=sid AND due_on='2099-02-02'
    AND assignment_details->>'platform'='Bootcamp' AND title='First CAT');
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=sid AND due_on='2099-02-06'
    AND assignment_details->>'platform'='Archer' AND title='Second CAT');
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE id=assignment_id AND completed_at IS NOT NULL
    AND title='Bootcamp CAT assessment'), 'Previously generated work remains unchanged';
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.generate_weekly_assignments('2099-02-02',sid);
    RAISE EXCEPTION 'Anonymous generation permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS: CAT snapshots, exam boundaries, idempotence, day moves, and access controls';
END;
$$;
ROLLBACK;

-- Live integration test. All plan/resource changes roll back. No question changes.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $$
DECLARE
  admin_id uuid; student_auth uuid; sid uuid; other_id uuid;
  own_resource uuid; other_resource uuid; result jsonb; focus text;
  stamp timestamptz; again timestamptz; affected integer;
BEGIN
  SELECT user_id INTO STRICT admin_id FROM public.app_admins LIMIT 1;
  SELECT s.id,s.auth_user_id INTO STRICT sid,student_auth FROM public.students s
    WHERE s.auth_user_id IS NOT NULL AND s.archived_at IS NULL
      AND s.student_type IS DISTINCT FROM 'nursing_student'
      AND NOT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id=s.auth_user_id)
    ORDER BY s.id LIMIT 1;
  SELECT id INTO STRICT other_id FROM public.students WHERE id<>sid AND archived_at IS NULL
    AND student_type IS DISTINCT FROM 'nursing_student' ORDER BY id LIMIT 1;
  SELECT nclex_sub INTO STRICT focus FROM public.questions
    WHERE active AND item_type='mcq' AND lower(correct_answer) IN ('a','b','c','d')
      AND nclex_sub IN ('Management of Care','Safety and Infection Control','Health Promotion and Maintenance',
        'Psychosocial Integrity','Basic Care and Comfort','Pharmacological and Parenteral Therapies',
        'Reduction of Risk Potential','Physiological Adaptation')
    GROUP BY nclex_sub HAVING count(*)>=2 ORDER BY count(*) DESC LIMIT 1;
  INSERT INTO public.student_study_plans(student_id,practice_days,practice_questions_per_day,practice_platform,
    cat_days,cat_platform,focus_categories,focus_topics)
    VALUES(sid,ARRAY['mon','wed','fri'],50,'UWorld',ARRAY['tue','sat'],'Archer',ARRAY[focus],'{}')
    ON CONFLICT(student_id) DO UPDATE SET practice_days=excluded.practice_days,
      practice_questions_per_day=excluded.practice_questions_per_day,practice_platform=excluded.practice_platform,
      cat_days=excluded.cat_days,cat_platform=excluded.cat_platform,focus_categories=excluded.focus_categories,focus_topics='{}';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  result := public.generate_weekly_assignments('2099-01-05',sid);
  ASSERT (result->>'created')::int=5, 'Must create 3 practice + 2 CAT assignments';
  ASSERT jsonb_array_length(result->'failures')=0;
  ASSERT (SELECT count(*) FROM public.student_resources WHERE student_id=sid AND assignment_week='2099-01-05'
    AND assignment_kind='practice' AND assignment_details->>'question_count'='50' AND url IS NULL)=3;
  result := public.generate_weekly_assignments('2099-01-05',sid);
  ASSERT (result->>'created')::int=0 AND (result->>'existing')::int=5, 'Rerun must be idempotent';
  SELECT id INTO STRICT own_resource FROM public.student_resources WHERE student_id=sid AND assignment_week='2099-01-05' LIMIT 1;
  stamp := public.set_weekly_assignment_complete(own_resource,true);
  result := public.generate_weekly_assignments('2099-01-05',sid);
  ASSERT (SELECT completed_at=stamp FROM public.student_resources WHERE id=own_resource), 'Rerun preserves completion';
  BEGIN
    PERFORM public.generate_weekly_assignments('2099-01-06',sid);
    RAISE EXCEPTION 'Tuesday incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Choose a Monday for the assignment week' THEN RAISE; END IF;
  END;
  UPDATE public.student_study_plans SET practice_platform='Portal Question Bank',cat_platform='Portal Question Bank',
    practice_questions_per_day=2 WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-01-12',sid);
  ASSERT (result->>'created')::int=5;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.student_resources r,
      LATERAL jsonb_array_elements_text(r.assignment_details->'question_ids') ids(id)
      LEFT JOIN public.questions q ON q.id=ids.id::uuid
    WHERE r.student_id=sid AND r.assignment_week='2099-01-12' AND r.assignment_kind='practice'
      AND (q.id IS NULL OR NOT q.active OR q.item_type<>'mcq' OR q.nclex_sub<>focus)
  ), 'Frozen portal IDs must be active matching MCQs';
  ASSERT (SELECT count(*) FROM public.student_resources WHERE student_id=sid AND assignment_week='2099-01-12'
    AND assignment_kind='practice' AND jsonb_array_length(assignment_details->'question_ids')=2)=3;
  UPDATE public.student_study_plans SET focus_topics=ARRAY['__no_such_weekly_assignment_topic__'] WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-01-19',sid);
  ASSERT (result->>'created')::int=2 AND jsonb_array_length(result->'failures')=3, 'Insufficient pools must not broaden focus';
  UPDATE public.student_study_plans SET focus_categories='{}',focus_topics='{}' WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-02-02',sid);
  ASSERT (result->>'created')::int=2 AND jsonb_array_length(result->'failures')=3, 'Missing focus must be explicit';
  UPDATE public.student_study_plans SET focus_categories=ARRAY[focus],practice_platform='UWorld',
    practice_days=ARRAY['tue','thu','sun'],cat_days=ARRAY['mon','fri'] WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-02-09',sid);
  ASSERT (result->>'created')::int=5, 'Per-student schedules may include weekends';
  ASSERT EXISTS (SELECT 1 FROM public.student_resources WHERE student_id=sid AND due_on='2099-02-15' AND assignment_kind='practice');
  UPDATE public.student_study_plans SET practice_days=ARRAY['mon','tue','wed'],cat_days=ARRAY['tue','sat'] WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-02-16',sid);
  ASSERT (result->>'created')::int=0 AND jsonb_array_length(result->'failures')=1,
    'At least three practice days without a CAT are required';
  UPDATE public.student_study_plans SET practice_days=ARRAY['mon','wed','fri'] WHERE student_id=sid;
  UPDATE public.student_study_plans SET focus_categories=ARRAY[focus],practice_platform='UWorld' WHERE student_id=sid;
  INSERT INTO public.student_study_plans(student_id,focus_categories)
    VALUES(other_id,ARRAY[focus]) ON CONFLICT(student_id) DO UPDATE SET
      focus_categories=excluded.focus_categories,focus_topics='{}',practice_platform='Archer',
      practice_days=ARRAY['mon','wed','fri'],cat_days=ARRAY['tue','sat'];
  result := public.generate_weekly_assignments('2099-01-26',NULL);
  ASSERT (SELECT count(*) FROM public.student_resources WHERE assignment_week='2099-01-26' AND student_id IN (sid,other_id))=10,
    'Bulk generation includes both planned students';
  ASSERT NOT EXISTS (SELECT 1 FROM public.student_resources r JOIN public.students s ON s.id=r.student_id
    WHERE r.assignment_week='2099-01-26' AND (s.archived_at IS NOT NULL OR s.student_type='nursing_student'));
  result := public.generate_weekly_assignments('2099-01-26',NULL);
  ASSERT (result->>'created')::int=0 AND (result->>'existing')::int>=10, 'Bulk reruns must be idempotent';
  INSERT INTO public.student_resources(student_id,title,resource_type,due_on,assignment_week,assignment_kind,assignment_details)
    VALUES(other_id,'RLS fixture','practice_set','2099-01-05','2099-01-05','practice','{}') RETURNING id INTO other_resource;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',student_auth,'role','authenticated')::text,true);
  ASSERT NOT EXISTS(SELECT 1 FROM public.student_resources WHERE id=other_resource), 'Student cannot read another assignment';
  ASSERT EXISTS(SELECT 1 FROM public.student_resources WHERE id=own_resource), 'Student can read own assignment';
  BEGIN
    PERFORM public.generate_weekly_assignments('2099-01-05',sid);
    RAISE EXCEPTION 'Student incorrectly generated assignments';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Admin access required' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.set_weekly_assignment_complete(other_resource,true);
    RAISE EXCEPTION 'Student completed another assignment';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Weekly assignment not found or access denied' THEN RAISE; END IF; END;
  again := public.set_weekly_assignment_complete(own_resource,true);
  ASSERT again=stamp, 'Repeated completion preserves original timestamp';
  PERFORM public.set_weekly_assignment_complete(own_resource,false);
  ASSERT (SELECT completed_at IS NULL FROM public.student_resources WHERE id=own_resource);
  UPDATE public.student_resources SET title='Tampered',student_id=other_id WHERE id=own_resource;
  GET DIAGNOSTICS affected=ROW_COUNT;
  ASSERT affected=0, 'Student may not update assignment metadata';
  BEGIN
    INSERT INTO public.student_resources(student_id,title,resource_type) VALUES(sid,'Unauthorized','practice_set');
    RAISE EXCEPTION 'Student inserted an assignment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.student_resources LIMIT 1;
    RAISE EXCEPTION 'Anon read resources';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_weekly_assignment_complete(own_resource,true);
    RAISE EXCEPTION 'Anon completed assignment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.student_resources'::regclass);
  RAISE NOTICE 'PASS: generation, frozen active IDs, focus failures, idempotence, admin/student/anon RLS and completion';
END $$;
ROLLBACK;

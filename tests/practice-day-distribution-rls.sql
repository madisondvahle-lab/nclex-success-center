-- Synthetic fixtures only; everything rolls back. Run after supabase-practice-day-distribution-migration.sql.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $$
DECLARE
  admin_auth uuid := gen_random_uuid();
  owner_auth uuid := gen_random_uuid();
  sid uuid; other_id uuid; result jsonb; stamp timestamptz; rid uuid; cat_id uuid; done_id uuid; other_before text;
  ids uuid[]; details jsonb;
  wed jsonb := '{"wed":{"platform":"UWorld","total":50,"mixed":35,"targets":[{"kind":"category","name":"Safety and Infection Control","count":15}]}}';
  retarget jsonb := '{"platform":"Archer","total":50,"mixed":30,"targets":[{"kind":"category","name":"Management of Care","count":10},{"kind":"category","name":"Pharmacological and Parenteral Therapies","count":10}]}';
BEGIN
  INSERT INTO auth.users(id) VALUES(admin_auth),(owner_auth);
  INSERT INTO public.app_admins(user_id) VALUES(admin_auth);
  INSERT INTO public.students(name,pin,auth_user_id,student_type)
    VALUES('Distribution fixture',gen_random_uuid()::text,owner_auth,'nclex') RETURNING id INTO sid;
  INSERT INTO public.students(name,pin,student_type)
    VALUES('Distribution other',gen_random_uuid()::text,'nclex') RETURNING id INTO other_id;
  INSERT INTO public.student_study_plans(student_id,focus_categories,plan_notes,practice_day_assignments)
    VALUES(sid,ARRAY['Physiological Adaptation'],'Keep a missed-question log.',wed);
  -- Course-exam questions must never fill distribution slots.
  INSERT INTO public.questions(stem,option_a,option_b,option_c,option_d,correct_answer,nclex_category,nclex_sub,topic,course_key,exam_key)
    SELECT 'Course item '||g,'a','b','c','d','a','Safe and Effective Care Environment','Management of Care','Isolation','fixture-course','exam-1'
    FROM generate_series(1,300) g;

  -- Validation mirrors the admin editor.
  ASSERT public.practice_distribution_error(wed->'wed') IS NULL;
  ASSERT public.practice_distribution_error('{"total":50,"mixed":30,"targets":[{"kind":"category","name":"Management of Care","count":10}]}') LIKE '%add up to 40%';
  ASSERT public.practice_distribution_error('{"total":20,"mixed":0,"targets":[{"kind":"category","name":"Cardiac","count":20}]}') LIKE '%not an NCLEX%';
  ASSERT public.practice_distribution_error('{"total":20,"mixed":10,"targets":[{"kind":"topic","name":"Cardiac","count":5},{"kind":"topic","name":"cardiac","count":5}]}') LIKE '%more than once%';
  ASSERT public.practice_distribution_error('{"total":20.5,"mixed":20.5}') LIKE 'Total questions%';
  ASSERT public.practice_distribution_error('{"total":10,"mixed":10,"targets":[{"kind":"topic","name":"X","count":0}]}') LIKE 'Each targeted%';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_auth,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;

  -- Customized Wednesday; Monday/Friday keep the existing focus-based behavior.
  result := public.generate_weekly_assignments('2099-03-02',sid);
  ASSERT (result->>'created')::int=5 AND jsonb_array_length(result->'failures')=0, result::text;
  SELECT assignment_details INTO STRICT details FROM public.student_resources
    WHERE student_id=sid AND due_on='2099-03-04' AND assignment_kind='practice'
      AND title='UWorld Practice: 50 questions' AND url IS NULL
      AND note LIKE '%35 mixed NCLEX questions (all client-needs categories)%'
      AND note LIKE '%15 Safety and Infection Control questions%'
      AND note LIKE '%Remediation focus: Safety and Infection Control.%'
      AND note LIKE '%does not create or configure tests in UWorld%'
      AND note LIKE E'%\nCoach note: Keep a missed-question log.';
  ASSERT details->'distribution'='{"mixed":35,"targets":[{"kind":"category","name":"Safety and Infection Control","count":15}]}'::jsonb;
  ASSERT (details->>'question_count')::int=50 AND details->'categories'='["Safety and Infection Control"]'::jsonb;
  ASSERT (SELECT count(*) FROM public.student_resources WHERE student_id=sid AND assignment_week='2099-03-02'
    AND assignment_kind='practice' AND title='UWorld: 50 targeted questions' AND NOT assignment_details ? 'distribution')=2,
    'Non-customized days are unchanged';
  result := public.generate_weekly_assignments('2099-03-02',sid);
  ASSERT (result->>'created')::int=0 AND (result->>'existing')::int=5, 'Reruns stay idempotent';

  -- Portal distribution freezes distinct active MCQs: targeted areas first, then mixed.
  UPDATE public.student_study_plans SET practice_day_assignments = practice_day_assignments ||
    '{"fri":{"platform":"Portal Question Bank","total":20,"mixed":10,"targets":[{"kind":"category","name":"Management of Care","count":5},{"kind":"topic","name":"Isolation","count":5}]}}'
    WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-03-09',sid);
  ASSERT (result->>'created')::int=5, result::text;
  SELECT id,assignment_details INTO STRICT rid,details FROM public.student_resources
    WHERE student_id=sid AND due_on='2099-03-13' AND assignment_kind='practice';
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(details->'question_ids');
  ASSERT cardinality(ids)=20 AND (SELECT count(DISTINCT x) FROM unnest(ids) x)=20, 'Twenty distinct frozen IDs';
  ASSERT (SELECT count(*) FROM public.questions WHERE id=ANY(ids[1:5]) AND nclex_sub='Management of Care')=5;
  ASSERT (SELECT count(*) FROM public.questions WHERE id=ANY(ids[6:10]) AND topic='Isolation')=5;
  ASSERT (SELECT count(*) FROM public.questions WHERE id=ANY(ids) AND (course_key IS NOT NULL OR exam_key IS NOT NULL))=0,
    'Only general NCLEX questions are assigned';
  ASSERT (SELECT url FROM public.student_resources WHERE id=rid)='supplemental-practice.html?assignment='||rid;

  -- Short portal pools and invalid saved days are reported, never broadened; other days still generate.
  UPDATE public.student_study_plans SET practice_day_assignments =
    '{"mon":{"platform":"Portal Question Bank","total":5,"mixed":2,"targets":[{"kind":"topic","name":"No such topic","count":3}]},
      "wed":{"platform":"UWorld","total":50,"mixed":30,"targets":[]}}'
    WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-03-16',sid);
  ASSERT (result->>'created')::int=3 AND jsonb_array_length(result->'failures')=2, result::text;
  ASSERT result->'failures'->0->>'reason' LIKE 'Customized Mon practice: Only 0 active matching%';
  ASSERT result->'failures'->1->>'reason' LIKE 'Customized Wed practice: Mixed and targeted questions add up to 30%';

  -- Customized days do not require plan-level focus; default days still do.
  UPDATE public.student_study_plans SET focus_categories='{}', practice_day_assignments=wed WHERE student_id=sid;
  result := public.generate_weekly_assignments('2099-03-23',sid);
  ASSERT (result->>'created')::int=3 AND jsonb_array_length(result->'failures')=2, 'Wed + 2 CATs; Mon/Fri need focus';

  -- Retarget one upcoming assignment without touching others.
  SELECT id,assignment_details INTO STRICT rid,details FROM public.student_resources
    WHERE student_id=sid AND due_on='2099-03-02' AND assignment_kind='practice';
  SELECT string_agg(r::text, '|' ORDER BY id) INTO other_before FROM public.student_resources r WHERE student_id=sid AND id<>rid;
  result := public.update_weekly_practice_assignment(rid, retarget, details, 'Test 22 review');
  ASSERT result->>'title'='Archer Practice: 50 questions';
  ASSERT result->'assignment_details'->'distribution'->>'mixed'='30';
  ASSERT result->>'note' LIKE '%Remediation focus: Management of Care, Pharmacological and Parenteral Therapies.%';
  ASSERT result->>'note' LIKE E'%\nCoach note: Keep a missed-question log.', 'Coach note captured at generation is preserved';
  ASSERT (SELECT string_agg(r::text, '|' ORDER BY id) FROM public.student_resources r WHERE student_id=sid AND id<>rid)=other_before,
    'Other assignments are unchanged';
  ASSERT EXISTS(SELECT 1 FROM public.student_assignment_revisions WHERE resource_id=rid AND scope='assignment'
    AND reason='Test 22 review' AND changed_by=admin_auth AND previous->'assignment_details'=details);
  BEGIN
    PERFORM public.update_weekly_practice_assignment(rid, retarget, details, NULL);
    RAISE EXCEPTION 'stale edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This assignment changed%' THEN RAISE; END IF;
  END;
  SELECT assignment_details INTO details FROM public.student_resources WHERE id=rid;
  BEGIN
    PERFORM public.update_weekly_practice_assignment(rid, '{"total":50,"mixed":10}', details, NULL);
    RAISE EXCEPTION 'invalid distribution accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Mixed and targeted questions add up to 10%' THEN RAISE; END IF;
  END;
  SELECT id INTO STRICT cat_id FROM public.student_resources WHERE student_id=sid AND due_on='2099-03-03' AND assignment_kind='cat';
  BEGIN
    PERFORM public.update_weekly_practice_assignment(cat_id, retarget, (SELECT assignment_details FROM public.student_resources WHERE id=cat_id), NULL);
    RAISE EXCEPTION 'CAT edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Only generated practice%' THEN RAISE; END IF;
  END;
  SELECT id INTO STRICT done_id FROM public.student_resources WHERE student_id=sid AND due_on='2099-03-06' AND assignment_kind='practice';
  PERFORM public.set_weekly_assignment_complete(done_id,true);
  BEGIN
    PERFORM public.update_weekly_practice_assignment(done_id, retarget, (SELECT assignment_details FROM public.student_resources WHERE id=done_id), NULL);
    RAISE EXCEPTION 'completed edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Completed assignments%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  -- A submitted portal score blocks retargeting even if completion was later unmarked.
  SELECT id INTO STRICT done_id FROM public.student_resources WHERE student_id=sid AND due_on='2099-03-11' AND assignment_kind='practice';
  INSERT INTO public.student_supplemental_practice_results(student_id,practice_key,practice_title,score,total_questions)
    VALUES(sid,'weekly-'||done_id,'Weekly practice',40,50);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_weekly_practice_assignment(done_id, retarget, (SELECT assignment_details FROM public.student_resources WHERE id=done_id), NULL);
    RAISE EXCEPTION 'submitted edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'The student already submitted%' THEN RAISE; END IF;
  END;
  RESET ROLE;
  INSERT INTO public.student_resources(student_id,title,resource_type,due_on,assignment_week,assignment_kind,assignment_details)
    VALUES(sid,'Old practice','practice_set','2000-01-03','2000-01-03','practice','{"platform":"UWorld","question_count":50}')
    RETURNING id INTO done_id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_weekly_practice_assignment(done_id, retarget, '{"platform":"UWorld","question_count":50}', NULL);
    RAISE EXCEPTION 'past edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Past assignments%' THEN RAISE; END IF;
  END;

  -- Student: can move days (customizations follow in weekly order) but cannot retarget or see revisions.
  RESET ROLE;
  UPDATE public.student_study_plans SET practice_day_assignments=wed WHERE student_id=sid RETURNING updated_at INTO stamp;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_auth,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  result := public.update_my_study_days(ARRAY['tue','thu','sun'],ARRAY['mon','fri'],stamp);
  ASSERT result->'practice_day_assignments' = jsonb_build_object('thu', wed->'wed'), result::text;
  BEGIN
    PERFORM public.update_weekly_practice_assignment(rid, retarget, details, NULL);
    RAISE EXCEPTION 'student retargeted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Admin access required' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM public.student_assignment_revisions)=0, 'Students cannot read revisions';
  BEGIN
    INSERT INTO public.student_assignment_revisions(student_id,scope) VALUES(sid,'plan_day');
    RAISE EXCEPTION 'student wrote revision';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.practice_distribution_snapshot(rid,'Portal Question Bank',wed->'wed','');
    RAISE EXCEPTION 'helper callable directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.update_weekly_practice_assignment(rid, retarget, details, NULL);
    RAISE EXCEPTION 'anon retargeted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.student_assignment_revisions;
    RAISE EXCEPTION 'anon read revisions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.student_resources WHERE student_id=other_id), 'Other students untouched';
  RAISE NOTICE 'PASS: per-day distributions, portal selection, retargeting, revisions, day moves, and access controls';
END;
$$;
ROLLBACK;

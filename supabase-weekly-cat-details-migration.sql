-- Per-CAT details and NCLEX target-date cutoff for weekly assignments.
-- Apply after supabase-weekly-study-plan-migration.sql and
-- supabase-weekly-assignments-migration.sql.
BEGIN;

ALTER TABLE public.student_study_plans
  ADD COLUMN IF NOT EXISTS cat_assignments jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(cat_assignments) = 'object');

CREATE OR REPLACE FUNCTION public.generate_weekly_assignments(p_week date, p_student uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p record; slot record; rid uuid; ids jsonb; details jsonb;
  n integer; made integer := 0; existing integer := 0;
  failures jsonb := '[]'; platform text; qty integer; cats text[]; topics text[];
  cat_config jsonb; task_title text; task_instructions text;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_week IS NULL OR extract(isodow FROM p_week) <> 1 THEN
    RAISE EXCEPTION 'Choose a Monday for the assignment week';
  END IF;
  IF p_student IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_study_plans sp JOIN public.students s ON s.id = sp.student_id
    WHERE s.id = p_student AND s.archived_at IS NULL AND s.student_type IS DISTINCT FROM 'nursing_student'
  ) THEN RAISE EXCEPTION 'Active NCLEX student with a saved plan required'; END IF;
  FOR p IN SELECT sp.*, s.nclex_target_date AS nclex_target_date
    FROM public.student_study_plans sp JOIN public.students s ON s.id = sp.student_id
    WHERE s.archived_at IS NULL AND s.student_type IS DISTINCT FROM 'nursing_student'
      AND (p_student IS NULL OR s.id = p_student)
    ORDER BY sp.student_id
  LOOP
    PERFORM 1 FROM public.student_study_plans WHERE student_id = p.student_id FOR UPDATE;
    IF p.nclex_target_date IS NOT NULL AND p.nclex_target_date <= p_week THEN
      failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',p.nclex_target_date,
        'reason','No assignments generated: the NCLEX target date is on or before this assignment week.'));
      CONTINUE;
    END IF;
    IF p.nclex_target_date IS NOT NULL AND p.nclex_target_date <= p_week + 6 THEN
      failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',p.nclex_target_date,
        'reason','Assignments on or after the NCLEX target date were skipped.'));
    END IF;
    IF (SELECT count(DISTINCT d) FROM unnest(p.practice_days) d WHERE NOT (d = ANY(p.cat_days))) < 3 THEN
      failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',p_week,
        'reason','Set at least 3 practice days without a CAT before generating this week. Any days, including weekends, are allowed.'));
      CONTINUE;
    END IF;
    FOR slot IN
      SELECT p_week + d.i AS due, d.day, k.kind
      FROM (VALUES (0,'mon'),(1,'tue'),(2,'wed'),(3,'thu'),(4,'fri'),(5,'sat'),(6,'sun')) d(i,day)
      CROSS JOIN (VALUES ('practice'),('cat')) k(kind)
      WHERE ((k.kind = 'practice' AND d.day = ANY(p.practice_days))
         OR (k.kind = 'cat' AND d.day = ANY(p.cat_days)))
        AND (p.nclex_target_date IS NULL OR p_week + d.i < p.nclex_target_date)
      ORDER BY due, kind
    LOOP
      IF EXISTS (SELECT 1 FROM public.student_resources r WHERE r.student_id = p.student_id
          AND r.due_on = slot.due AND r.assignment_kind = slot.kind AND r.assignment_week IS NOT NULL) THEN
        existing := existing + 1; CONTINUE;
      END IF;
      cat_config := CASE WHEN slot.kind = 'cat' THEN coalesce(p.cat_assignments->slot.day, '{}'::jsonb) ELSE '{}'::jsonb END;
      platform := CASE WHEN slot.kind = 'practice' THEN p.practice_platform
        ELSE coalesce(nullif(btrim(cat_config->>'platform'),''),p.cat_platform) END;
      qty := CASE WHEN slot.kind = 'practice' THEN p.practice_questions_per_day ELSE NULL END;
      task_title := CASE WHEN slot.kind = 'cat' THEN nullif(left(btrim(cat_config->>'title'),120),'') ELSE NULL END;
      task_instructions := CASE WHEN slot.kind = 'cat' THEN nullif(left(btrim(cat_config->>'instructions'),500),'') ELSE NULL END;
      cats := coalesce(p.focus_categories, '{}'); topics := coalesce(p.focus_topics, '{}');
      ids := NULL;
      IF slot.kind = 'practice' AND cardinality(cats) + cardinality(topics) = 0 THEN
        failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',slot.due,
          'reason','Set focus categories or topics before generating targeted practice.'));
        CONTINUE;
      END IF;
      IF slot.kind = 'practice' AND platform = 'Portal Question Bank' THEN
        SELECT jsonb_agg(q.id) INTO ids FROM (
          SELECT b.id FROM public.questions b
          CROSS JOIN LATERAL (SELECT replace(concat_ws(' ',b.nclex_category,b.nclex_sub),'_',' ') AS label) c
          WHERE b.active = true AND b.item_type = 'mcq'
            AND lower(b.correct_answer) IN ('a','b','c','d')
            AND (cardinality(cats) = 0 OR
              CASE
                WHEN c.label ~* 'management of care|^mgmt' THEN 'Management of Care'
                WHEN c.label ~* 'safety|infection' THEN 'Safety and Infection Control'
                WHEN c.label ~* 'health promotion' THEN 'Health Promotion and Maintenance'
                WHEN c.label ~* 'psychosocial' THEN 'Psychosocial Integrity'
                WHEN c.label ~* 'basic care|comfort' THEN 'Basic Care and Comfort'
                WHEN c.label ~* 'pharmacolog|parenteral' THEN 'Pharmacological and Parenteral Therapies'
                WHEN c.label ~* 'reduction of risk|risk potential' THEN 'Reduction of Risk Potential'
                WHEN c.label ~* 'physiological adaptation|physiologic adaptation' THEN 'Physiological Adaptation'
              END = ANY(cats))
            AND (cardinality(topics) = 0 OR EXISTS (
              SELECT 1 FROM unnest(topics) t WHERE lower(trim(b.topic)) = lower(trim(t))))
          ORDER BY random() LIMIT qty
        ) q;
        IF coalesce(jsonb_array_length(ids),0) < qty THEN
          failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',slot.due,
            'reason',format('Only %s active matching multiple-choice questions; %s required. Adjust focus or count. Topics must match bank labels exactly.',coalesce(jsonb_array_length(ids),0),qty)));
          CONTINUE;
        END IF;
      END IF;
      rid := gen_random_uuid();
      details := jsonb_build_object('platform',platform,'question_count',qty,
        'categories',CASE WHEN slot.kind = 'practice' THEN cats ELSE '{}'::text[] END,
        'topics',CASE WHEN slot.kind = 'practice' THEN topics ELSE '{}'::text[] END,
        'mode',CASE WHEN slot.kind = 'cat' THEN 'CAT / readiness exam' WHEN platform = 'Portal Question Bank' THEN 'Exam practice; review rationales afterward' ELSE 'Timed practice, tutor mode off; review rationales afterward' END,
        'task_title',task_title,'task_instructions',task_instructions,
        'question_ids',ids);
      INSERT INTO public.student_resources(id, student_id, title, resource_type, url, note, due_on,
        assignment_week, assignment_kind, assignment_details)
      VALUES (rid,p.student_id,
        CASE WHEN slot.kind = 'cat' THEN coalesce(task_title,platform || ' CAT / readiness exam') ELSE platform || ': ' || qty || ' targeted questions' END,
        'practice_set',
        CASE WHEN platform = 'Portal Question Bank' THEN
          CASE WHEN slot.kind = 'cat' THEN 'diagnostic.html?mode=mock' ELSE 'supplemental-practice.html?assignment=' || rid END
          ELSE NULL END,
        CASE WHEN slot.kind = 'cat' THEN 'Complete one CAT / readiness exam.' ||
          CASE WHEN task_instructions IS NOT NULL THEN E'\nInstructions: ' || task_instructions ELSE '' END ||
          ' Log your report on your dashboard for Madison to review.'
          ELSE 'Focus categories: ' || coalesce(nullif(array_to_string(cats,', '),''),'all categories within selected topics') ||
            '. Topics: ' || coalesce(nullif(array_to_string(topics,', '),''),'all topics within selected categories') ||
            CASE WHEN platform = 'Portal Question Bank' THEN '. Exam practice; review rationales afterward.'
              ELSE '. Timed practice, tutor mode off; review rationales afterward.' END END ||
          CASE WHEN platform <> 'Portal Question Bank' THEN ' Set this up manually in your platform; the portal does not send assignments to external platforms.' ELSE '' END ||
          CASE WHEN coalesce(p.plan_notes,'') <> '' THEN E'\nCoach note: ' || p.plan_notes ELSE '' END,
        slot.due,p_week,slot.kind,details);
      made := made + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created',made,'existing',existing,'failures',failures);
END $$;
REVOKE ALL ON FUNCTION public.generate_weekly_assignments(date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_weekly_assignments(date, uuid) TO authenticated;

-- Keep the tutor's first/second CAT tasks when students move their study days.
CREATE OR REPLACE FUNCTION public.update_my_study_days(
  p_practice_days text[],
  p_cat_days text[],
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved public.student_study_plans%ROWTYPE;
  allowed text[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  practice text[];
  cats text[];
  previous_cats text[];
  tasks jsonb := '{}'::jsonb;
  positions integer[];
  i integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  SELECT sp.* INTO saved
  FROM public.student_study_plans sp
  JOIN public.students s ON s.id = sp.student_id
  WHERE s.auth_user_id = auth.uid() AND s.archived_at IS NULL
    AND s.student_type IS DISTINCT FROM 'nursing_student'
  FOR UPDATE OF sp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active NCLEX weekly plan is linked to this account.';
  END IF;
  IF saved.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Your plan changed. Reload this page before saving your days.';
  END IF;
  IF p_practice_days IS NULL OR p_cat_days IS NULL
    OR array_position(p_practice_days, NULL) IS NOT NULL
    OR array_position(p_cat_days, NULL) IS NOT NULL
    OR NOT p_practice_days <@ allowed OR NOT p_cat_days <@ allowed THEN
    RAISE EXCEPTION 'Choose valid days from Monday through Sunday.';
  END IF;
  SELECT COALESCE(array_agg(d ORDER BY n), '{}'::text[]) INTO practice
  FROM unnest(allowed) WITH ORDINALITY AS day(d,n) WHERE d = ANY(p_practice_days);
  SELECT COALESCE(array_agg(d ORDER BY n), '{}'::text[]) INTO cats
  FROM unnest(allowed) WITH ORDINALITY AS day(d,n) WHERE d = ANY(p_cat_days);
  IF cardinality(practice) <> cardinality(p_practice_days)
    OR cardinality(cats) <> cardinality(p_cat_days) THEN
    RAISE EXCEPTION 'Choose each day only once.';
  END IF;
  IF cardinality(practice) <> cardinality(saved.practice_days)
    OR cardinality(cats) <> cardinality(saved.cat_days) THEN
    RAISE EXCEPTION 'Keep the number of practice and CAT days assigned by Madison.';
  END IF;
  IF practice && cats THEN
    RAISE EXCEPTION 'Choose separate days for practice and CAT exams.';
  END IF;
  SELECT array_agg(n::integer ORDER BY n) INTO positions
  FROM unnest(allowed) WITH ORDINALITY AS day(d,n) WHERE d = ANY(cats);
  IF cardinality(cats) > 1 THEN
    FOR i IN 1..cardinality(cats) LOOP
      IF (CASE WHEN i = cardinality(cats) THEN positions[1] + 7 ELSE positions[i+1] END) - positions[i] < 2 THEN
        RAISE EXCEPTION 'Leave at least one day between CAT exams, including across weeks.';
      END IF;
    END LOOP;
  END IF;
  SELECT COALESCE(array_agg(d ORDER BY n), '{}'::text[]) INTO previous_cats
  FROM unnest(allowed) WITH ORDINALITY AS day(d,n) WHERE d = ANY(saved.cat_days);
  IF cardinality(cats) > 0 THEN
    FOR i IN 1..cardinality(cats) LOOP
      IF saved.cat_assignments ? previous_cats[i] THEN
        tasks := tasks || jsonb_build_object(cats[i], saved.cat_assignments->previous_cats[i]);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.student_study_plans
  SET practice_days = practice, cat_days = cats, cat_assignments = tasks, updated_at = clock_timestamp()
  WHERE id = saved.id
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) TO authenticated;

COMMIT;

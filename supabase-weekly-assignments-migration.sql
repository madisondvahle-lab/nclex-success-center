-- Step 2. Requires weekly study plans, supplemental practice, and question item types.
-- Assignments reuse student_resources; no student UPDATE policy is added.
BEGIN;
ALTER TABLE public.student_resources
  ADD COLUMN IF NOT EXISTS assignment_week date,
  ADD COLUMN IF NOT EXISTS assignment_kind text CHECK (assignment_kind IN ('practice', 'cat')),
  ADD COLUMN IF NOT EXISTS assignment_details jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS student_resources_weekly_slot
  ON public.student_resources(student_id, due_on, assignment_kind)
  WHERE assignment_week IS NOT NULL;
ALTER TABLE public.student_resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_resources FROM anon;

CREATE OR REPLACE FUNCTION public.generate_weekly_assignments(p_week date, p_student uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p record; slot record; rid uuid; ids jsonb; details jsonb;
  n integer; made integer := 0; existing integer := 0;
  failures jsonb := '[]'; platform text; qty integer; cats text[]; topics text[];
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_week IS NULL OR extract(isodow FROM p_week) <> 1 THEN
    RAISE EXCEPTION 'Choose a Monday for the assignment week';
  END IF;
  IF p_student IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_study_plans sp JOIN public.students s ON s.id = sp.student_id
    WHERE s.id = p_student AND s.archived_at IS NULL AND s.student_type IS DISTINCT FROM 'nursing_student'
  ) THEN RAISE EXCEPTION 'Active NCLEX student with a saved plan required'; END IF;
  FOR p IN SELECT sp.* FROM public.student_study_plans sp
    JOIN public.students s ON s.id = sp.student_id
    WHERE s.archived_at IS NULL AND s.student_type IS DISTINCT FROM 'nursing_student'
      AND (p_student IS NULL OR s.id = p_student)
    ORDER BY sp.student_id
  LOOP
    -- Serialize concurrent generation for a student without changing their plan.
    PERFORM 1 FROM public.student_study_plans WHERE student_id = p.student_id FOR UPDATE;
    FOR slot IN
      SELECT p_week + d.i AS due, k.kind
      FROM (VALUES (0,'mon'),(1,'tue'),(2,'wed'),(3,'thu'),(4,'fri'),(5,'sat'),(6,'sun')) d(i,day)
      CROSS JOIN (VALUES ('practice'),('cat')) k(kind)
      WHERE (k.kind = 'practice' AND d.day = ANY(p.practice_days))
         OR (k.kind = 'cat' AND d.day = ANY(p.cat_days))
      ORDER BY due, kind
    LOOP
      IF EXISTS (SELECT 1 FROM public.student_resources r WHERE r.student_id = p.student_id
          AND r.due_on = slot.due AND r.assignment_kind = slot.kind AND r.assignment_week IS NOT NULL) THEN
        existing := existing + 1; CONTINUE;
      END IF;
      platform := CASE WHEN slot.kind = 'practice' THEN p.practice_platform ELSE p.cat_platform END;
      qty := CASE WHEN slot.kind = 'practice' THEN p.practice_questions_per_day ELSE NULL END;
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
        'question_ids',ids);
      INSERT INTO public.student_resources(id, student_id, title, resource_type, url, note, due_on,
        assignment_week, assignment_kind, assignment_details)
      VALUES (rid,p.student_id,
        CASE WHEN slot.kind = 'cat' THEN platform || ' CAT / readiness exam' ELSE platform || ': ' || qty || ' targeted questions' END,
        'practice_set',
        CASE WHEN platform = 'Portal Question Bank' THEN
          CASE WHEN slot.kind = 'cat' THEN 'diagnostic.html?mode=mock' ELSE 'supplemental-practice.html?assignment=' || rid END
          ELSE NULL END,
        CASE WHEN slot.kind = 'cat' THEN 'Complete one CAT / readiness exam. Log your report on your dashboard for Madison to review.'
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

CREATE OR REPLACE FUNCTION public.set_weekly_assignment_complete(p_assignment uuid, p_complete boolean)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE stamp timestamptz;
BEGIN
  IF p_complete IS NULL THEN RAISE EXCEPTION 'Completion state required'; END IF;
  UPDATE public.student_resources r
    SET completed_at = CASE WHEN p_complete THEN coalesce(r.completed_at,now()) ELSE NULL END
    WHERE r.id = p_assignment AND r.assignment_week IS NOT NULL
      AND (public.is_app_admin() OR EXISTS (
        SELECT 1 FROM public.students s WHERE s.id = r.student_id AND s.auth_user_id = auth.uid()))
    RETURNING completed_at INTO stamp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Weekly assignment not found or access denied'; END IF;
  RETURN stamp;
END $$;
REVOKE ALL ON FUNCTION public.set_weekly_assignment_complete(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_weekly_assignment_complete(uuid, boolean) TO authenticated;
COMMIT;

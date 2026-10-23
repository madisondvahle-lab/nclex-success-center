-- Per-day practice distribution (mixed + targeted remediation) for weekly plans.
-- Apply after supabase-weekly-study-plan-migration.sql, supabase-weekly-assignments-migration.sql,
-- and supabase-weekly-cat-details-migration.sql. Additive: no existing rows, assignments, or
-- completion are changed. Days without a customization keep the existing focus-based behavior.
BEGIN;

-- { "wed": { "platform": "UWorld", "total": 50, "mixed": 35,
--            "targets": [{ "kind": "category", "name": "Safety and Infection Control", "count": 15 }] } }
ALTER TABLE public.student_study_plans
  ADD COLUMN IF NOT EXISTS practice_day_assignments jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(practice_day_assignments) = 'object');

-- Admin-only, append-only history of plan-day and assignment retargeting (reason text is never shown to students).
CREATE TABLE IF NOT EXISTS public.student_assignment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.student_resources(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('plan_day', 'assignment')),
  practice_day text CHECK (practice_day IN ('mon','tue','wed','thu','fri','sat','sun')),
  due_on date,
  previous jsonb,
  updated jsonb,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_assignment_revisions_student
  ON public.student_assignment_revisions(student_id, changed_at DESC);
ALTER TABLE public.student_assignment_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_assignment_revisions FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.student_assignment_revisions FROM authenticated;
GRANT SELECT, INSERT ON public.student_assignment_revisions TO authenticated;
DROP POLICY IF EXISTS "Admins read assignment revisions" ON public.student_assignment_revisions;
CREATE POLICY "Admins read assignment revisions" ON public.student_assignment_revisions
  FOR SELECT TO authenticated USING (public.is_app_admin());
DROP POLICY IF EXISTS "Admins add assignment revisions" ON public.student_assignment_revisions;
CREATE POLICY "Admins add assignment revisions" ON public.student_assignment_revisions
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());

-- Same canonical mapping used by weekly generation since step 2.
CREATE OR REPLACE FUNCTION public.weekly_question_category(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_label ~* 'management of care|^mgmt' THEN 'Management of Care'
    WHEN p_label ~* 'safety|infection' THEN 'Safety and Infection Control'
    WHEN p_label ~* 'health promotion' THEN 'Health Promotion and Maintenance'
    WHEN p_label ~* 'psychosocial' THEN 'Psychosocial Integrity'
    WHEN p_label ~* 'basic care|comfort' THEN 'Basic Care and Comfort'
    WHEN p_label ~* 'pharmacolog|parenteral' THEN 'Pharmacological and Parenteral Therapies'
    WHEN p_label ~* 'reduction of risk|risk potential' THEN 'Reduction of Risk Potential'
    WHEN p_label ~* 'physiological adaptation|physiologic adaptation' THEN 'Physiological Adaptation'
  END
$$;

-- Returns NULL when valid, otherwise a message. Mirrors WeeklyPlan.distributionError.
CREATE OR REPLACE FUNCTION public.practice_distribution_error(p_cfg jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  t jsonb; total integer; mixed integer; sum integer; seen text[] := '{}'; k text;
BEGIN
  IF p_cfg IS NULL OR jsonb_typeof(p_cfg) <> 'object' THEN RETURN 'Day settings are missing.'; END IF;
  IF jsonb_typeof(p_cfg->'total') IS DISTINCT FROM 'number' OR (p_cfg->>'total')::numeric <> trunc((p_cfg->>'total')::numeric)
    OR (p_cfg->>'total')::numeric NOT BETWEEN 1 AND 300 THEN
    RETURN 'Total questions must be a whole number from 1 to 300.';
  END IF;
  IF jsonb_typeof(p_cfg->'mixed') IS DISTINCT FROM 'number' OR (p_cfg->>'mixed')::numeric <> trunc((p_cfg->>'mixed')::numeric)
    OR (p_cfg->>'mixed')::numeric NOT BETWEEN 0 AND 300 THEN
    RETURN 'Mixed questions must be a whole number from 0 to 300.';
  END IF;
  IF p_cfg ? 'targets' AND jsonb_typeof(p_cfg->'targets') <> 'array' THEN RETURN 'Targeted areas must be a list.'; END IF;
  IF jsonb_array_length(coalesce(p_cfg->'targets','[]')) > 8 THEN RETURN 'Use up to 8 targeted areas per day.'; END IF;
  total := (p_cfg->>'total')::integer; mixed := (p_cfg->>'mixed')::integer; sum := mixed;
  FOR t IN SELECT value FROM jsonb_array_elements(coalesce(p_cfg->'targets','[]')) LOOP
    IF jsonb_typeof(t) <> 'object' OR coalesce(t->>'kind','') NOT IN ('category','topic')
      OR btrim(coalesce(t->>'name','')) = '' OR char_length(t->>'name') > 80 THEN
      RETURN 'Choose a category or enter a topic for each targeted row.';
    END IF;
    IF t->>'kind' = 'category' AND t->>'name' NOT IN ('Management of Care','Safety and Infection Control',
      'Health Promotion and Maintenance','Psychosocial Integrity','Basic Care and Comfort',
      'Pharmacological and Parenteral Therapies','Reduction of Risk Potential','Physiological Adaptation') THEN
      RETURN format('"%s" is not an NCLEX client-needs category.', t->>'name');
    END IF;
    IF jsonb_typeof(t->'count') IS DISTINCT FROM 'number' OR (t->>'count')::numeric <> trunc((t->>'count')::numeric)
      OR (t->>'count')::numeric NOT BETWEEN 1 AND 300 THEN
      RETURN 'Each targeted area needs a whole-number count from 1 to 300.';
    END IF;
    k := (t->>'kind') || ':' || lower(btrim(t->>'name'));
    IF k = ANY(seen) THEN RETURN format('"%s" is listed more than once.', t->>'name'); END IF;
    seen := seen || k;
    sum := sum + (t->>'count')::integer;
  END LOOP;
  IF sum <> total THEN
    RETURN format('Mixed and targeted questions add up to %s, but the day total is %s.', sum, total);
  END IF;
  RETURN NULL;
END $$;

-- Builds the title/note/details snapshot for a distributed practice assignment. For the portal bank it
-- freezes active MCQ IDs: each targeted area first, then mixed questions from the whole active MCQ bank,
-- with no repeats inside the assignment. Never broadens a short pool; returns an error instead.
CREATE OR REPLACE FUNCTION public.practice_distribution_snapshot(
  p_resource uuid, p_platform text, p_cfg jsonb, p_coach_note text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $$
DECLARE
  err text; t jsonb; picked uuid[] := '{}'; batch uuid[]; total integer; mixed integer;
  cats text[] := '{}'; topics text[] := '{}'; lines text := ''; focus text[] := '{}';
  portal boolean := p_platform = 'Portal Question Bank'; parts text[] := '{}'; setup text;
BEGIN
  err := public.practice_distribution_error(p_cfg);
  IF err IS NOT NULL THEN RETURN jsonb_build_object('error', err); END IF;
  total := (p_cfg->>'total')::integer; mixed := (p_cfg->>'mixed')::integer;
  FOR t IN SELECT value FROM jsonb_array_elements(coalesce(p_cfg->'targets','[]')) LOOP
    IF t->>'kind' = 'category' THEN cats := cats || (t->>'name'); ELSE topics := topics || (t->>'name'); END IF;
    focus := focus || (t->>'name');
    lines := lines || E'\n• ' || (t->>'count') || ' ' || (t->>'name') || ' questions';
    parts := parts || ((t->>'count') || ' questions with only ' || (t->>'name') || ' selected');
    IF portal THEN
      SELECT coalesce(array_agg(q.id), '{}') INTO batch FROM (
        SELECT b.id FROM public.questions b
        WHERE b.active = true AND b.item_type = 'mcq' AND lower(b.correct_answer) IN ('a','b','c','d')
          AND NOT (b.id = ANY(picked))
          AND CASE WHEN t->>'kind' = 'category'
            THEN public.weekly_question_category(replace(concat_ws(' ',b.nclex_category,b.nclex_sub),'_',' ')) = t->>'name'
            ELSE lower(trim(b.topic)) = lower(trim(t->>'name')) END
        ORDER BY random() LIMIT (t->>'count')::integer
      ) q;
      IF cardinality(batch) < (t->>'count')::integer THEN
        RETURN jsonb_build_object('error', format('Only %s active matching multiple-choice questions for %s; %s required. Adjust the count. Topics must match bank labels exactly.',
          cardinality(batch), t->>'name', t->>'count'));
      END IF;
      picked := picked || batch;
    END IF;
  END LOOP;
  IF mixed > 0 THEN parts := ARRAY[mixed || ' questions with all client-needs categories selected'] || parts; END IF;
  IF portal AND mixed > 0 THEN
    SELECT coalesce(array_agg(q.id), '{}') INTO batch FROM (
      SELECT b.id FROM public.questions b
      WHERE b.active = true AND b.item_type = 'mcq' AND lower(b.correct_answer) IN ('a','b','c','d')
        AND NOT (b.id = ANY(picked))
      ORDER BY random() LIMIT mixed
    ) q;
    IF cardinality(batch) < mixed THEN
      RETURN jsonb_build_object('error', format('Only %s additional active multiple-choice questions for the mixed portion; %s required.', cardinality(batch), mixed));
    END IF;
    picked := picked || batch;
  END IF;
  setup := CASE WHEN portal THEN ' Exam practice; review rationales afterward.'
    ELSE ' Timed practice, tutor mode off; review rationales afterward. Set this up yourself in ' || p_platform || ': create ' ||
      CASE WHEN cardinality(parts) > 1 THEN 'separate practice tests — ' || array_to_string(parts, '; ') ELSE 'a practice test with ' || parts[1] END ||
      '. The portal does not create or configure tests in ' || p_platform || '.' END;
  RETURN jsonb_build_object(
    'title', p_platform || ' Practice: ' || total || ' questions',
    'url', CASE WHEN portal THEN 'supplemental-practice.html?assignment=' || p_resource ELSE NULL END,
    'note', total || ' questions on ' || p_platform || ':' ||
      CASE WHEN mixed > 0 THEN E'\n• ' || mixed || ' mixed NCLEX questions (all client-needs categories)' ELSE '' END || lines ||
      CASE WHEN cardinality(focus) > 0 THEN E'\nRemediation focus: ' || array_to_string(focus, ', ') || '.' ELSE '' END ||
      E'\n' || btrim(setup) || coalesce(p_coach_note, ''),
    'details', jsonb_build_object('platform', p_platform, 'question_count', total,
      'categories', cats, 'topics', topics,
      'mode', CASE WHEN portal THEN 'Exam practice; review rationales afterward' ELSE 'Timed practice, tutor mode off; review rationales afterward' END,
      'task_title', NULL, 'task_instructions', NULL,
      'question_ids', CASE WHEN portal THEN to_jsonb(picked) ELSE NULL END,
      'distribution', jsonb_build_object('mixed', mixed, 'targets', coalesce(p_cfg->'targets','[]'::jsonb)))
  );
END $$;
REVOKE ALL ON FUNCTION public.weekly_question_category(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_distribution_error(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_distribution_snapshot(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Generation: unchanged for non-customized days; customized practice days use the saved distribution.
CREATE OR REPLACE FUNCTION public.generate_weekly_assignments(p_week date, p_student uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p record; slot record; rid uuid; ids jsonb; details jsonb;
  n integer; made integer := 0; existing integer := 0;
  failures jsonb := '[]'; platform text; qty integer; cats text[]; topics text[];
  cat_config jsonb; task_title text; task_instructions text; day_config jsonb; snap jsonb;
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
      day_config := CASE WHEN slot.kind = 'practice' THEN p.practice_day_assignments->slot.day ELSE NULL END;
      IF day_config IS NOT NULL THEN
        rid := gen_random_uuid();
        snap := public.practice_distribution_snapshot(rid,
          coalesce(nullif(btrim(day_config->>'platform'),''), p.practice_platform), day_config,
          CASE WHEN coalesce(p.plan_notes,'') <> '' THEN E'\nCoach note: ' || p.plan_notes ELSE '' END);
        IF snap ? 'error' THEN
          failures := failures || jsonb_build_array(jsonb_build_object('student_id',p.student_id,'due_on',slot.due,
            'reason','Customized ' || initcap(slot.day) || ' practice: ' || (snap->>'error')));
          CONTINUE;
        END IF;
        INSERT INTO public.student_resources(id, student_id, title, resource_type, url, note, due_on,
          assignment_week, assignment_kind, assignment_details)
        VALUES (rid, p.student_id, snap->>'title', 'practice_set', snap->>'url', snap->>'note', slot.due,
          p_week, 'practice', snap->'details');
        made := made + 1;
        CONTINUE;
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
            AND (cardinality(cats) = 0 OR public.weekly_question_category(c.label) = ANY(cats))
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

-- Admin-only retargeting of one generated, incomplete, upcoming practice assignment. Changes only that row
-- (title, link, note, details) and records an admin-only revision. CATs, completed work, other days, and
-- the coach note captured when the assignment was generated are left unchanged.
CREATE OR REPLACE FUNCTION public.update_weekly_practice_assignment(
  p_resource uuid, p_config jsonb, p_expected_details jsonb, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r public.student_resources%ROWTYPE; snap jsonb; platform text; coach text := ''; pos integer;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO r FROM public.student_resources WHERE id = p_resource FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found.'; END IF;
  IF r.assignment_week IS NULL OR r.assignment_kind IS DISTINCT FROM 'practice' THEN
    RAISE EXCEPTION 'Only generated practice assignments can be edited here.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = r.student_id AND s.archived_at IS NULL
      AND s.student_type IS DISTINCT FROM 'nursing_student') THEN
    RAISE EXCEPTION 'Active NCLEX student required.';
  END IF;
  IF r.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed assignments are kept unchanged.'; END IF;
  -- One day of grace so an evening edit in US time zones is not blocked by the UTC date.
  IF r.due_on < current_date - 1 THEN RAISE EXCEPTION 'Past assignments are kept unchanged.'; END IF;
  IF p_expected_details IS DISTINCT FROM r.assignment_details THEN
    RAISE EXCEPTION 'This assignment changed since you opened it. Refresh and try again.';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN RAISE EXCEPTION 'Keep the reason under 500 characters.'; END IF;
  platform := coalesce(nullif(btrim(p_config->>'platform'),''), r.assignment_details->>'platform');
  IF platform IS NULL THEN RAISE EXCEPTION 'Choose a practice platform.'; END IF;
  pos := position(E'\nCoach note: ' IN coalesce(r.note,''));
  IF pos > 0 THEN coach := substr(r.note, pos); END IF;
  snap := public.practice_distribution_snapshot(r.id, platform, p_config, coach);
  IF snap ? 'error' THEN RAISE EXCEPTION '%', snap->>'error'; END IF;
  INSERT INTO public.student_assignment_revisions(student_id, resource_id, scope, due_on, previous, updated, reason, changed_by)
  VALUES (r.student_id, r.id, 'assignment', r.due_on,
    jsonb_build_object('title', r.title, 'url', r.url, 'note', r.note, 'assignment_details', r.assignment_details),
    jsonb_build_object('title', snap->>'title', 'url', snap->>'url', 'note', snap->>'note', 'assignment_details', snap->'details'),
    nullif(btrim(coalesce(p_reason,'')),''), auth.uid());
  UPDATE public.student_resources
  SET title = snap->>'title', url = snap->>'url', note = snap->>'note', assignment_details = snap->'details'
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.update_weekly_practice_assignment(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_weekly_practice_assignment(uuid, jsonb, jsonb, text) TO authenticated;

-- Student day moves keep the tutor's CAT tasks and customized practice days in weekly order.
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
  previous_practice text[];
  tasks jsonb := '{}'::jsonb;
  practice_tasks jsonb := '{}'::jsonb;
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
  SELECT COALESCE(array_agg(d ORDER BY n), '{}'::text[]) INTO previous_practice
  FROM unnest(allowed) WITH ORDINALITY AS day(d,n) WHERE d = ANY(saved.practice_days);
  IF cardinality(practice) > 0 THEN
    FOR i IN 1..cardinality(practice) LOOP
      IF saved.practice_day_assignments ? previous_practice[i] THEN
        practice_tasks := practice_tasks || jsonb_build_object(practice[i], saved.practice_day_assignments->previous_practice[i]);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.student_study_plans
  SET practice_days = practice, cat_days = cats, cat_assignments = tasks,
    practice_day_assignments = practice_tasks, updated_at = clock_timestamp()
  WHERE id = saved.id
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) TO authenticated;

COMMIT;

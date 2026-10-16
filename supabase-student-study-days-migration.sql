-- Requires supabase-weekly-study-plan-migration.sql.
-- Students may move their own days, not change tutor-assigned workload or focus.
BEGIN;

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

  UPDATE public.student_study_plans
  SET practice_days = practice, cat_days = cats, updated_at = clock_timestamp()
  WHERE id = saved.id
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_study_days(text[], text[], timestamptz) TO authenticated;
COMMIT;

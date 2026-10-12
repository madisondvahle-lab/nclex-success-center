-- Admin-only merge for duplicate consult_intakes profiles.
-- Run after supabase-consult-intake-migration.sql,
-- supabase-student-onboarding-migration.sql,
-- supabase-calendly-consultations-migration.sql, and
-- supabase-consult-diagnostic-migration.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.consult_intake_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merged_from_id uuid NOT NULL,
  merged_into_id uuid NOT NULL,
  merged_from_snapshot jsonb NOT NULL,
  merged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  merged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consult_intake_merge_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read consult intake merge audit" ON public.consult_intake_merge_audit;
CREATE POLICY "admins read consult intake merge audit"
  ON public.consult_intake_merge_audit
  FOR SELECT TO authenticated
  USING (public.is_app_admin());

REVOKE ALL ON public.consult_intake_merge_audit FROM anon, authenticated;
GRANT SELECT ON public.consult_intake_merge_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_consult_intakes(p_keep_id uuid, p_merge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep public.consult_intakes%ROWTYPE;
  v_source public.consult_intakes%ROWTYPE;
  v_attempt_offset integer;
  v_attempt_count integer;
  v_resource_count integer;
  v_file_count integer;
  v_diagnostic_count integer;
  v_consultation_count integer;
  v_source_resources jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Not authorized to merge consult profiles';
  END IF;

  IF p_keep_id IS NULL OR p_merge_id IS NULL OR p_keep_id = p_merge_id THEN
    RAISE EXCEPTION 'Choose two different consult profiles';
  END IF;

  PERFORM id
    FROM public.consult_intakes
    WHERE id IN (p_keep_id, p_merge_id)
    ORDER BY id
    FOR UPDATE;

  SELECT * INTO v_keep FROM public.consult_intakes WHERE id = p_keep_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The profile to keep was not found';
  END IF;

  SELECT * INTO v_source FROM public.consult_intakes WHERE id = p_merge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The duplicate profile was not found';
  END IF;

  IF v_keep.student_id IS NOT NULL
     AND v_source.student_id IS NOT NULL
     AND v_keep.student_id <> v_source.student_id THEN
    RAISE EXCEPTION 'These profiles are linked to different student accounts and cannot be merged here';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(resource)), '[]'::jsonb)
    INTO v_source_resources
    FROM public.consult_prep_resources AS resource
    WHERE resource.consult_intake_id = p_merge_id;

  v_keep.student_id := coalesce(v_keep.student_id, v_source.student_id);

  UPDATE public.consult_intakes
  SET email = coalesce(nullif(btrim(email), ''), v_source.email),
      phone = coalesce(nullif(btrim(phone), ''), v_source.phone),
      preferred_contact = coalesce(nullif(btrim(preferred_contact), ''), v_source.preferred_contact),
      time_zone = coalesce(nullif(btrim(time_zone), ''), v_source.time_zone),
      nclex_exam = coalesce(nullif(btrim(nclex_exam), ''), v_source.nclex_exam),
      graduation_date = coalesce(graduation_date, v_source.graduation_date),
      prior_attempts = greatest(prior_attempts, v_source.prior_attempts),
      prior_feedback = coalesce(nullif(btrim(prior_feedback), ''), v_source.prior_feedback),
      nclex_target_date = coalesce(nclex_target_date, v_source.nclex_target_date),
      study_resources = coalesce(nullif(btrim(study_resources), ''), v_source.study_resources),
      challenge_areas = coalesce(nullif(btrim(challenge_areas), ''), v_source.challenge_areas),
      strengths = coalesce(nullif(btrim(strengths), ''), v_source.strengths),
      accommodations_notes = coalesce(nullif(btrim(accommodations_notes), ''), v_source.accommodations_notes),
      learning_preferences = coalesce(nullif(btrim(learning_preferences), ''), v_source.learning_preferences),
      success_goal = coalesce(nullif(btrim(success_goal), ''), v_source.success_goal),
      biggest_concern = coalesce(nullif(btrim(biggest_concern), ''), v_source.biggest_concern),
      weekly_study_hours = coalesce(weekly_study_hours, v_source.weekly_study_hours),
      support_interest = coalesce(nullif(btrim(support_interest), ''), v_source.support_interest),
      coach_notes = coalesce(nullif(btrim(coach_notes), ''), v_source.coach_notes),
      student_id = v_keep.student_id,
      converted_at = coalesce(converted_at, v_source.converted_at),
      referral_source = coalesce(nullif(btrim(referral_source), ''), v_source.referral_source),
      student_type = coalesce(nullif(btrim(student_type), ''), v_source.student_type),
      program_name = coalesce(nullif(btrim(program_name), ''), v_source.program_name),
      consult_date = coalesce(consult_date, v_source.consult_date),
      urgency = coalesce(nullif(btrim(urgency), ''), v_source.urgency),
      availability = coalesce(nullif(btrim(availability), ''), v_source.availability),
      tutoring_frequency = coalesce(nullif(btrim(tutoring_frequency), ''), v_source.tutoring_frequency),
      preferred_learning_styles = ARRAY(
        SELECT DISTINCT item
        FROM unnest(coalesce(preferred_learning_styles, '{}'::text[]) || coalesce(v_source.preferred_learning_styles, '{}'::text[])) AS merge_items(item)
      ),
      reported_concerns = ARRAY(
        SELECT DISTINCT item
        FROM unnest(coalesce(reported_concerns, '{}'::text[]) || coalesce(v_source.reported_concerns, '{}'::text[])) AS merge_items(item)
      ),
      reported_problem = coalesce(nullif(btrim(reported_problem), ''), v_source.reported_problem),
      tutor_assessment = coalesce(nullif(btrim(tutor_assessment), ''), v_source.tutor_assessment),
      tutor_focus_areas = ARRAY(
        SELECT DISTINCT item
        FROM unnest(coalesce(tutor_focus_areas, '{}'::text[]) || coalesce(v_source.tutor_focus_areas, '{}'::text[])) AS merge_items(item)
      ),
      initial_plan = coalesce(nullif(btrim(initial_plan), ''), v_source.initial_plan),
      additional_notes = coalesce(nullif(btrim(additional_notes), ''), v_source.additional_notes),
      updated_at = now()
  WHERE id = p_keep_id;

  SELECT coalesce(max(attempt_number), 0)
    INTO v_attempt_offset
    FROM public.nclex_attempts
    WHERE consult_intake_id = p_keep_id;

  UPDATE public.nclex_attempts
  SET consult_intake_id = p_keep_id,
      attempt_number = attempt_number + v_attempt_offset
  WHERE consult_intake_id = p_merge_id;
  GET DIAGNOSTICS v_attempt_count = ROW_COUNT;

  INSERT INTO public.consult_prep_resources AS kept (
    id, consult_intake_id, resource_name, usage_status, usage_dates,
    questions_completed, percent_correct, cat_results, readiness_results,
    student_opinion, notes
  )
  SELECT id, p_keep_id, resource_name, usage_status, usage_dates,
         questions_completed, percent_correct, cat_results, readiness_results,
         student_opinion, notes
  FROM public.consult_prep_resources
  WHERE consult_intake_id = p_merge_id
  ON CONFLICT (consult_intake_id, resource_name) DO UPDATE SET
    usage_status = coalesce(kept.usage_status, excluded.usage_status),
    usage_dates = coalesce(kept.usage_dates, excluded.usage_dates),
    questions_completed = coalesce(kept.questions_completed, excluded.questions_completed),
    percent_correct = coalesce(kept.percent_correct, excluded.percent_correct),
    cat_results = coalesce(kept.cat_results, excluded.cat_results),
    readiness_results = coalesce(kept.readiness_results, excluded.readiness_results),
    student_opinion = coalesce(kept.student_opinion, excluded.student_opinion),
    notes = coalesce(kept.notes, excluded.notes);
  GET DIAGNOSTICS v_resource_count = ROW_COUNT;

  UPDATE public.consult_intake_files
  SET consult_intake_id = p_keep_id
  WHERE consult_intake_id = p_merge_id;
  GET DIAGNOSTICS v_file_count = ROW_COUNT;

  UPDATE public.consult_diagnostic_results
  SET consult_intake_id = p_keep_id,
      student_id = coalesce(student_id, v_keep.student_id)
  WHERE consult_intake_id = p_merge_id;
  GET DIAGNOSTICS v_diagnostic_count = ROW_COUNT;

  UPDATE public.consultations
  SET consult_intake_id = p_keep_id,
      student_id = coalesce(student_id, v_keep.student_id)
  WHERE consult_intake_id = p_merge_id;
  GET DIAGNOSTICS v_consultation_count = ROW_COUNT;

  INSERT INTO public.consult_intake_merge_audit (
    merged_from_id, merged_into_id, merged_from_snapshot, merged_by
  )
  VALUES (
    p_merge_id, p_keep_id,
    jsonb_build_object('profile', to_jsonb(v_source), 'prep_resources', v_source_resources),
    auth.uid()
  );

  DELETE FROM public.consult_intakes WHERE id = p_merge_id;

  RETURN jsonb_build_object(
    'merged_into_id', p_keep_id,
    'merged_from_id', p_merge_id,
    'attempts_moved', v_attempt_count,
    'resources_moved_or_combined', v_resource_count,
    'files_moved', v_file_count,
    'diagnostics_moved', v_diagnostic_count,
    'consultations_moved', v_consultation_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_consult_intakes(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_consult_intakes(uuid, uuid) TO authenticated;

COMMIT;

-- Requires supabase-weekly-assignments-migration.sql.
-- Extends completion only to explicitly assigned authored practice; no data backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_weekly_assignment_complete(p_assignment uuid, p_complete boolean)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE stamp timestamptz;
BEGIN
  IF p_complete IS NULL THEN RAISE EXCEPTION 'Completion state required'; END IF;
  UPDATE public.student_resources r
    SET completed_at = CASE WHEN p_complete THEN coalesce(r.completed_at,now()) ELSE NULL END
    WHERE r.id = p_assignment
      AND (r.assignment_week IS NOT NULL OR (
        r.resource_type = 'practice_set' AND r.assignment_kind = 'practice'
        AND r.assignment_details->>'practice_type' = 'ngn-authored'
        AND r.assignment_details->>'platform' = 'Portal Question Bank'
      ))
      AND (public.is_app_admin() OR EXISTS (
        SELECT 1 FROM public.students s WHERE s.id = r.student_id AND s.auth_user_id = auth.uid()))
    RETURNING completed_at INTO stamp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found or access denied'; END IF;
  RETURN stamp;
END $$;
REVOKE ALL ON FUNCTION public.set_weekly_assignment_complete(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_weekly_assignment_complete(uuid, boolean) TO authenticated;
COMMIT;

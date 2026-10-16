-- Allow one-hour tutoring bookings and keep initial consultations out of the student tutoring calendar.
-- Apply in the Supabase SQL Editor after supabase-strategy-session-migration.sql
-- and supabase-student-calendar-consultations-migration.sql.

BEGIN;

ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_consult_type_check;
ALTER TABLE public.consultations ADD CONSTRAINT consultations_consult_type_check
  CHECK (consult_type IN ('free_consultation', 'strategy_session', 'tutoring_session'));

CREATE OR REPLACE FUNCTION public.get_my_scheduled_consultations(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  consult_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end > p_start + interval '62 days' THEN
    RAISE EXCEPTION 'Choose a valid calendar range of no more than 62 days.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.scheduled_start, c.scheduled_end, c.consult_type
  FROM public.consultations c
  WHERE c.status = 'scheduled'
    AND c.consult_type <> 'free_consultation'
    AND c.scheduled_start >= p_start
    AND c.scheduled_start < p_end
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.auth_user_id = auth.uid()
        AND (
          c.student_id = s.id
          OR EXISTS (
            SELECT 1
            FROM public.consult_intakes ci
            WHERE ci.id = c.consult_intake_id
              AND ci.student_id = s.id
          )
        )
    )
  ORDER BY c.scheduled_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_scheduled_consultations(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_scheduled_consultations(timestamptz, timestamptz) TO authenticated;

COMMIT;

BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS nclex_target_date date;

CREATE OR REPLACE FUNCTION public.update_my_nclex_target_date(new_target_date date)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF new_target_date IS NOT NULL AND new_target_date < current_date THEN
    RAISE EXCEPTION 'NCLEX target date must be today or later.';
  END IF;

  UPDATE public.students
  SET nclex_target_date = new_target_date
  WHERE auth_user_id = auth.uid()
  RETURNING nclex_target_date INTO saved_date;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No student profile is linked to this account.';
  END IF;

  RETURN saved_date;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_nclex_target_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_nclex_target_date(date) TO authenticated;

UPDATE public.students
SET nclex_target_date = COALESCE(nclex_target_date, DATE '2026-08-25')
WHERE email = 'kylebatacan22@gmail.com';

COMMIT;

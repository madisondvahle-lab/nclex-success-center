-- Apply before deploying the updated create-student-login function and admin page.
-- NULL means invitation delivery has not been recorded; do not infer delivery
-- or student sign-in from the presence of a linked Auth account.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS portal_invite_sent_at timestamptz;

COMMIT;

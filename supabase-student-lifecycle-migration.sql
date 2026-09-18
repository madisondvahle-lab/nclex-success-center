-- NCLEX Success Center — student lifecycle management
-- Run once in Supabase SQL Editor after the existing student/auth migrations.
-- Safe, additive, and reversible: this does not delete students or touch any
-- assignment, assessment, module-access, practice, note, report, or history rows.

BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.students
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE public.students
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_status_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_status_check
      CHECK (status IN ('active', 'paused', 'completed')) NOT VALID;
  END IF;
END $$;

-- Existing rows were backfilled above, so this should validate immediately.
-- If legacy out-of-band values ever exist, validation fails without changing them.
ALTER TABLE public.students
  VALIDATE CONSTRAINT students_status_check;

CREATE INDEX IF NOT EXISTS idx_students_current_admin_list
  ON public.students (archived_at, status, lower(name));

CREATE INDEX IF NOT EXISTS idx_students_archived_at
  ON public.students (archived_at)
  WHERE archived_at IS NOT NULL;

COMMIT;

-- Notes:
-- * Existing students become status='active' automatically.
-- * archived_at remains NULL for every existing student.
-- * No RLS policy change is required: admins already manage students and
--   students still read their own profile, including an archived profile.
-- * Archive is application-level removal from current operational lists, not
--   account deletion and not an authentication block.
-- Verify after running:
-- SELECT status, archived_at IS NOT NULL AS archived, count(*)
-- FROM public.students
-- GROUP BY status, archived_at IS NOT NULL
-- ORDER BY archived, status;

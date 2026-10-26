-- Link private CPR attachments to existing NCLEX attempts.
-- Prerequisite: supabase-student-onboarding-migration.sql.
-- Additive only: no backfill, file moves, grants, or policy changes.
BEGIN;

ALTER TABLE public.consult_intake_files
  ADD COLUMN IF NOT EXISTS attempt_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS nclex_attempts_id_intake_unique
  ON public.nclex_attempts (id, consult_intake_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consult_intake_files'::regclass
      AND conname = 'consult_intake_files_attempt_intake_fk'
  ) THEN
    -- The existing atomic profile merge moves attempts before file metadata.
    ALTER TABLE public.consult_intake_files
      ADD CONSTRAINT consult_intake_files_attempt_intake_fk
      FOREIGN KEY (attempt_id, consult_intake_id)
      REFERENCES public.nclex_attempts (id, consult_intake_id)
      ON DELETE SET NULL (attempt_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS consult_intake_files_attempt_idx
  ON public.consult_intake_files (attempt_id);

COMMIT;

-- Reversible question-bank housekeeping only. No question is archived here.
BEGIN;
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND conname = 'questions_archive_inactive'
  ) THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_archive_inactive
      CHECK (archived_at IS NULL OR active IS NOT TRUE);
  END IF;
END;
$$;
COMMENT ON COLUMN public.questions.archived_at IS
  'Reversible admin workspace archive; archived questions must remain inactive. Student history and review records are retained.';
COMMIT;

BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS portal_stage text NOT NULL DEFAULT 'active'
  CHECK (portal_stage IN ('assessment', 'active', 'inactive'));

UPDATE public.students
SET portal_stage = 'active'
WHERE portal_stage IS NULL;

COMMIT;

BEGIN;

-- Admin follow-up visibility is separate from intake status and student access.
ALTER TABLE public.consult_intakes
  ADD COLUMN IF NOT EXISTS prospect_hidden_at timestamptz;

COMMENT ON COLUMN public.consult_intakes.prospect_hidden_at IS
  'Hidden from the admin Prospects follow-up list until restored; does not affect linked history or student access.';

COMMIT;

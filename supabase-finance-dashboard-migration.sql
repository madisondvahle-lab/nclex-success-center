-- Private business finance tracking for the designated finance administrator.
-- Run in Supabase SQL Editor, then seed finance_admin_access with the admin Auth
-- user's UUID as shown at the end of this file.

CREATE TABLE IF NOT EXISTS public.finance_admin_access (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_admin_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_admin_access FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.finance_admin_access
    WHERE singleton = true
      AND user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.is_finance_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_finance_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on date NOT NULL DEFAULT current_date,
  merchant text NOT NULL CHECK (char_length(trim(merchant)) BETWEEN 1 AND 160),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  category text NOT NULL CHECK (char_length(trim(category)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  receipt_path text UNIQUE,
  receipt_filename text,
  receipt_mime_type text,
  receipt_byte_size bigint CHECK (
    receipt_byte_size IS NULL OR receipt_byte_size BETWEEN 0 AND 10485760
  ),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_expenses_receipt_metadata_check CHECK (
    (receipt_path IS NULL AND receipt_filename IS NULL AND receipt_mime_type IS NULL AND receipt_byte_size IS NULL)
    OR
    (receipt_path IS NOT NULL AND receipt_filename IS NOT NULL AND receipt_mime_type IS NOT NULL AND receipt_byte_size IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_expenses_occurred_on_idx
  ON public.finance_expenses (occurred_on DESC);
CREATE INDEX IF NOT EXISTS finance_expenses_category_occurred_on_idx
  ON public.finance_expenses (category, occurred_on DESC);

ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance admin manages expenses" ON public.finance_expenses;
CREATE POLICY "finance admin manages expenses"
  ON public.finance_expenses FOR ALL TO authenticated
  USING (public.is_finance_admin())
  WITH CHECK (public.is_finance_admin());

REVOKE ALL ON public.finance_expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_expenses TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-receipts',
  'finance-receipts',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "finance admin manages private receipts" ON storage.objects;
CREATE POLICY "finance admin manages private receipts"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'finance-receipts'
    AND public.is_finance_admin()
  )
  WITH CHECK (
    bucket_id = 'finance-receipts'
    AND public.is_finance_admin()
  );

-- Replace the placeholder with the designated administrator's auth.users.id.
-- RLS and revoked grants intentionally prevent client-side changes to this singleton.
-- INSERT INTO public.finance_admin_access (singleton, user_id)
-- VALUES (true, 'YOUR_ADMIN_AUTH_USER_UUID');

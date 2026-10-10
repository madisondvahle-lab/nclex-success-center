-- NCLEX Success Center — automated Strategy Session follow-ups and package credit tracking
-- Additive. Run after supabase-strategy-session-migration.sql.
-- Does not touch students or consult_intakes. Emails are sent by the
-- send-strategy-followups Edge Function (Resend), triggered by pg_cron.

BEGIN;

CREATE TABLE IF NOT EXISTS public.followup_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  send_mode text NOT NULL DEFAULT 'preview' CHECK (send_mode IN ('off', 'preview', 'live')),
  preview_email text,
  package_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  credit_amount int NOT NULL DEFAULT 40,
  credit_days int NOT NULL DEFAULT 7,
  reminder_days int NOT NULL DEFAULT 5,
  active_since timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.followup_settings (id, preview_email) VALUES (1, 'studywithmadisonrn@gmail.com')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.followup_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage followup settings" ON public.followup_settings;
CREATE POLICY "admins manage followup settings" ON public.followup_settings
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
REVOKE ALL ON public.followup_settings FROM anon;
REVOKE INSERT, DELETE ON public.followup_settings FROM authenticated;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS credit_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS credit_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_preview_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_preview_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_skip boolean NOT NULL DEFAULT false;
ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_credit_status_check;
ALTER TABLE public.consultations ADD CONSTRAINT consultations_credit_status_check
  CHECK (credit_status IN ('none', 'link_sent', 'reminded', 'purchased', 'expired'));

-- Atomically claims one email so overlapping runs can never double-send.
CREATE OR REPLACE FUNCTION public.claim_followup(p_id uuid, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days int; v_rows int;
BEGIN
  SELECT credit_days INTO v_days FROM public.followup_settings WHERE id = 1;
  IF p_kind = 'followup' THEN
    UPDATE public.consultations
       SET followup_sent_at = now(), credit_status = 'link_sent',
           credit_expires_at = coalesce(scheduled_end, scheduled_start) + make_interval(days => v_days)
     WHERE id = p_id AND followup_sent_at IS NULL AND credit_status = 'none';
  ELSIF p_kind = 'reminder' THEN
    UPDATE public.consultations SET reminder_sent_at = now(), credit_status = 'reminded'
     WHERE id = p_id AND reminder_sent_at IS NULL AND credit_status = 'link_sent';
  ELSE
    RETURN false;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END $$;

CREATE OR REPLACE FUNCTION public.release_followup(p_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_kind = 'followup' THEN
    UPDATE public.consultations SET followup_sent_at = NULL, credit_status = 'none', credit_expires_at = NULL WHERE id = p_id;
  ELSIF p_kind = 'reminder' THEN
    UPDATE public.consultations SET reminder_sent_at = NULL, credit_status = 'link_sent' WHERE id = p_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.claim_followup(uuid, text), public.release_followup(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_followup(uuid, text), public.release_followup(uuid, text) TO service_role;

COMMIT;

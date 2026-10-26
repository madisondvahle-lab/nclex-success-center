-- Run after supabase-strategy-followup-migration.sql, before publishing
-- the No Show controls. No existing records, profile links, or policies change.
BEGIN;

ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_status_check;
ALTER TABLE public.consultations ADD CONSTRAINT consultations_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_show'));

-- Use the existing append-only history; status and audit entry commit together.
CREATE OR REPLACE FUNCTION public.record_consultation_no_show_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND (OLD.status = 'no_show' OR NEW.status = 'no_show') THEN
    IF NEW.status = 'no_show' THEN
      NEW.completed_at := NULL;
    END IF;
    INSERT INTO public.consultation_events(consultation_id, event_type, details)
    VALUES (NEW.id, 'status_changed', jsonb_build_object(
      'from_status', OLD.status,
      'to_status', NEW.status,
      'previous_completed_at', OLD.completed_at,
      'changed_by', auth.uid()
    ));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consultation_no_show_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_consultation_no_show_status ON public.consultations;
CREATE TRIGGER trg_consultation_no_show_status BEFORE UPDATE OF status ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.record_consultation_no_show_status();

-- Recheck attendance when claiming live emails, including reminders whose
-- initial email was sent before the booking was corrected to No Show.
CREATE OR REPLACE FUNCTION public.claim_followup(p_id uuid, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days int; v_rows int;
BEGIN
  SELECT credit_days INTO v_days FROM public.followup_settings WHERE id = 1;
  IF p_kind = 'followup' THEN
    UPDATE public.consultations
       SET followup_sent_at = now(), credit_status = 'link_sent',
           credit_expires_at = coalesce(scheduled_end, scheduled_start) + make_interval(days => v_days)
     WHERE id = p_id AND followup_sent_at IS NULL AND credit_status = 'none'
       AND status <> 'no_show';
  ELSIF p_kind = 'reminder' THEN
    UPDATE public.consultations SET reminder_sent_at = now(), credit_status = 'reminded'
     WHERE id = p_id AND reminder_sent_at IS NULL AND credit_status = 'link_sent'
       AND status <> 'no_show';
  ELSE
    RETURN false;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END $$;

REVOKE ALL ON FUNCTION public.claim_followup(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_followup(uuid, text) TO service_role;

COMMIT;

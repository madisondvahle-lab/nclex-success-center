-- NCLEX Success Center — Calendly free-consultation workflow
-- Additive. Run in Supabase SQL Editor after supabase-consult-intake-migration.sql,
-- supabase-student-onboarding-migration.sql, and supabase-secure-access-migration.sql.
-- Does not modify students or consult_intakes rows or statuses (except inserting a
-- new consult_intakes prospect row when no email match exists).

BEGIN;

CREATE TABLE IF NOT EXISTS public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendly_invitee_uri text NOT NULL UNIQUE,
  calendly_event_uri text,
  calendly_event_name text,
  invitee_name text NOT NULL,
  invitee_email text NOT NULL,
  invitee_timezone text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  consult_intake_id uuid REFERENCES public.consult_intakes(id) ON DELETE SET NULL,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled')),
  cancel_reason text,
  calendly_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (student_id IS NOT NULL OR consult_intake_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_consultations_start ON public.consultations (scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_student ON public.consultations (student_id);
CREATE INDEX IF NOT EXISTS idx_consultations_intake ON public.consultations (consult_intake_id);
CREATE INDEX IF NOT EXISTS idx_consultations_email ON public.consultations (lower(invitee_email));

-- Append-only booking history (booked / rescheduled / cancelled).
CREATE TABLE IF NOT EXISTS public.consultation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultation_events_consult ON public.consultation_events (consultation_id, created_at);

-- Replay protection for webhook deliveries.
CREATE TABLE IF NOT EXISTS public.calendly_webhook_receipts (
  delivery_key text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendly_webhook_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage consultations" ON public.consultations;
CREATE POLICY "admins manage consultations" ON public.consultations
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP POLICY IF EXISTS "admins read consultation events" ON public.consultation_events;
CREATE POLICY "admins read consultation events" ON public.consultation_events
  FOR SELECT TO authenticated USING (public.is_app_admin());

REVOKE ALL ON public.consultations, public.consultation_events, public.calendly_webhook_receipts FROM anon;
REVOKE ALL ON public.calendly_webhook_receipts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.consultation_events FROM authenticated;
REVOKE DELETE ON public.consultations FROM authenticated;

CREATE OR REPLACE FUNCTION public.touch_consultation_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_consultations_updated ON public.consultations;
CREATE TRIGGER trg_consultations_updated BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.touch_consultation_updated_at();

-- Called only by the calendly-webhook Edge Function (service role) after the
-- Calendly signature has been verified.
CREATE OR REPLACE FUNCTION public.process_calendly_event(p_event text, p_payload jsonb, p_delivery_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_payload->>'email', '')));
  v_name text := coalesce(nullif(trim(p_payload->>'name'), ''), v_email);
  v_uri text := p_payload->>'uri';
  v_old_uri text := p_payload->>'old_invitee';
  v_sched jsonb := coalesce(p_payload->'scheduled_event', '{}'::jsonb);
  v_start timestamptz := nullif(v_sched->>'start_time', '')::timestamptz;
  v_end timestamptz := nullif(v_sched->>'end_time', '')::timestamptz;
  v_student_id uuid;
  v_intake_id uuid;
  v_intake_student uuid;
  v_admin uuid;
  v_row public.consultations%ROWTYPE;
  v_action text;
BEGIN
  IF v_uri IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing invitee uri');
  END IF;

  INSERT INTO calendly_webhook_receipts(delivery_key) VALUES (p_delivery_key)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'action', 'duplicate_delivery');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(coalesce(nullif(v_email, ''), v_uri)));

  IF p_event = 'invitee.canceled' THEN
    SELECT * INTO v_row FROM consultations WHERE calendly_invitee_uri = v_uri FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'action', 'cancel_unknown_booking');
    END IF;
    IF v_row.status = 'scheduled' THEN
      UPDATE consultations
        SET status = CASE WHEN coalesce((p_payload->>'rescheduled')::boolean, false) THEN 'rescheduled' ELSE 'cancelled' END,
            cancel_reason = p_payload#>>'{cancellation,reason}'
        WHERE id = v_row.id;
      INSERT INTO consultation_events(consultation_id, event_type, details)
        VALUES (v_row.id,
                CASE WHEN coalesce((p_payload->>'rescheduled')::boolean, false) THEN 'rescheduled_away' ELSE 'cancelled' END,
                jsonb_build_object('reason', p_payload#>>'{cancellation,reason}', 'canceler', p_payload#>>'{cancellation,canceler_type}'));
    END IF;
    RETURN jsonb_build_object('ok', true, 'action', 'cancelled', 'consultation_id', v_row.id);
  END IF;

  IF p_event <> 'invitee.created' THEN
    RETURN jsonb_build_object('ok', true, 'action', 'ignored_event');
  END IF;

  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing email');
  END IF;

  -- Reschedule (or repeat delivery): reuse the existing consultation and keep its notes.
  SELECT * INTO v_row FROM consultations
    WHERE calendly_invitee_uri = v_uri
       OR (v_old_uri IS NOT NULL AND calendly_invitee_uri = v_old_uri)
    ORDER BY (calendly_invitee_uri = v_uri) DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND v_row.status IN ('scheduled', 'cancelled', 'rescheduled') THEN
    UPDATE consultations SET
      calendly_invitee_uri = v_uri,
      calendly_event_uri = v_sched->>'uri',
      calendly_event_name = v_sched->>'name',
      scheduled_start = v_start,
      scheduled_end = v_end,
      status = 'scheduled',
      cancel_reason = NULL
    WHERE id = v_row.id;
    INSERT INTO consultation_events(consultation_id, event_type, details)
      VALUES (v_row.id, 'rescheduled_to', jsonb_build_object('start', v_start, 'end', v_end));
    RETURN jsonb_build_object('ok', true, 'action', 'rescheduled', 'consultation_id', v_row.id);
  ELSIF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'action', 'existing_consultation_preserved', 'consultation_id', v_row.id);
  END IF;

  -- Match existing profiles by email: students first, then prospects.
  SELECT id INTO v_student_id FROM students
    WHERE lower(trim(email)) = v_email
    ORDER BY (archived_at IS NULL) DESC, created_at LIMIT 1;

  SELECT id, student_id INTO v_intake_id, v_intake_student FROM consult_intakes
    WHERE lower(trim(email)) = v_email
    ORDER BY (student_id IS NOT NULL) DESC, created_at LIMIT 1;

  IF v_student_id IS NULL THEN
    v_student_id := v_intake_student;
  END IF;

  IF v_student_id IS NULL AND v_intake_id IS NULL THEN
    SELECT user_id INTO v_admin FROM app_admins ORDER BY user_id LIMIT 1;
    IF v_admin IS NULL THEN
      RAISE EXCEPTION 'No app admin exists to own the new prospect record';
    END IF;
    INSERT INTO consult_intakes(full_name, email, phone, time_zone, referral_source, status, consult_date, created_by)
      VALUES (v_name, v_email, nullif(p_payload->>'text_reminder_number', ''), p_payload->>'timezone',
              'Calendly', 'consult_scheduled', (v_start AT TIME ZONE 'UTC')::date, v_admin)
      RETURNING id INTO v_intake_id;
    v_action := 'created_prospect';
  ELSE
    v_action := 'matched_existing_profile';
  END IF;

  INSERT INTO consultations(calendly_invitee_uri, calendly_event_uri, calendly_event_name, invitee_name,
      invitee_email, invitee_timezone, student_id, consult_intake_id, scheduled_start, scheduled_end,
      calendly_answers)
    VALUES (v_uri, v_sched->>'uri', v_sched->>'name', v_name, v_email, p_payload->>'timezone',
      v_student_id, v_intake_id, v_start, v_end, coalesce(p_payload->'questions_and_answers', '[]'::jsonb))
    RETURNING * INTO v_row;

  INSERT INTO consultation_events(consultation_id, event_type, details)
    VALUES (v_row.id, 'booked', jsonb_build_object('profile', v_action, 'start', v_start));

  RETURN jsonb_build_object('ok', true, 'action', v_action, 'consultation_id', v_row.id);
END $$;

REVOKE ALL ON FUNCTION public.process_calendly_event(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_calendly_event(text, jsonb, text) TO service_role;

COMMIT;

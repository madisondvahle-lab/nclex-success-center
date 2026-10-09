-- NCLEX Success Center — track the paid NCLEX Strategy Session alongside free consultations.
-- Additive. Run after supabase-calendly-consultations-migration.sql.
BEGIN;

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS consult_type text NOT NULL DEFAULT 'free_consultation';
ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_consult_type_check;
ALTER TABLE public.consultations ADD CONSTRAINT consultations_consult_type_check
  CHECK (consult_type IN ('free_consultation', 'strategy_session'));

DROP FUNCTION IF EXISTS public.process_calendly_event(text, jsonb, text);

CREATE OR REPLACE FUNCTION public.process_calendly_event(p_event text, p_payload jsonb, p_delivery_key text, p_consult_type text DEFAULT 'free_consultation')
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
      calendly_answers, consult_type)
    VALUES (v_uri, v_sched->>'uri', v_sched->>'name', v_name, v_email, p_payload->>'timezone',
      v_student_id, v_intake_id, v_start, v_end, coalesce(p_payload->'questions_and_answers', '[]'::jsonb), p_consult_type)
    RETURNING * INTO v_row;

  INSERT INTO consultation_events(consultation_id, event_type, details)
    VALUES (v_row.id, 'booked', jsonb_build_object('profile', v_action, 'start', v_start));

  RETURN jsonb_build_object('ok', true, 'action', v_action, 'consultation_id', v_row.id);
END $$;

REVOKE ALL ON FUNCTION public.process_calendly_event(text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_calendly_event(text, jsonb, text, text) TO service_role;

COMMIT;

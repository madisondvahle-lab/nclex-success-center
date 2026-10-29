-- Local preparation only. Requires secure-access, student-onboarding, Calendly,
-- and admin-appointment-calendar migrations. Do not apply without approval.
-- No backfill, student edits, messages, or changes to existing coaching flows.
BEGIN;

CREATE TABLE public.nclex_coaching_students (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  history_reviewed boolean NOT NULL DEFAULT false,
  planned_exam_type text CHECK (planned_exam_type IN ('RN', 'PN')),
  planned_candidate_type text CHECK (planned_candidate_type IN ('first_time', 'retaker')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  followup_preference text NOT NULL DEFAULT 'not_requested'
    CHECK (followup_preference IN ('not_requested', 'opted_in', 'opted_out')),
  followup_consent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((followup_preference = 'not_requested') = (followup_consent_at IS NULL))
);

CREATE TABLE public.nclex_coaching_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.nclex_coaching_students(student_id) ON DELETE RESTRICT,
  package_name text NOT NULL CHECK (length(btrim(package_name)) BETWEEN 1 AND 160),
  purchased_on date NOT NULL,
  payment_status text NOT NULL CHECK (payment_status IN ('unverified', 'verified', 'void')),
  payment_reference text NOT NULL DEFAULT '' CHECK (length(payment_reference) <= 1000),
  payment_verified_on date,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payment_status <> 'verified' OR
    (length(btrim(payment_reference)) > 0 AND payment_verified_on IS NOT NULL))
);

CREATE TABLE public.nclex_coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.nclex_coaching_purchases(id) ON DELETE RESTRICT,
  consultation_id uuid UNIQUE REFERENCES public.consultations(id) ON DELETE RESTRICT,
  completed_on date NOT NULL,
  completion_reference text NOT NULL CHECK (length(btrim(completion_reference)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void')),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(purchase_id, completed_on, completion_reference)
);

-- Reuse actual examination records, including students without an intake.
-- Existing intake-linked records and their IDs/CPRs are unchanged.
ALTER TABLE public.nclex_attempts
  ALTER COLUMN consult_intake_id DROP NOT NULL,
  ADD COLUMN student_id uuid REFERENCES public.students(id) ON DELETE RESTRICT,
  ADD COLUMN exam_type text CHECK (exam_type IN ('RN', 'PN')),
  ADD COLUMN candidate_type text CHECK (candidate_type IN ('first_time', 'retaker')),
  ADD COLUMN exam_taken boolean,
  ADD CONSTRAINT nclex_attempt_taken_result CHECK (exam_taken IS DISTINCT FROM false OR result IS NULL),
  ADD CONSTRAINT nclex_attempt_identity CHECK (consult_intake_id IS NOT NULL OR student_id IS NOT NULL);
CREATE UNIQUE INDEX nclex_direct_student_attempt_number
  ON public.nclex_attempts(student_id, attempt_number) WHERE consult_intake_id IS NULL;

CREATE TABLE public.nclex_coaching_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.nclex_attempts(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('license', 'official', 'quick_results', 'student_report', 'none')),
  observed_result text CHECK (observed_result IN ('pass', 'fail')),
  exam_date date,
  exam_type text CHECK (exam_type IN ('RN', 'PN')),
  supports_attempt boolean NOT NULL DEFAULT false,
  identity_checked boolean NOT NULL DEFAULT false,
  checked_on date NOT NULL,
  checked_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_reference text NOT NULL DEFAULT '' CHECK (length(source_reference) <= 2000),
  licensing_board text NOT NULL DEFAULT '' CHECK (length(licensing_board) <= 160),
  license_type text NOT NULL DEFAULT '' CHECK (length(license_type) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  storage_path text UNIQUE,
  file_name text,
  mime_type text,
  byte_size integer,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason text NOT NULL DEFAULT '' CHECK (length(revocation_reason) <= 1000),
  CHECK (method = 'none' OR length(btrim(source_reference)) > 0),
  CHECK (method <> 'license' OR observed_result IS NULL OR observed_result = 'pass'),
  CHECK (NOT supports_attempt OR (observed_result IS NOT NULL AND exam_date IS NOT NULL AND exam_type IS NOT NULL)),
  CHECK (NOT supports_attempt OR checked_on >= exam_date),
  CHECK (method <> 'license' OR NOT supports_attempt OR
    (identity_checked AND length(btrim(licensing_board)) > 0 AND length(btrim(license_type)) > 0)),
  CHECK ((revoked_at IS NULL AND revocation_reason = '') OR
    (revoked_at IS NOT NULL AND length(btrim(revocation_reason)) > 0)),
  CHECK (
    (storage_path IS NULL AND file_name IS NULL AND mime_type IS NULL AND byte_size IS NULL AND sha256 IS NULL)
    OR (storage_path IS NOT NULL AND file_name IS NOT NULL AND mime_type IS NOT NULL
      AND byte_size IS NOT NULL AND sha256 IS NOT NULL
      AND mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')
      AND byte_size BETWEEN 1 AND 10485760 AND sha256 ~ '^[0-9a-f]{64}$')
  )
);

CREATE TABLE public.nclex_coaching_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  before_data jsonb,
  after_data jsonb
);
CREATE INDEX nclex_coaching_audit_record ON public.nclex_coaching_audit(record_id, changed_at);
CREATE INDEX nclex_coaching_purchases_student ON public.nclex_coaching_purchases(student_id);
CREATE INDEX nclex_coaching_sessions_purchase ON public.nclex_coaching_sessions(purchase_id);
CREATE INDEX nclex_coaching_evidence_attempt ON public.nclex_coaching_evidence(attempt_id);
CREATE INDEX nclex_attempts_student ON public.nclex_attempts(student_id);

ALTER TABLE public.nclex_coaching_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nclex_coaching_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nclex_coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nclex_coaching_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nclex_coaching_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nclex_coaching_students, public.nclex_coaching_purchases,
  public.nclex_coaching_sessions, public.nclex_coaching_evidence,
  public.nclex_coaching_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nclex_coaching_students, public.nclex_coaching_purchases,
  public.nclex_coaching_sessions, public.nclex_coaching_evidence TO authenticated;
GRANT SELECT ON public.nclex_coaching_audit TO authenticated;
CREATE POLICY "admins manage coaching students" ON public.nclex_coaching_students
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "admins manage coaching purchases" ON public.nclex_coaching_purchases
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "admins manage coaching completion" ON public.nclex_coaching_sessions
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "admins manage outcome evidence" ON public.nclex_coaching_evidence
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "admins read coaching audit" ON public.nclex_coaching_audit
  FOR SELECT TO authenticated USING (public.is_app_admin());

CREATE FUNCTION public.validate_nclex_coaching_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_student uuid; v_intake_student uuid; v_booking public.consultations%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'nclex_coaching_students' THEN
    IF OLD.id <> NEW.id THEN RAISE EXCEPTION 'Record identity cannot be changed'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'nclex_coaching_students' THEN
    IF TG_OP = 'UPDATE' AND (OLD.student_id <> NEW.student_id OR OLD.report_id <> NEW.report_id) THEN
      RAISE EXCEPTION 'Student and report identities cannot be changed';
    END IF;
    IF NEW.followup_consent_at > now() THEN RAISE EXCEPTION 'Consent date cannot be in the future'; END IF;
  ELSIF TG_TABLE_NAME = 'nclex_coaching_purchases' THEN
    IF TG_OP = 'UPDATE' AND OLD.student_id <> NEW.student_id THEN RAISE EXCEPTION 'Purchase student cannot be changed'; END IF;
    IF NEW.purchased_on > current_date OR NEW.payment_verified_on > current_date THEN
      RAISE EXCEPTION 'Purchase and payment verification cannot be future dated';
    END IF;
    IF EXISTS (SELECT 1 FROM nclex_coaching_sessions WHERE purchase_id=NEW.id AND completed_on<NEW.purchased_on AND status='completed') THEN
      RAISE EXCEPTION 'Purchase date cannot be after an existing completed session';
    END IF;
  ELSIF TG_TABLE_NAME = 'nclex_coaching_sessions' THEN
    IF TG_OP = 'UPDATE' AND OLD.purchase_id <> NEW.purchase_id THEN RAISE EXCEPTION 'Session purchase cannot be changed'; END IF;
    IF NEW.completed_on > current_date OR NEW.completed_on < (SELECT purchased_on FROM nclex_coaching_purchases WHERE id = NEW.purchase_id) THEN
      RAISE EXCEPTION 'Completion must be on/after purchase and not in the future';
    END IF;
    IF NEW.consultation_id IS NOT NULL AND NEW.status='completed' THEN
      SELECT * INTO STRICT v_booking FROM consultations WHERE id = NEW.consultation_id;
      SELECT student_id INTO v_student FROM nclex_coaching_purchases WHERE id = NEW.purchase_id;
      SELECT student_id INTO v_intake_student FROM consult_intakes WHERE id = v_booking.consult_intake_id;
      IF v_booking.consult_type <> 'tutoring_session' OR v_booking.status <> 'completed'
        OR coalesce(v_booking.student_id, v_intake_student) IS DISTINCT FROM v_student THEN
        RAISE EXCEPTION 'Link only a completed tutoring booking belonging to this student; Strategy Sessions do not qualify';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'nclex_attempts' THEN
    SELECT student_id INTO v_intake_student FROM consult_intakes WHERE id = NEW.consult_intake_id;
    IF NEW.student_id IS NOT NULL AND NEW.consult_intake_id IS NOT NULL AND v_intake_student IS DISTINCT FROM NEW.student_id THEN
      RAISE EXCEPTION 'Attempt student does not match the linked intake';
    END IF;
    IF TG_OP='UPDATE' AND OLD.student_id IS NOT NULL AND NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'Direct attempt student cannot be reassigned';
    END IF;
    v_student := coalesce(NEW.student_id,v_intake_student);
    IF NEW.exam_taken AND NEW.test_date > current_date THEN RAISE EXCEPTION 'A future examination cannot already have been taken'; END IF;
    IF EXISTS(SELECT 1 FROM nclex_coaching_students WHERE student_id=v_student) THEN
      IF TG_OP='INSERT' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(v_student::text,0));
        IF EXISTS(SELECT 1 FROM nclex_attempts a LEFT JOIN consult_intakes i ON i.id=a.consult_intake_id
          WHERE coalesce(a.student_id,i.student_id)=v_student AND
            (a.attempt_number=NEW.attempt_number OR a.test_date=NEW.test_date)) THEN
          RAISE EXCEPTION 'This student already has this attempt number or exam date. Edit the existing record in Coaching Outcomes';
        END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'nclex_coaching_evidence' THEN
    IF TG_OP = 'UPDATE' THEN
      IF (to_jsonb(OLD) - ARRAY['revoked_at','revocation_reason']) IS DISTINCT FROM
         (to_jsonb(NEW) - ARRAY['revoked_at','revocation_reason']) OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
        RAISE EXCEPTION 'Evidence is immutable; revoke with a reason and add a replacement';
      END IF;
      NEW.revoked_at := now();
    ELSE
      NEW.checked_by := auth.uid();
      NEW.created_at := now();
      IF NEW.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'New evidence cannot already be revoked'; END IF;
    END IF;
    IF NEW.checked_on > current_date THEN RAISE EXCEPTION 'Verification cannot be future dated'; END IF;
    IF NEW.storage_path IS NOT NULL AND NEW.storage_path NOT LIKE NEW.attempt_id::text || '/%' THEN
      RAISE EXCEPTION 'Evidence path must belong to this attempt';
    END IF;
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_nclex_coaching_record() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.retain_coaching_nclex_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM nclex_coaching_students WHERE student_id=coalesce(OLD.student_id,
    (SELECT student_id FROM consult_intakes WHERE id=OLD.consult_intake_id))) THEN
    RAISE EXCEPTION 'Coaching outcome attempts must be retained for review. Correct the existing record instead of deleting it';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.retain_coaching_nclex_attempt() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coaching_retain BEFORE DELETE ON public.nclex_attempts
  FOR EACH ROW EXECUTE FUNCTION public.retain_coaching_nclex_attempt();

CREATE FUNCTION public.audit_nclex_coaching_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO nclex_coaching_audit(table_name,record_id,operation,changed_by,before_data,after_data)
    VALUES (TG_TABLE_NAME, coalesce(v_new->>'id',v_new->>'student_id',v_old->>'id',v_old->>'student_id')::uuid,
      TG_OP,auth.uid(),v_old,v_new);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_nclex_coaching_record() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nclex_coaching_students','nclex_coaching_purchases','nclex_coaching_sessions','nclex_coaching_evidence','nclex_attempts'] LOOP
    EXECUTE format('CREATE TRIGGER coaching_validate BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_nclex_coaching_record()',t);
    EXECUTE format('CREATE TRIGGER coaching_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_nclex_coaching_record()',t);
  END LOOP;
END $$;

-- Serialize new attempts per student, reuse any existing intake, and reject
-- stale edits. Existing CPR/intake editors continue to use their existing paths.
CREATE FUNCTION public.save_coaching_nclex_attempt(
  p_student uuid, p_id uuid, p_expected timestamptz, p_number integer,
  p_date date, p_result text, p_exam text, p_candidate text, p_taken boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_intake uuid; v_id uuid; v_attempt public.nclex_attempts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  PERFORM 1 FROM nclex_coaching_students WHERE student_id=p_student FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add this existing student to coaching outcomes first'; END IF;
  IF p_taken IS NULL OR (NOT p_taken AND p_result IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm the examination was taken before recording a result';
  END IF;
  IF p_date > current_date AND p_result IS NOT NULL THEN RAISE EXCEPTION 'Future examinations must remain pending'; END IF;
  IF p_candidate='first_time' AND p_number<>1 OR p_candidate='retaker' AND p_number<2 THEN
    RAISE EXCEPTION 'Candidate classification must match the lifetime attempt number';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_attempt FROM nclex_attempts WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR coalesce(v_attempt.student_id,(SELECT student_id FROM consult_intakes WHERE id=v_attempt.consult_intake_id))
      IS DISTINCT FROM p_student THEN RAISE EXCEPTION 'Attempt does not belong to this student'; END IF;
    IF v_attempt.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Attempt changed in another editor. Reload before saving'; END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM nclex_attempts a LEFT JOIN consult_intakes i ON i.id=a.consult_intake_id
    WHERE coalesce(a.student_id,i.student_id)=p_student AND (p_id IS NULL OR a.id<>p_id)
      AND (a.attempt_number=p_number OR (p_date IS NOT NULL AND a.test_date=p_date))
  ) THEN RAISE EXCEPTION 'An attempt with this number or examination date already exists. Edit the existing attempt'; END IF;
  IF p_id IS NULL THEN
    SELECT id INTO v_intake FROM consult_intakes WHERE student_id=p_student ORDER BY created_at,id LIMIT 1;
    INSERT INTO nclex_attempts(student_id,consult_intake_id,attempt_number,test_date,result,exam_type,candidate_type,exam_taken)
    VALUES(p_student,v_intake,p_number,p_date,p_result,p_exam,p_candidate,p_taken) RETURNING id INTO v_id;
  ELSE
    UPDATE nclex_attempts SET attempt_number=p_number,test_date=p_date,result=p_result,exam_type=p_exam,candidate_type=p_candidate,exam_taken=p_taken
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_coaching_nclex_attempt(uuid,uuid,timestamptz,integer,date,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_coaching_nclex_attempt(uuid,uuid,timestamptz,integer,date,text,text,text,boolean) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('nclex-outcome-evidence','nclex-outcome-evidence',false,10485760,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp']);
CREATE POLICY "admins read private NCLEX evidence" ON storage.objects FOR SELECT TO authenticated
  USING(bucket_id='nclex-outcome-evidence' AND public.is_app_admin());
CREATE POLICY "admins upload private NCLEX evidence" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK(bucket_id='nclex-outcome-evidence' AND public.is_app_admin());
-- Allow cleanup only for an upload whose metadata never committed. Attached
-- evidence, including revoked versions, cannot be overwritten or deleted.
CREATE POLICY "admins clean unattached NCLEX evidence" ON storage.objects FOR DELETE TO authenticated
  USING(bucket_id='nclex-outcome-evidence' AND public.is_app_admin()
    AND NOT EXISTS(SELECT 1 FROM public.nclex_coaching_evidence e WHERE e.storage_path=storage.objects.name));

COMMIT;

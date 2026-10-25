-- Phase 1: draft-only audits and approval. Apply manually after the existing
-- question audit, revision-edit, and flags migrations. Never applies questions.
BEGIN;

ALTER TABLE public.question_audits
  ADD COLUMN IF NOT EXISTS draft_version timestamptz,
  ADD COLUMN IF NOT EXISTS base_fingerprint text,
  ADD COLUMN IF NOT EXISTS proposed_fingerprint text;

CREATE TABLE IF NOT EXISTS public.question_draft_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.question_draft_audit_items (
  run_id uuid NOT NULL REFERENCES public.question_draft_audit_runs(id),
  revision_id uuid NOT NULL,
  question_id uuid NOT NULL,
  draft_version timestamptz NOT NULL,
  expected_status text NOT NULL,
  base_content jsonb NOT NULL,
  proposed_content jsonb NOT NULL,
  base_fingerprint text NOT NULL,
  proposed_fingerprint text NOT NULL,
  question_label text NOT NULL,
  source text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  audit_id uuid REFERENCES public.question_audits(id) ON DELETE SET NULL,
  report jsonb,
  error text,
  completed_at timestamptz,
  PRIMARY KEY (run_id, revision_id)
);
CREATE TABLE IF NOT EXISTS public.question_revision_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision_id uuid,
  question_id uuid,
  event_type text NOT NULL,
  actor uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  before_record jsonb,
  after_record jsonb,
  request_id uuid,
  receipt jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS question_revision_receipt_request
  ON public.question_revision_events(request_id) WHERE event_type IN ('batch_approved','batch_rejected');
CREATE INDEX IF NOT EXISTS question_revision_events_revision
  ON public.question_revision_events(revision_id, id);
CREATE INDEX IF NOT EXISTS question_draft_audit_items_revision
  ON public.question_draft_audit_items(revision_id, completed_at DESC);
CREATE OR REPLACE VIEW public.latest_question_draft_audits WITH (security_invoker=true) AS
  SELECT DISTINCT ON (revision_id) * FROM public.question_draft_audit_items
  WHERE status='completed' ORDER BY revision_id,completed_at DESC,run_id;

ALTER TABLE public.question_draft_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_draft_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revision_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read draft audit runs" ON public.question_draft_audit_runs;
CREATE POLICY "admins read draft audit runs" ON public.question_draft_audit_runs
  FOR SELECT TO authenticated USING (public.is_app_admin());
DROP POLICY IF EXISTS "admins read draft audit items" ON public.question_draft_audit_items;
CREATE POLICY "admins read draft audit items" ON public.question_draft_audit_items
  FOR SELECT TO authenticated USING (public.is_app_admin());
DROP POLICY IF EXISTS "admins read revision events" ON public.question_revision_events;
CREATE POLICY "admins read revision events" ON public.question_revision_events
  FOR SELECT TO authenticated USING (public.is_app_admin());
REVOKE ALL ON public.question_draft_audit_runs, public.question_draft_audit_items,
  public.question_revision_events, public.latest_question_draft_audits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.question_draft_audit_runs, public.question_draft_audit_items,
  public.question_revision_events, public.latest_question_draft_audits TO authenticated;

CREATE OR REPLACE FUNCTION public.question_content_fingerprint(p_content jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT encode(sha256(convert_to(p_content::text, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.question_revision_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO question_revision_events(revision_id, question_id, event_type, actor, before_record, after_record)
  VALUES (NEW.id, NEW.question_id, CASE WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN OLD.proposed_content IS DISTINCT FROM NEW.proposed_content
      OR OLD.proposed_at IS DISTINCT FROM NEW.proposed_at THEN 'edited'
    ELSE NEW.status END, auth.uid(), CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS question_revision_history ON public.question_revision_drafts;
CREATE TRIGGER question_revision_history AFTER INSERT OR UPDATE ON public.question_revision_drafts
  FOR EACH ROW EXECUTE FUNCTION public.question_revision_event();

-- A baseline preserves existing drafts without changing their contents or status.
INSERT INTO public.question_revision_events(revision_id, question_id, event_type, actor, after_record)
SELECT d.id, d.question_id, 'baseline', NULL, to_jsonb(d)
FROM public.question_revision_drafts d
WHERE NOT EXISTS (SELECT 1 FROM public.question_revision_events e WHERE e.revision_id = d.id);

-- This policy is deliberately independent of model judgments and browser labels.
-- Only single-line spacing in MCQ/SATA stem/visible choices can be batch eligible.
CREATE OR REPLACE FUNCTION public.inspect_question_revision(p_base jsonb, p_proposed jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_fields text[];
  v_field text;
  v_findings jsonb := '[]'::jsonb;
  v_diff jsonb := '[]'::jsonb;
  v_clinical boolean := false;
  v_structure boolean := false;
  v_options jsonb;
  v_keys jsonb;
  v_option jsonb;
  v_seen text[] := '{}';
  v_type text := coalesce(p_proposed->>'item_type','mcq');
  v_n integer;
  v_label text;
  v_content jsonb;
  v_key_length integer := 0;
  v_other_length integer := 0;
  v_other_count integer := 0;
BEGIN
  SELECT array_agg(key ORDER BY key) INTO v_fields FROM
    (SELECT jsonb_object_keys(p_base) AS key UNION SELECT jsonb_object_keys(p_proposed)) fields;
  FOREACH v_field IN ARRAY coalesce(v_fields, '{}'::text[]) LOOP
    IF (p_base->v_field) IS DISTINCT FROM (p_proposed->v_field) THEN
      v_diff := v_diff || jsonb_build_array(jsonb_build_object('field',v_field,
        'original',p_base->v_field,'proposed',p_proposed->v_field));
      IF v_field NOT IN ('stem','option_a','option_b','option_c','option_d')
        OR jsonb_typeof(p_base->v_field) IS DISTINCT FROM 'string'
        OR jsonb_typeof(p_proposed->v_field) IS DISTINCT FROM 'string'
        OR btrim(regexp_replace(p_base->>v_field, '[ ' || chr(9) || ']+', ' ', 'g'))
          IS DISTINCT FROM btrim(regexp_replace(p_proposed->>v_field, '[ ' || chr(9) || ']+', ' ', 'g'))
        OR position(chr(10) IN (p_base->>v_field)) > 0
        OR position(chr(10) IN (p_proposed->>v_field)) > 0
        OR position(chr(13) IN (p_base->>v_field)) > 0
        OR position(chr(13) IN (p_proposed->>v_field)) > 0
        OR (p_base->>v_field) ~ '<[!/]?[[:alpha:]]'
        OR (p_proposed->>v_field) ~ '<[!/]?[[:alpha:]]'
      THEN
        v_clinical := true;
        v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major',
          'evidence','deterministic','field',v_field,'code','individual_review',
          'detail','Change is outside the mechanical-spacing allowlist. Clinical meaning and scoring safety are not verified.',
          'suggestion','Review this difference individually; verify medical claims against an authoritative source.'));
      END IF;
    END IF;
  END LOOP;
  FOREACH v_label IN ARRAY ARRAY['original','proposed'] LOOP
    v_content := CASE WHEN v_label='original' THEN p_base ELSE p_proposed END;
    v_type := coalesce(v_content->>'item_type','mcq');
    IF v_type NOT IN ('mcq','sata') THEN
      v_clinical := true;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
        'field',v_label || '.item_type','code','unsupported_type','detail','This interaction requires individual scoring review.',
        'suggestion','Use the existing interaction editor and review scoring individually.'));
      CONTINUE;
    END IF;
    v_options := CASE WHEN v_type='mcq' THEN jsonb_build_array(v_content->'option_a',v_content->'option_b',
      v_content->'option_c',v_content->'option_d') ELSE v_content#>'{item_data,options}' END;
    v_keys := CASE WHEN v_type='mcq' THEN jsonb_build_array(array_position(ARRAY['a','b','c','d'],
      v_content->>'correct_answer') - 1) ELSE v_content#>'{item_data,correct}' END;
    IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' OR jsonb_typeof(v_keys) IS DISTINCT FROM 'array' THEN
      v_structure := true;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
        'field',v_label || '.item_data','code','invalid_scoring','detail','Options or answer positions are not arrays.',
        'suggestion','Repair interaction data through individual review.'));
      CONTINUE;
    END IF;
    v_n := jsonb_array_length(v_options);
    v_seen := '{}';
    IF v_n < 4 OR v_n > 10 OR jsonb_array_length(v_keys)=0
      OR jsonb_array_length(v_keys) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements(v_keys))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_keys) k WHERE
        CASE WHEN jsonb_typeof(k)='number' AND k::text ~ '^[0-9]+$'
          THEN k::text::numeric >= v_n ELSE true END)
      OR (v_type='mcq' AND v_content->'item_data' IS NOT NULL AND v_content->'item_data'<>'null'::jsonb
        AND ((v_content#>'{item_data,options}') IS DISTINCT FROM v_options
          OR (v_content#>'{item_data,correct}') IS DISTINCT FROM v_keys))
    THEN v_structure := true;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
        'field',v_label || '.answer_key','code','invalid_scoring','detail','Answer positions or stored scoring data are inconsistent.',
        'suggestion','Review the key and scoring data individually; do not infer a clinical answer.'));
    END IF;
    FOR v_option IN SELECT value FROM jsonb_array_elements(v_options) LOOP
      IF jsonb_typeof(v_option) IS DISTINCT FROM 'string' OR btrim(v_option#>>'{}')=''
        OR lower(btrim(v_option#>>'{}'))=ANY(v_seen) THEN
        v_structure := true;
        v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
          'field',v_label || '.options','code','invalid_option','detail','An option is empty, non-text, or repeats another option.',
          'suggestion','Review the options individually.'));
      END IF;
      IF (v_option#>>'{}') ~* '\m(always|never|ignore|do nothing|continue to monitor|document and reassess)\M' THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','minor','evidence','screening_signal',
          'field',v_label || '.options','code','distractor_wording',
          'detail','An option contains absolute or generic wording. This is a review signal, not a clinical defect.',
          'suggestion','Review distractor plausibility and NCLEX-style wording individually.'));
      END IF;
      v_seen := array_append(v_seen,lower(btrim(v_option#>>'{}')));
    END LOOP;
    IF jsonb_typeof(v_content->'stem') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_content->'rationale') IS DISTINCT FROM 'string'
      OR nullif(btrim(v_content->>'stem'),'') IS NULL
      OR nullif(btrim(v_content->>'rationale'),'') IS NULL
      OR jsonb_typeof(v_content->'option_rationales') IS DISTINCT FROM 'object'
      OR coalesce(v_content->>'difficulty','') NOT IN ('easy','medium','hard') THEN
      v_structure := true;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
        'field',v_label,'code','required_content','detail','Required stem, rationale, difficulty, or rationale mapping is invalid.',
        'suggestion','Complete missing content through individual review.'));
    END IF;
    FOR v_n IN 0..jsonb_array_length(v_options)-1 LOOP
      v_field := CASE WHEN v_type='mcq' THEN (ARRAY['a','b','c','d'])[v_n+1] ELSE v_n::text END;
      IF jsonb_typeof(v_content->'option_rationales'->v_field) IS DISTINCT FROM 'string'
        OR nullif(btrim(v_content->'option_rationales'->>v_field),'') IS NULL THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','minor','evidence','deterministic',
          'field',v_label || '.option_rationales.' || v_field,'code','missing_rationale',
          'detail','No individual rationale is stored for this option.',
          'suggestion','An educator must supply and verify an explanation; do not generate a confirmed medical claim.'));
      END IF;
    END LOOP;
    IF jsonb_typeof(v_content->'option_rationales')='object' AND EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_content->'option_rationales') k
      WHERE CASE WHEN v_type='mcq' THEN k<>ALL(ARRAY['a','b','c','d'])
        ELSE k<>ALL(ARRAY(SELECT n::text FROM generate_series(0,jsonb_array_length(v_options)-1) n)) END
    ) THEN
      v_structure := true;
      v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
        'field',v_label || '.option_rationales','code','rationale_mapping','detail','A rationale key does not correspond to a visible option.',
        'suggestion','Repair the mapping with individual review.'));
    END IF;
    IF v_type='mcq' AND (v_content->>'correct_answer')=ANY(ARRAY['a','b','c','d']) THEN
      v_n := array_position(ARRAY['a','b','c','d'],v_content->>'correct_answer')-1;
      v_key_length := length(v_options->>v_n);
      SELECT sum(length(value)), count(*) INTO v_other_length,v_other_count
        FROM jsonb_array_elements_text(v_options) WITH ORDINALITY o(value,i) WHERE i<>v_n+1;
      IF v_key_length > (v_other_length::numeric / greatest(v_other_count,1))*1.35
        AND v_key_length - (v_other_length::numeric / greatest(v_other_count,1)) > 15 THEN
        v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','minor','evidence','screening_signal',
          'field',v_label || '.options','code','answer_length','detail','The keyed answer is materially longer than the other options.',
          'suggestion','Review for answer-length clues; length alone does not establish poor distractor quality.'));
      END IF;
    END IF;
  END LOOP;
  v_findings := v_findings || jsonb_build_array(jsonb_build_object('severity','informational','evidence','not_verified',
    'field','clinical_accuracy','code','clinical_not_verified',
    'detail','Clinical answer accuracy, semantic rationale consistency, distractor plausibility, duplicate concepts and NCLEX quality are not clinically verified by deterministic checks.',
    'suggestion','Use authoritative guidance and individual educator review for medical or meaning-changing revisions.'));
  RETURN jsonb_build_object('criteria_version','draft-qa-v1','diff',v_diff,'findings',v_findings,
    'classification',CASE WHEN v_clinical THEN 'Needs Clinical Review' WHEN v_structure THEN 'Major Corrections'
      WHEN jsonb_array_length(v_diff)=0 THEN 'Minor Corrections'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_findings) f WHERE f->>'severity'='minor') THEN 'Minor Corrections'
      ELSE 'Ready for Approval' END,
    'eligible',NOT v_clinical AND NOT v_structure AND jsonb_array_length(v_diff)>0
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_findings) f WHERE f->>'severity'='minor'),
    'evidence_status','Deterministic checks only; clinical accuracy not verified','estimated_cost_usd',0);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_question_draft_audit(p_revision_ids uuid[], p_filters jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_d question_revision_drafts%ROWTYPE; v_count integer := 0;
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Administrator permission required.' USING ERRCODE='42501'; END IF;
  IF cardinality(p_revision_ids) IS NULL OR cardinality(p_revision_ids) NOT BETWEEN 1 AND 25
    OR cardinality(p_revision_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_revision_ids) id) THEN
    RAISE EXCEPTION 'Select 1-25 distinct correction drafts (default batch size 10).';
  END IF;
  INSERT INTO question_draft_audit_runs(created_by,filters) VALUES(auth.uid(),coalesce(p_filters,'{}')) RETURNING id INTO v_id;
  FOR v_d IN SELECT * FROM question_revision_drafts WHERE id=ANY(p_revision_ids) ORDER BY id FOR UPDATE LOOP
    IF v_d.status NOT IN ('pending_review','approved') THEN RAISE EXCEPTION 'Draft % is no longer open.',v_d.id; END IF;
    INSERT INTO question_draft_audit_items(run_id,revision_id,question_id,draft_version,expected_status,
      base_content,proposed_content,base_fingerprint,proposed_fingerprint,question_label,source)
    SELECT v_id,v_d.id,v_d.question_id,v_d.proposed_at,v_d.status,v_d.base_content,v_d.proposed_content,
      question_content_fingerprint(v_d.base_content),question_content_fingerprint(v_d.proposed_content),
      coalesce('Q-' || lpad(q.question_no::text,4,'0'),q.id::text),q.source_key FROM questions q WHERE q.id=v_d.question_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original question is unavailable for draft %.',v_d.id; END IF;
    v_count := v_count+1;
  END LOOP;
  IF v_count<>cardinality(p_revision_ids) THEN RAISE EXCEPTION 'One or more selected drafts are unavailable.'; END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_question_draft_audit(p_run_id uuid, p_revision_id uuid)
RETURNS public.question_draft_audit_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_i question_draft_audit_items%ROWTYPE;
  v_d question_revision_drafts%ROWTYPE;
  v_q jsonb; v_report jsonb; v_audit uuid; v_overlap jsonb;
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Administrator permission required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_i FROM question_draft_audit_items WHERE run_id=p_run_id AND revision_id=p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit run item not found.'; END IF;
  IF v_i.status='completed' THEN RETURN v_i; END IF;
  BEGIN
    SELECT * INTO v_d FROM question_revision_drafts WHERE id=p_revision_id FOR UPDATE;
    IF NOT FOUND OR v_d.proposed_at<>v_i.draft_version OR v_d.status<>v_i.expected_status
      OR v_d.base_content IS DISTINCT FROM v_i.base_content OR v_d.proposed_content IS DISTINCT FROM v_i.proposed_content THEN
      RAISE EXCEPTION 'Draft changed after selection. Start a fresh audit for its current version.';
    END IF;
    SELECT to_jsonb(q) INTO v_q FROM questions q WHERE id=v_i.question_id FOR SHARE;
    IF v_q IS NULL OR EXISTS (SELECT 1 FROM jsonb_each(v_i.base_content) b WHERE v_q->b.key IS DISTINCT FROM b.value) THEN
      RAISE EXCEPTION 'Original question changed after this draft was proposed. Reconcile the draft individually.';
    END IF;
    v_report := inspect_question_revision(v_i.base_content,v_i.proposed_content);
    SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'question_no',q.question_no))
      INTO v_overlap FROM questions q
      WHERE q.id<>v_i.question_id AND lower(regexp_replace(btrim(q.stem),'\s+',' ','g')) =
        lower(regexp_replace(btrim(v_i.proposed_content->>'stem'),'\s+',' ','g'));
    IF v_overlap IS NOT NULL THEN
      v_report := v_report || jsonb_build_object('eligible',false,
        'classification',CASE WHEN v_report->>'classification'='Ready for Approval' THEN 'Minor Corrections'
          ELSE v_report->>'classification' END,
        'findings',(v_report->'findings') || jsonb_build_array(jsonb_build_object('severity','minor','evidence','screening_signal',
          'field','stem','code','wording_overlap','candidates',v_overlap,
          'detail','Other bank questions have identical wording after case and spacing normalization. This does not establish redundant clinical concepts.',
          'suggestion','Review these candidates in Possible duplicates; preserve intentional conceptual reinforcement.')));
    END IF;
    IF EXISTS (SELECT 1 FROM question_flags WHERE question_id=v_i.question_id AND status='open') THEN
      v_report := v_report || jsonb_build_object('eligible',false,'classification','Needs Clinical Review',
        'findings',(v_report->'findings') || jsonb_build_array(jsonb_build_object('severity','major','evidence','deterministic',
          'field','flags','code','unresolved_flag','detail','This question has unresolved review flags.',
          'suggestion','Resolve the flagged concern individually before approval.')));
    END IF;
    INSERT INTO question_audits(question_id,content_hash,criteria_version,audit_status,findings,revision_id,
      draft_version,base_fingerprint,proposed_fingerprint,audited_by)
    VALUES(v_i.question_id, question_content_fingerprint(jsonb_build_object('revision',p_revision_id,'version',v_i.draft_version,
      'base',v_i.base_content,'proposed',v_i.proposed_content,'run',p_run_id)),
      'draft-qa-v1','revised',v_report,p_revision_id,v_i.draft_version,v_i.base_fingerprint,v_i.proposed_fingerprint,auth.uid())
      RETURNING id INTO v_audit;
    UPDATE question_draft_audit_items SET status='completed',audit_id=v_audit,report=v_report,error=NULL,completed_at=clock_timestamp()
      WHERE run_id=p_run_id AND revision_id=p_revision_id RETURNING * INTO v_i;
    INSERT INTO question_revision_events(revision_id,question_id,event_type,actor,after_record)
      VALUES(p_revision_id,v_i.question_id,'audited',auth.uid(),to_jsonb(v_i));
  EXCEPTION WHEN OTHERS THEN
    UPDATE question_draft_audit_items SET status='failed',error=SQLERRM,completed_at=clock_timestamp()
      WHERE run_id=p_run_id AND revision_id=p_revision_id RETURNING * INTO v_i;
    INSERT INTO question_revision_events(revision_id,question_id,event_type,actor,after_record)
      VALUES(p_revision_id,v_i.question_id,'audit_failed',auth.uid(),to_jsonb(v_i));
  END;
  RETURN v_i;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_question_revision_batch(p_request_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt jsonb; v_existing question_revision_events%ROWTYPE;
  v_item jsonb; v_d question_revision_drafts%ROWTYPE; v_i question_draft_audit_items%ROWTYPE;
  v_q jsonb; v_issues jsonb := '[]'; v_approved jsonb := '[]'; v_report jsonb; v_id uuid;
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Administrator permission required.' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 25
    OR (SELECT count(DISTINCT value->>'revision_id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'A request UUID and 1-25 distinct draft/audit items are required.';
  END IF;
  -- Serialize retries before checking the durable receipt.
  PERFORM set_config('lock_timeout','3s',true);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO v_existing FROM question_revision_events WHERE request_id=p_request_id AND event_type IN ('batch_approved','batch_rejected');
  IF FOUND THEN
    IF v_existing.receipt->'items' IS DISTINCT FROM p_items OR v_existing.actor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Request ID was already used for a different approval.';
    END IF;
    RETURN v_existing.receipt;
  END IF;
  -- Prevent an unresolved flag arriving between validation and approval.
  LOCK TABLE question_flags IN SHARE MODE;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'revision_id' LOOP
    v_id := (v_item->>'revision_id')::uuid;
    SELECT * INTO v_d FROM question_revision_drafts WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('revision_id',v_id,'reason','Draft not found.'));
      CONTINUE;
    END IF;
    SELECT * INTO v_i FROM question_draft_audit_items
      WHERE revision_id=v_id AND audit_id=(v_item->>'audit_id')::uuid AND status='completed';
    IF NOT FOUND OR v_d.status<>'pending_review' OR v_d.proposed_at IS DISTINCT FROM v_i.draft_version
      OR v_d.base_content IS DISTINCT FROM v_i.base_content OR v_d.proposed_content IS DISTINCT FROM v_i.proposed_content
      OR (v_item->>'draft_version')::timestamptz IS DISTINCT FROM v_d.proposed_at
      OR v_item->>'base_fingerprint' IS DISTINCT FROM question_content_fingerprint(v_d.base_content)
      OR v_item->>'proposed_fingerprint' IS DISTINCT FROM question_content_fingerprint(v_d.proposed_content) THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('revision_id',v_id,'reason','Draft or audit version is stale, missing, or no longer pending.'));
      CONTINUE;
    END IF;
    SELECT to_jsonb(q) INTO v_q FROM questions q WHERE id=v_d.question_id FOR SHARE;
    v_report := inspect_question_revision(v_d.base_content,v_d.proposed_content);
    IF v_q IS NULL OR EXISTS (SELECT 1 FROM jsonb_each(v_d.base_content) b WHERE v_q->b.key IS DISTINCT FROM b.value)
      OR (v_report->>'eligible') IS DISTINCT FROM 'true' OR (v_i.report->>'eligible') IS DISTINCT FROM 'true'
      OR (v_i.report->>'criteria_version') IS DISTINCT FROM 'draft-qa-v1'
      OR EXISTS (SELECT 1 FROM question_flags WHERE question_id=v_d.question_id AND status='open') THEN
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('revision_id',v_id,'reason','Original changed, flags remain unresolved, or individual review is required.'));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_issues)>0 THEN
    v_receipt := jsonb_build_object('approved',false,'request_id',p_request_id,'items',p_items,
      'errors',v_issues,'approved_count',0,'reviewed_by',auth.uid(),'reviewed_at',clock_timestamp(),'applied',false);
    v_receipt := v_receipt || jsonb_build_object('criteria_version','draft-qa-v1');
    INSERT INTO question_revision_events(event_type,actor,request_id,receipt)
      VALUES('batch_rejected',auth.uid(),p_request_id,v_receipt);
    RETURN v_receipt;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'revision_id' LOOP
    UPDATE question_revision_drafts SET status='approved',reviewed_by=auth.uid(),reviewed_at=clock_timestamp()
      WHERE id=(v_item->>'revision_id')::uuid RETURNING * INTO v_d;
    v_approved := v_approved || jsonb_build_array(jsonb_build_object('revision_id',v_d.id,'question_id',v_d.question_id,
      'audit_id',v_item->>'audit_id','draft_version',v_d.proposed_at,'reviewed_at',v_d.reviewed_at,
      'base_fingerprint',v_item->>'base_fingerprint','proposed_fingerprint',v_item->>'proposed_fingerprint'));
  END LOOP;
  v_receipt := jsonb_build_object('approved',true,'request_id',p_request_id,'items',p_items,
    'approved_items',v_approved,'approved_count',jsonb_array_length(v_approved),'reviewed_by',auth.uid(),
    'approved_at',clock_timestamp(),'applied',false,'criteria_version','draft-qa-v1');
  INSERT INTO question_revision_events(revision_id,question_id,event_type,actor,request_id,receipt)
    VALUES(v_d.id,v_d.question_id,'batch_approved',auth.uid(),p_request_id,v_receipt);
  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.question_revision_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.question_content_fingerprint(jsonb), public.inspect_question_revision(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_question_draft_audit(uuid[],jsonb),
  public.process_question_draft_audit(uuid,uuid), public.approve_question_revision_batch(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_question_draft_audit(uuid[],jsonb),
  public.process_question_draft_audit(uuid,uuid), public.approve_question_revision_batch(uuid,jsonb) TO authenticated;
COMMIT;

DO $$
BEGIN
  IF current_setting('app.question_draft_audit_local_test',true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'Disposable local database only.';
  END IF;
END;
$$;

CREATE TEMP TABLE expected_bank AS SELECT to_jsonb(q) row FROM public.questions q;
CREATE TEMP TABLE expected_attempts AS SELECT to_jsonb(a) row FROM public.in_house_assessment_attempts a;
CREATE TEMP TABLE expected_responses AS SELECT to_jsonb(a) row FROM public.in_house_assessment_item_responses a;
GRANT SELECT ON expected_bank,expected_attempts,expected_responses TO authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

INSERT INTO questions(id,question_no,stem,option_a,option_b,option_c,option_d,correct_answer,rationale,
  topic,difficulty,item_type,option_rationales)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,n,'Synthetic  stem ' || n,
  'Choice alpha','Choice bravo','Choice delta','Choice gamma','a','Synthetic rationale',
  'Synthetic topic','medium','mcq','{"a":"Explanation a","b":"Explanation b","c":"Explanation c","d":"Explanation d"}'
FROM generate_series(1,6) n;
CREATE TEMP TABLE bank_snapshot AS SELECT id,to_jsonb(q) row FROM questions q;
GRANT SELECT ON bank_snapshot TO authenticated;
INSERT INTO question_revision_drafts(id,question_id,base_content,proposed_content,change_summary,proposed_by)
SELECT ('20000000-0000-0000-0000-'||lpad(question_no::text,12,'0'))::uuid,id,
  jsonb_build_object('stem',stem,'option_a',option_a,'option_b',option_b,'option_c',option_c,'option_d',option_d,
    'correct_answer',correct_answer,'rationale',rationale,'difficulty',difficulty,'item_type',item_type,
    'option_rationales',option_rationales),
  jsonb_build_object('stem','Synthetic stem ' || question_no,'option_a',option_a,'option_b',option_b,'option_c',option_c,'option_d',option_d,
    'correct_answer',CASE WHEN question_no=3 THEN 'b' ELSE correct_answer END,
    'rationale',CASE WHEN question_no=4 THEN 'Changed rationale' ELSE rationale END,
    'difficulty',difficulty,'item_type',item_type,'option_rationales',option_rationales),
  'Synthetic spacing correction','00000000-0000-0000-0000-000000000001'
FROM questions WHERE question_no BETWEEN 1 AND 6;
CREATE TEMP TABLE draft_content_snapshot AS SELECT id,base_content,proposed_content FROM question_revision_drafts;

SET ROLE authenticated;
DO $$
DECLARE
  r uuid; r2 uuid; item question_draft_audit_items%ROWTYPE; saved question_draft_audit_items%ROWTYPE;
  ids uuid[] := ARRAY['20000000-0000-0000-0000-000000000001'::uuid,'20000000-0000-0000-0000-000000000002'::uuid];
  clinical uuid := '20000000-0000-0000-0000-000000000003';
  rationale uuid := '20000000-0000-0000-0000-000000000004';
  stale uuid := '20000000-0000-0000-0000-000000000005';
  flagged uuid := '20000000-0000-0000-0000-000000000006';
  payload jsonb; result jsonb; receipt jsonb; request uuid := gen_random_uuid(); refused boolean;
  old_count bigint; d question_revision_drafts%ROWTYPE;
BEGIN
  r := start_question_draft_audit(ids,'{"status":"pending_review"}');
  item := process_question_draft_audit(r,ids[1]);
  IF item.status<>'completed' OR item.report->>'classification'<>'Ready for Approval' THEN
    RAISE EXCEPTION 'Mechanical draft was not eligible: %',to_jsonb(item);
  END IF;
  saved := process_question_draft_audit(r,ids[1]);
  IF saved.audit_id<>item.audit_id THEN RAISE EXCEPTION 'Completed work was repeated.'; END IF;
  IF (SELECT count(*) FROM question_draft_audit_items WHERE run_id=r AND status='pending')<>1 THEN
    RAISE EXCEPTION 'Interrupted run did not preserve unprocessed work.';
  END IF;
  item := process_question_draft_audit(r,ids[2]);
  IF item.status<>'completed' THEN RAISE EXCEPTION 'Resume failed.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('revision_id',revision_id,'audit_id',audit_id,'draft_version',draft_version,
    'base_fingerprint',base_fingerprint,'proposed_fingerprint',proposed_fingerprint) ORDER BY revision_id)
    INTO payload FROM question_draft_audit_items WHERE run_id=r;
  result := approve_question_revision_batch(gen_random_uuid(),jsonb_set(payload,'{1,proposed_fingerprint}','"stale"'));
  IF result->>'approved'<>'false' OR result->>'approved_count'<>'0'
    OR EXISTS(SELECT 1 FROM question_revision_drafts WHERE id=ANY(ids) AND status<>'pending_review') THEN
    RAISE EXCEPTION 'Atomic validation failed: %',result;
  END IF;
  receipt := approve_question_revision_batch(request,payload);
  IF receipt->>'approved'<>'true' OR receipt->>'approved_count'<>'2' OR receipt->>'applied'<>'false' THEN
    RAISE EXCEPTION 'Approval failed: %',receipt;
  END IF;
  SELECT count(*) INTO old_count FROM question_revision_events;
  result := approve_question_revision_batch(request,payload);
  IF result IS DISTINCT FROM receipt OR (SELECT count(*) FROM question_revision_events)<>old_count THEN
    RAISE EXCEPTION 'Retry was not idempotent.';
  END IF;
  refused := false;
  BEGIN PERFORM approve_question_revision_batch(request,payload->0 || '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Request reuse with different payload accepted.'; END IF;
  SELECT * INTO d FROM question_revision_drafts WHERE id=ids[1];
  PERFORM update_question_revision_draft(d.id,d.proposed_at,d.status,d.proposed_content,'Edited after approval');
  result := approve_question_revision_batch(gen_random_uuid(),payload);
  IF result->>'approved'<>'false' THEN RAISE EXCEPTION 'Stale edited draft approved.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM question_revision_events WHERE revision_id=d.id AND event_type='edited'
    AND before_record->>'status'='approved' AND after_record->>'status'='pending_review') THEN
    RAISE EXCEPTION 'Append-only edit history missing.';
  END IF;

  r2 := start_question_draft_audit(ARRAY[clinical,rationale,stale,flagged]);
  item := process_question_draft_audit(r2,clinical);
  IF item.report->>'classification'<>'Needs Clinical Review' THEN RAISE EXCEPTION 'Key change was not blocked.'; END IF;
  saved := process_question_draft_audit(r2,rationale);
  IF saved.report->>'classification'<>'Needs Clinical Review' THEN RAISE EXCEPTION 'Rationale change was not blocked.'; END IF;
  result := approve_question_revision_batch(gen_random_uuid(),jsonb_build_array(jsonb_build_object(
    'revision_id',item.revision_id,'audit_id',item.audit_id,'draft_version',item.draft_version,
    'base_fingerprint',item.base_fingerprint,'proposed_fingerprint',item.proposed_fingerprint)));
  IF result->>'approved'<>'false' THEN RAISE EXCEPTION 'Clinical draft batch approved.'; END IF;
  SELECT * INTO d FROM question_revision_drafts WHERE id=stale;
  PERFORM update_question_revision_draft(d.id,d.proposed_at,d.status,d.proposed_content,'Changed after run creation');
  item := process_question_draft_audit(r2,stale);
  IF item.status<>'failed' OR item.error NOT LIKE 'Draft changed%' THEN RAISE EXCEPTION 'Stale run not explicitly failed.'; END IF;
  item := process_question_draft_audit(r2,stale);
  IF item.status<>'failed' THEN RAISE EXCEPTION 'Stale retry silently succeeded.'; END IF;

  refused := false;
  BEGIN PERFORM start_question_draft_audit(ARRAY[ids[1],ids[1]]);
  EXCEPTION WHEN OTHERS THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Duplicate selection accepted.'; END IF;
  refused := false;
  BEGIN PERFORM start_question_draft_audit(ARRAY(SELECT gen_random_uuid() FROM generate_series(1,26)));
  EXCEPTION WHEN OTHERS THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Oversized batch accepted.'; END IF;
  refused := false;
  BEGIN UPDATE question_revision_events SET event_type='tampered';
  EXCEPTION WHEN insufficient_privilege THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'History mutation allowed.'; END IF;
  refused := false;
  BEGIN UPDATE question_draft_audit_items SET report='{"eligible":true}';
  EXCEPTION WHEN insufficient_privilege THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Browser could forge an eligibility report.'; END IF;
  refused := false;
  BEGIN UPDATE question_draft_audit_runs SET filters='{}';
  EXCEPTION WHEN insufficient_privilege THEN refused := true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Run provenance could be changed.'; END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  IF EXISTS(SELECT 1 FROM question_draft_audit_runs) OR EXISTS(SELECT 1 FROM question_revision_events)
    OR EXISTS(SELECT 1 FROM latest_question_draft_audits) THEN RAISE EXCEPTION 'Non-admin read leak.'; END IF;
  refused := false;
  BEGIN PERFORM start_question_draft_audit(ids); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Non-admin run accepted.'; END IF;
  refused := false;
  BEGIN PERFORM process_question_draft_audit(r,ids[1]); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Non-admin processing accepted.'; END IF;
  refused := false;
  BEGIN PERFORM approve_question_revision_batch(request,payload); EXCEPTION WHEN insufficient_privilege THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'Non-admin receipt retry accepted.'; END IF;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
END;
$$;
RESET ROLE;

INSERT INTO question_flags(question_id,status) VALUES('10000000-0000-0000-0000-000000000006','open');
DO $$
DECLARE r uuid; item question_draft_audit_items%ROWTYPE; payload jsonb; result jsonb;
BEGIN
  SELECT run_id INTO r FROM question_draft_audit_items WHERE revision_id='20000000-0000-0000-0000-000000000006';
  item := process_question_draft_audit(r,'20000000-0000-0000-0000-000000000006');
  IF item.report->>'eligible'<>'false' OR item.report->>'classification'<>'Needs Clinical Review' THEN
    RAISE EXCEPTION 'Flagged item not excluded.';
  END IF;
  UPDATE question_flags SET status='resolved';
  r := start_question_draft_audit(ARRAY['20000000-0000-0000-0000-000000000006'::uuid]);
  item := process_question_draft_audit(r,'20000000-0000-0000-0000-000000000006');
  INSERT INTO question_flags(question_id,status) VALUES(item.question_id,'open');
  payload := jsonb_build_array(jsonb_build_object('revision_id',item.revision_id,'audit_id',item.audit_id,
    'draft_version',item.draft_version,'base_fingerprint',item.base_fingerprint,'proposed_fingerprint',item.proposed_fingerprint));
  result := approve_question_revision_batch(gen_random_uuid(),payload);
  IF result->>'approved'<>'false' THEN RAISE EXCEPTION 'New unresolved flag did not block approval.'; END IF;
  UPDATE question_flags SET status='resolved';
  UPDATE questions SET stem='Other current content' WHERE id=item.question_id;
  result := approve_question_revision_batch(gen_random_uuid(),payload);
  IF result->>'approved'<>'false' THEN RAISE EXCEPTION 'Changed original approved.'; END IF;
  UPDATE questions SET stem='Synthetic  stem 6' WHERE id=item.question_id;
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM question_revision_events WHERE revision_id='20000000-0000-0000-0000-000000000100'
    AND event_type='baseline')<>1 OR (SELECT proposed_content->>'stem' FROM question_revision_drafts
      WHERE id='20000000-0000-0000-0000-000000000100')<>'Existing saved proposal' THEN
    RAISE EXCEPTION 'Existing draft baseline was lost, duplicated, or modified.';
  END IF;
  IF EXISTS(SELECT 1 FROM bank_snapshot b JOIN questions q USING(id) WHERE b.row IS DISTINCT FROM to_jsonb(q)) THEN
    RAISE EXCEPTION 'Audit or approval changed original questions.';
  END IF;
  IF EXISTS(SELECT 1 FROM draft_content_snapshot s JOIN question_revision_drafts d USING(id)
    WHERE s.base_content IS DISTINCT FROM d.base_content OR s.proposed_content IS DISTINCT FROM d.proposed_content) THEN
    RAISE EXCEPTION 'Saved original/proposed draft contents changed.';
  END IF;
  IF (SELECT jsonb_agg(row) FROM expected_attempts) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a)) FROM in_house_assessment_attempts a)
    OR (SELECT jsonb_agg(row) FROM expected_responses) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a)) FROM in_house_assessment_item_responses a) THEN
    RAISE EXCEPTION 'Student data changed.';
  END IF;
  IF has_function_privilege('anon','public.approve_question_revision_batch(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.start_question_draft_audit(uuid[],jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous RPC permission leaked.';
  END IF;
END;
$$;
SELECT 'draft audit: durable resume, exact versions, atomic approval, retry, permissions, flags and history passed' AS result;

-- Policy thresholds: measurements are signals, never confirmed clinical defects.
DO $$
DECLARE b jsonb; p jsonb; result jsonb;
BEGIN
  SELECT base_content INTO b FROM question_revision_drafts WHERE id='20000000-0000-0000-0000-000000000001';
  p := jsonb_set(b,'{stem}',to_jsonb(replace(b->>'stem','  ',' ')));
  result := inspect_question_revision(b,p);
  IF result->>'eligible'<>'true' THEN RAISE EXCEPTION 'Spacing allowlist regression: %',result; END IF;
  result := inspect_question_revision(b,jsonb_set(p,'{item_data}','{"correct":[1],"options":["a","b","c","d"]}'));
  IF result->>'classification'<>'Needs Clinical Review' THEN RAISE EXCEPTION 'Scoring change passed.'; END IF;
  b := jsonb_set(b,'{option_a}','"An intentionally much longer option that supplies many more words than any alternative distractor"');
  p := jsonb_set(b,'{stem}',to_jsonb(replace(b->>'stem','  ',' ')));
  result := inspect_question_revision(b,p);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'findings') f WHERE f->>'code'='answer_length'
    AND f->>'evidence'='screening_signal') OR result->>'eligible'<>'false' THEN RAISE EXCEPTION 'Length signal threshold failed.'; END IF;
  b := jsonb_set(b,'{option_rationales}','{"A":"Wrong mapping","b":"b","c":"c","d":"d"}');
  result := inspect_question_revision(b,jsonb_set(b,'{stem}',to_jsonb(replace(b->>'stem','  ',' '))));
  IF result->>'classification'<>'Major Corrections' THEN RAISE EXCEPTION 'Invalid rationale mapping passed.'; END IF;
END;
$$;

-- A failure during the second update must roll back the first approval too.
INSERT INTO questions(id,question_no,stem,option_a,option_b,option_c,option_d,correct_answer,rationale,difficulty,item_type,option_rationales)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,n,'Late  failure '||n,
  'Choice alpha','Choice bravo','Choice delta','Choice gamma','a','Synthetic rationale','medium','mcq',
  '{"a":"a","b":"b","c":"c","d":"d"}' FROM generate_series(7,10) n;
INSERT INTO question_revision_drafts(id,question_id,base_content,proposed_content,change_summary,proposed_by)
SELECT ('20000000-0000-0000-0000-'||lpad(question_no::text,12,'0'))::uuid,id,
  jsonb_build_object('stem',stem,'option_a',option_a,'option_b',option_b,'option_c',option_c,'option_d',option_d,
    'correct_answer',correct_answer,'rationale',rationale,'difficulty',difficulty,'item_type',item_type,'option_rationales',option_rationales),
  jsonb_build_object('stem',replace(stem,'  ',' '),'option_a',option_a,'option_b',option_b,'option_c',option_c,'option_d',option_d,
    'correct_answer',correct_answer,'rationale',rationale,'difficulty',difficulty,'item_type',item_type,'option_rationales',option_rationales),
  'Synthetic late failure','00000000-0000-0000-0000-000000000001'
FROM questions WHERE question_no BETWEEN 7 AND 10;
CREATE FUNCTION reject_second_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id='20000000-0000-0000-0000-000000000008' AND NEW.status='approved' THEN
    RAISE EXCEPTION 'Injected second-update failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER synthetic_late_failure BEFORE UPDATE ON question_revision_drafts
  FOR EACH ROW EXECUTE FUNCTION reject_second_approval();
DO $$
DECLARE r uuid; payload jsonb; refused boolean:=false;
BEGIN
  r:=start_question_draft_audit(ARRAY['20000000-0000-0000-0000-000000000007'::uuid,'20000000-0000-0000-0000-000000000008'::uuid]);
  PERFORM process_question_draft_audit(r,revision_id) FROM question_draft_audit_items WHERE run_id=r;
  SELECT jsonb_agg(jsonb_build_object('revision_id',revision_id,'audit_id',audit_id,'draft_version',draft_version,
    'base_fingerprint',base_fingerprint,'proposed_fingerprint',proposed_fingerprint) ORDER BY revision_id)
    INTO payload FROM question_draft_audit_items WHERE run_id=r;
  BEGIN PERFORM approve_question_revision_batch(gen_random_uuid(),payload);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Injected second-update failure%' THEN RAISE; END IF;
    refused:=true;
  END;
  IF NOT refused OR EXISTS(SELECT 1 FROM question_revision_drafts WHERE id IN (
    '20000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000008') AND status<>'pending_review') THEN
    RAISE EXCEPTION 'Late failure left partial approvals.';
  END IF;
END;
$$;
DROP TRIGGER synthetic_late_failure ON question_revision_drafts;
DROP FUNCTION reject_second_approval();

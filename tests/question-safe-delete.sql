-- Synthetic test for supabase-question-safe-delete.sql.
-- Run only through tests/question-safe-delete-local.sh, which creates a throwaway local
-- Postgres cluster, installs tests/question-safe-delete-local-schema.sql, then the migration.
\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF current_setting('app.question_delete_local_test', true) IS DISTINCT FROM 'local-only' THEN
    RAISE EXCEPTION 'This test may only run in the explicitly marked local test database.';
  END IF;
END;
$guard$;

-- Synthetic seed data (superuser).
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000a001'), ('00000000-0000-0000-0000-00000000b001');
INSERT INTO public.app_admins VALUES ('00000000-0000-0000-0000-00000000a001');
INSERT INTO public.students(id) VALUES ('00000000-0000-0000-0000-00000000c001');

INSERT INTO public.questions(id, question_no, stem, active, source_key) VALUES
  ('10000000-0000-0000-0000-000000000001', 9001, 'Unused, with drafts and audits', false, null),
  ('10000000-0000-0000-0000-000000000002', 9002, 'In student practice answers', true, null),
  ('10000000-0000-0000-0000-000000000003', 9003, 'Only in missed question list', false, null),
  ('10000000-0000-0000-0000-000000000004', 9004, 'Answered in in-house assessment', false, 'synthetic-key-4'),
  ('10000000-0000-0000-0000-000000000005', 9005, 'In paused assessment checkpoint', false, null),
  ('10000000-0000-0000-0000-000000000006', 9006, 'Assigned through practice set', false, null),
  ('10000000-0000-0000-0000-000000000007', 9007, 'Flagged by a student', false, null),
  ('10000000-0000-0000-0000-000000000008', 9008, 'In module quiz results', false, null),
  ('10000000-0000-0000-0000-000000000009', 9009, 'In module results', false, null),
  ('10000000-0000-0000-0000-000000000010', 9010, 'In diagnostic results', false, null),
  ('10000000-0000-0000-0000-000000000011', 9011, 'In exam report', false, null),
  ('10000000-0000-0000-0000-000000000012', 9012, 'Unused, no other records', false, null),
  ('10000000-0000-0000-0000-000000000013', 9013, 'Unused, batch partner', false, null),
  ('10000000-0000-0000-0000-000000000014', 9014, 'Unused, imported with tracking + admin flag', false, 'qbank-bulk-synthetic'),
  ('10000000-0000-0000-0000-000000000015', 9015, 'NGN item answered in CAT', false, 'qbank-bulk-ngn'),
  ('10000000-0000-0000-0000-000000000016', 9016, 'In weekly assignment', false, null),
  ('10000000-0000-0000-0000-000000000017', 9017, 'Only in assignment change history', false, null),
  ('10000000-0000-0000-0000-000000000018', 9018, 'Active (published) but never used', true, null),
  ('10000000-0000-0000-0000-000000000019', 9019, 'Current item of an in-progress CAT exam', false, 'qbank-bulk-ngn-current');

INSERT INTO public.question_revision_drafts(id, question_id, status, proposed_by) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'applied', '00000000-0000-0000-0000-00000000a001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'pending_review', '00000000-0000-0000-0000-00000000a001'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'pending_review', '00000000-0000-0000-0000-00000000a001');
INSERT INTO public.question_audits(question_id, revision_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002');

INSERT INTO public.student_supplemental_practice_results(student_id, answer_details, missed_question_ids) VALUES
  ('00000000-0000-0000-0000-00000000c001',
   '[{"question_id":"10000000-0000-0000-0000-000000000002","correct":true}]', '{}'),
  ('00000000-0000-0000-0000-00000000c001', '[]', '{10000000-0000-0000-0000-000000000003}');
INSERT INTO public.in_house_assessment_attempts(id, student_id, status, checkpoint) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000c001', 'completed', null),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000c001', 'paused',
   '{"queue":["10000000-0000-0000-0000-000000000005"]}');
INSERT INTO public.in_house_assessment_attempts(id, student_id, status, checkpoint) VALUES
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000c001', 'in_progress',
   '{"scoringModel":"ngn-cat-v1","currentItemId":"qbank:10000000-0000-0000-0000-000000000019","ngnState":{"current":{"key":{"item_id":"qbank:10000000-0000-0000-0000-000000000019"},"stage":1}}}');
INSERT INTO public.in_house_assessment_item_responses(attempt_id, item_id, item_source) VALUES
  ('30000000-0000-0000-0000-000000000001', 'synthetic-key-4', 'synthetic');
INSERT INTO public.in_house_assessment_item_responses(attempt_id, item_id, item_source) VALUES
  ('30000000-0000-0000-0000-000000000001', 'qbank:10000000-0000-0000-0000-000000000015:2', 'reviewed-question-bank');
INSERT INTO public.student_resources(student_id, url, assignment_details) VALUES
  ('00000000-0000-0000-0000-00000000c001', 'supplemental-practice.html',
   '{"platform":"Portal Question Bank","question_ids":["10000000-0000-0000-0000-000000000016"]}');
INSERT INTO public.student_assignment_revisions(student_id, previous, updated) VALUES
  ('00000000-0000-0000-0000-00000000c001', '{"question_ids":["10000000-0000-0000-0000-000000000017"]}', '{"question_ids":[]}');
INSERT INTO public.question_set_items VALUES ('synthetic-set', 'l1', 1, '10000000-0000-0000-0000-000000000006');
INSERT INTO public.question_flags(question_id, student_id, question_stem) VALUES
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-00000000c001', 'Flagged by a student'),
  ('10000000-0000-0000-0000-000000000014', null, 'Admin note');
INSERT INTO public.question_import_reviews VALUES ('qbank-bulk-synthetic', 'draft', '10000000-0000-0000-0000-000000000014');
INSERT INTO public.quiz_results(answers) VALUES ('[{"id":"10000000-0000-0000-0000-000000000008"}]');
INSERT INTO public.module_results(student_id, answers) VALUES ('00000000-0000-0000-0000-00000000c001', '{"10000000-0000-0000-0000-000000000009":"b"}');
INSERT INTO public.consult_diagnostic_results(item_results) VALUES ('[{"question_id":"10000000-0000-0000-0000-000000000010"}]');
INSERT INTO public.exam_reports(student_id, analysis) VALUES ('00000000-0000-0000-0000-00000000c001', '{"items":["10000000-0000-0000-0000-000000000011"]}');

CREATE TEMP TABLE student_snapshot AS
SELECT 'practice' t, md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) h FROM public.student_supplemental_practice_results x
UNION ALL SELECT 'attempts', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.in_house_assessment_attempts x
UNION ALL SELECT 'responses', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.in_house_assessment_item_responses x
UNION ALL SELECT 'sets', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.legacy_id)) FROM public.question_set_items x
UNION ALL SELECT 'student_flags', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.question_flags x WHERE student_id IS NOT NULL
UNION ALL SELECT 'quiz', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id)) FROM public.quiz_results x
UNION ALL SELECT 'module', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.module_results x
UNION ALL SELECT 'diagnostic', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.consult_diagnostic_results x
UNION ALL SELECT 'exam', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.exam_reports x
UNION ALL SELECT 'resources', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.student_resources x
UNION ALL SELECT 'assignment_history', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.student_assignment_revisions x;
GRANT SELECT ON student_snapshot TO authenticated;

-- Everything below runs as a signed-in admin through RLS and granted functions only.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
SET ROLE authenticated;

DO $$
DECLARE
  q uuid[] := ARRAY(SELECT ('10000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid FROM generate_series(1, 19) n);
  v_blocked text[];
  v_reason text;
  v_message text;
  v_hint text;
  v_count integer;
  v_archive record;
BEGIN
  -- 1. Blocker report: exact reasons for each protected question.
  SELECT array_agg(DISTINCT right(question_id::text, 2) || ':' || reason ORDER BY right(question_id::text, 2) || ':' || reason)
  INTO v_blocked FROM public.question_deletion_blockers(q) WHERE blocks_delete;
  IF v_blocked IS DISTINCT FROM ARRAY['02:active_question','02:student_practice_results','03:student_practice_results','04:assessment_responses',
    '05:assessment_attempts','06:practice_sets','07:student_flags','08:quiz_results','09:module_results',
    '10:diagnostic_results','11:exam_reports','15:assessment_responses','16:weekly_assignments','17:assignment_history','18:active_question','19:assessment_attempts'] THEN
    RAISE EXCEPTION 'Unexpected blockers: %', v_blocked;
  END IF;
  SELECT string_agg(reason || '=' || record_count, ',' ORDER BY reason) INTO v_reason
  FROM public.question_deletion_blockers(ARRAY['10000000-0000-0000-0000-000000000001'::uuid]);
  IF v_reason IS DISTINCT FROM 'audits=1,revision_drafts=2' THEN
    RAISE EXCEPTION 'Drafts/audits should be reported as non-blocking: %', v_reason;
  END IF;
  RAISE NOTICE 'PASS 1: blocker report lists each protected reason; drafts/audits are non-blocking';

  -- 2. Each protected question is refused with a specific message and no records change.
  FOR i IN 2..19 LOOP
    CONTINUE WHEN i BETWEEN 12 AND 14 OR i = 18;
    BEGIN
      PERFORM public.delete_questions_permanently(ARRAY[q[i]]);
      RAISE EXCEPTION 'Protected question % was deleted', i;
    EXCEPTION WHEN foreign_key_violation THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
      IF v_message NOT LIKE '%cannot be permanently deleted:%#90' || lpad(i::text, 2, '0') || ':%' OR v_message LIKE '%answers saved%' OR v_hint NOT LIKE '%Make inactive%' THEN
        RAISE EXCEPTION 'Unclear message for question %: % / %', i, v_message, v_hint;
      END IF;
      IF i = 6 AND v_message NOT LIKE '%assigned practice-set entry%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 4 AND v_message NOT LIKE '%in-house or CAT assessment answer%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 15 AND v_message NOT LIKE '%in-house or CAT assessment answer%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 16 AND v_message NOT LIKE '%1 student assignment%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 17 AND v_message NOT LIKE '%student assignment change record%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 2 AND v_message NOT LIKE '%#9002: still active (visible to students); make it inactive first; 1 student practice result%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 19 AND v_message NOT LIKE '%saved, paused, or completed assessment attempt%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
      IF i = 5 AND v_message NOT LIKE '%saved, paused, or completed assessment attempt%' THEN RAISE EXCEPTION 'Wrong reason: %', v_message; END IF;
    END;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.questions WHERE id = ANY(q[2:11] || q[15:17] || q[19:19]);
  IF v_count <> 14 THEN RAISE EXCEPTION 'Protected questions missing: %', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.question_revision_drafts WHERE question_id = q[2];
  IF v_count <> 1 THEN RAISE EXCEPTION 'Draft for protected question was removed'; END IF;
  RAISE NOTICE 'PASS 2: student/assessment/CAT/assignment/flag-linked questions are refused with specific reasons';

  -- 2b. Active questions cannot be permanently deleted, even when unused (RPC and direct delete).
  BEGIN
    PERFORM public.delete_questions_permanently(ARRAY[q[18]]);
    RAISE EXCEPTION 'Active question was deleted';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE '%#9018: still active (visible to students); make it inactive first' THEN RAISE EXCEPTION 'Active message: %', v_message; END IF;
  END;
  BEGIN
    DELETE FROM public.questions WHERE id = q[18];
    RAISE EXCEPTION 'Active question was deleted directly';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- Published between the eligibility review and the delete: the delete re-checks and refuses.
  UPDATE public.questions SET active = true WHERE id = q[13];
  BEGIN
    PERFORM public.delete_questions_permanently(ARRAY[q[13]]);
    RAISE EXCEPTION 'Question published after review was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  UPDATE public.questions SET active = false WHERE id = q[13];
  UPDATE public.questions SET active = false WHERE id = q[18];
  RAISE NOTICE 'PASS 2b: active questions are refused until made inactive; publishing after review is caught';

  -- 3. A mixed batch is all-or-nothing.
  BEGIN
    PERFORM public.delete_questions_permanently(ARRAY[q[13], q[2]]);
    RAISE EXCEPTION 'Mixed batch was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE 'No questions were deleted%' OR v_message LIKE '%#9013%' THEN
      RAISE EXCEPTION 'Mixed batch message: %', v_message;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = q[13]) THEN RAISE EXCEPTION 'Partner deleted in refused batch'; END IF;
  RAISE NOTICE 'PASS 3: a batch containing a protected question deletes nothing';

  -- 4. Direct table deletes are also protected (trigger), and practice-set cascade cannot occur.
  BEGIN
    DELETE FROM public.questions WHERE id = q[6];
    RAISE EXCEPTION 'Direct delete of assigned question succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT LIKE 'Question #9006 cannot be permanently deleted: 1 assigned practice-set entry%' THEN
      RAISE EXCEPTION 'Direct delete message: %', v_message;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.question_set_items WHERE question_id = q[6]) THEN RAISE EXCEPTION 'Practice set cascaded'; END IF;
  RAISE NOTICE 'PASS 4: direct deletes are blocked by the database too; no practice-set cascade';

  -- 5. Unused question with saved drafts + audit: archived, then removed with the question.
  v_count := public.delete_questions_permanently(ARRAY[q[1], q[12], q[13], q[14], q[18], q[1]]);
  IF v_count <> 5 THEN RAISE EXCEPTION 'Expected 5 deletions, got %', v_count; END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE id = ANY(ARRAY[q[1], q[12], q[13], q[14], q[18]])) THEN RAISE EXCEPTION 'Unused question remains'; END IF;
  IF EXISTS (SELECT 1 FROM public.question_revision_drafts WHERE question_id = q[1]) THEN RAISE EXCEPTION 'Draft remains'; END IF;
  IF EXISTS (SELECT 1 FROM public.question_audits WHERE question_id = q[1]) THEN RAISE EXCEPTION 'Audit remains'; END IF;
  SELECT * INTO STRICT v_archive FROM public.question_deletion_archive WHERE question_id = q[1];
  IF jsonb_array_length(v_archive.revision_drafts) <> 2 OR jsonb_array_length(v_archive.audits) <> 1
    OR v_archive.question_snapshot->>'stem' <> 'Unused, with drafts and audits' OR v_archive.question_no <> 9001
    OR v_archive.deleted_by <> '00000000-0000-0000-0000-00000000a001' THEN
    RAISE EXCEPTION 'Archive incomplete: %', to_jsonb(v_archive);
  END IF;
  SELECT count(*) INTO v_count FROM public.question_deletion_archive;
  IF v_count <> 5 THEN RAISE EXCEPTION 'Expected 5 archive rows, got %', v_count; END IF;
  SELECT * INTO STRICT v_archive FROM public.question_deletion_archive WHERE question_id = q[14];
  IF jsonb_array_length(v_archive.question_flags) <> 1 OR v_archive.import_reviews->0->>'source_key' <> 'qbank-bulk-synthetic'
    OR v_archive.question_snapshot->>'source_key' <> 'qbank-bulk-synthetic' THEN
    RAISE EXCEPTION 'Flag/import metadata not archived: %', to_jsonb(v_archive);
  END IF;
  RAISE NOTICE 'PASS 5: unused inactive questions deleted (incl. one just made inactive); drafts and audits archived then removed; duplicates ignored';

  -- 6. Protected question still has its draft and all student history is byte-for-byte unchanged.
  IF (SELECT count(*) FROM public.question_revision_drafts WHERE question_id = q[2]) <> 1 THEN RAISE EXCEPTION 'Protected draft changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM student_snapshot s JOIN (
      SELECT 'practice' t, md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) h FROM public.student_supplemental_practice_results x
      UNION ALL SELECT 'attempts', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.in_house_assessment_attempts x
      UNION ALL SELECT 'responses', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.in_house_assessment_item_responses x
      UNION ALL SELECT 'sets', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.legacy_id)) FROM public.question_set_items x
      UNION ALL SELECT 'student_flags', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.question_flags x WHERE student_id IS NOT NULL
      UNION ALL SELECT 'quiz', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id)) FROM public.quiz_results x
      UNION ALL SELECT 'module', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.module_results x
      UNION ALL SELECT 'diagnostic', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.consult_diagnostic_results x
      UNION ALL SELECT 'exam', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.exam_reports x
      UNION ALL SELECT 'resources', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.student_resources x
      UNION ALL SELECT 'assignment_history', md5(string_agg(to_jsonb(x)::text, ',' ORDER BY x.id::text)) FROM public.student_assignment_revisions x
    ) a USING (t) WHERE s.h IS DISTINCT FROM a.h) THEN
    RAISE EXCEPTION 'Student history changed';
  END IF;
  RAISE NOTICE 'PASS 6: all student history and assessment records unchanged';
END;
$$;

-- 7. Non-admins cannot inspect or delete, and cannot call the internal helpers.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b001', false);
SET ROLE authenticated;
DO $$
DECLARE refused integer := 0;
BEGIN
  BEGIN PERFORM public.delete_questions_permanently(ARRAY['10000000-0000-0000-0000-000000000002'::uuid]);
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  BEGIN PERFORM * FROM public.question_deletion_blockers(ARRAY['10000000-0000-0000-0000-000000000002'::uuid]);
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  BEGIN PERFORM * FROM public.question_usage_details(ARRAY['10000000-0000-0000-0000-000000000002'::uuid]);
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  BEGIN PERFORM * FROM public.question_deletion_archive;
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  IF refused < 3 THEN RAISE EXCEPTION 'Non-admin access was not refused (% refusals)', refused; END IF;
  IF EXISTS (SELECT 1 FROM public.question_deletion_archive) THEN RAISE EXCEPTION 'Non-admin can read archive'; END IF;
  RAISE NOTICE 'PASS 7: non-admins cannot inspect, delete, or read the archive';
END;
$$;

-- 8. Archive is read-only even for admins (no insert/update/delete through the API role).
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
SET ROLE authenticated;
DO $$
DECLARE refused integer := 0;
BEGIN
  IF (SELECT count(*) FROM public.question_deletion_archive) <> 5 THEN RAISE EXCEPTION 'Admin cannot read archive'; END IF;
  BEGIN UPDATE public.question_deletion_archive SET question_no = 1;
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  BEGIN DELETE FROM public.question_deletion_archive;
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  BEGIN INSERT INTO public.question_deletion_archive(question_id, question_snapshot) VALUES (gen_random_uuid(), '{}');
  EXCEPTION WHEN insufficient_privilege THEN refused := refused + 1; END;
  IF refused <> 3 THEN RAISE EXCEPTION 'Archive was writable by an admin (% refusals)', refused; END IF;
  RAISE NOTICE 'PASS 8: archive is readable by admins and cannot be altered or removed';
END;
$$;

-- 9. Fails closed if a protected table is missing.
RESET ROLE;
ALTER TABLE public.student_resources RENAME TO student_resources_hidden;
SET ROLE authenticated;
DO $$
DECLARE v_message text;
BEGIN
  PERFORM public.delete_questions_permanently(ARRAY['10000000-0000-0000-0000-000000000016'::uuid]);
  RAISE EXCEPTION 'Deletion proceeded without the assignment check';
EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
  IF v_message NOT LIKE '%safety check is unavailable because table student_resources is missing%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS 9: deletion fails closed when a protected table is missing';
END;
$$;
RESET ROLE;
ALTER TABLE public.student_resources_hidden RENAME TO student_resources;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = '10000000-0000-0000-0000-000000000016') THEN
    RAISE EXCEPTION 'Question deleted during fail-closed check';
  END IF;
END $$;

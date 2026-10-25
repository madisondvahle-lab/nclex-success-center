#!/usr/bin/env bash
# Disposable Docker PostgreSQL with synthetic records only. Never connects to Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=question-draft-audit-test-$$
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=draft_audit_test postgres:17-alpine >/dev/null
for i in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -d draft_audit_test >/dev/null 2>&1; then break; fi
  sleep 1
done
psqlx() { docker exec -i "$NAME" psql -U postgres -d draft_audit_test -X -v ON_ERROR_STOP=1 "$@"; }
run() { psqlx -q < "$1"; }
psqlx -q -c "ALTER DATABASE draft_audit_test SET app.question_draft_audit_local_test = 'local-only'"
run tests/question-draft-audit-local-schema.sql
run supabase-questions.sql
psqlx -q -c "ALTER TABLE questions ADD COLUMN question_no bigint"
run supabase-question-bank-review.sql
run supabase-question-item-types.sql
run supabase-question-bulk-import.sql
run supabase-question-revision-edit.sql
run supabase-question-audit.sql
run supabase-question-flags.sql
psqlx -q <<'SQL'
INSERT INTO questions(id,question_no,stem) VALUES('10000000-0000-0000-0000-000000000100',100,'Existing untouched draft original');
INSERT INTO question_revision_drafts(id,question_id,base_content,proposed_content,change_summary,proposed_by)
VALUES('20000000-0000-0000-0000-000000000100','10000000-0000-0000-0000-000000000100',
  '{"stem":"Existing untouched draft original"}','{"stem":"Existing saved proposal"}','Existing saved draft',
  '00000000-0000-0000-0000-000000000001');
SQL
run supabase-question-draft-audit.sql
run supabase-question-draft-audit.sql
run tests/question-draft-audit.sql
psqlx -q <<'SQL'
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
CREATE TABLE synthetic_approval_requests(run_id uuid,request_id uuid,payload jsonb);
CREATE TABLE synthetic_receipt_results(receipt jsonb);
INSERT INTO synthetic_approval_requests(run_id,request_id)
SELECT start_question_draft_audit(ARRAY['20000000-0000-0000-0000-000000000009'::uuid,
  '20000000-0000-0000-0000-000000000010'::uuid]),gen_random_uuid();
SQL
# Concurrent calls for the same item must create exactly one audit record.
psqlx -q -c "SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; BEGIN; SELECT process_question_draft_audit((SELECT run_id FROM synthetic_approval_requests),'20000000-0000-0000-0000-000000000009'); SELECT pg_sleep(0.5); COMMIT;" >/dev/null &
FIRST=$!
psqlx -q -c "SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; SELECT process_question_draft_audit((SELECT run_id FROM synthetic_approval_requests),'20000000-0000-0000-0000-000000000009');" >/dev/null &
SECOND=$!
wait "$FIRST"
wait "$SECOND"
psqlx -q <<'SQL'
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT process_question_draft_audit((SELECT run_id FROM synthetic_approval_requests),'20000000-0000-0000-0000-000000000010');
UPDATE synthetic_approval_requests SET payload=(SELECT jsonb_agg(jsonb_build_object(
  'revision_id',revision_id,'audit_id',audit_id,'draft_version',draft_version,
  'base_fingerprint',base_fingerprint,'proposed_fingerprint',proposed_fingerprint) ORDER BY revision_id)
  FROM question_draft_audit_items WHERE run_id=synthetic_approval_requests.run_id);
DO $$ BEGIN
  IF (SELECT count(*) FROM question_audits WHERE revision_id='20000000-0000-0000-0000-000000000009')<>1 THEN
    RAISE EXCEPTION 'Concurrent processing repeated completed work.';
  END IF;
END $$;
SQL
# Concurrent retries share one transaction-protected request and one receipt.
psqlx -q -c "SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; BEGIN; INSERT INTO synthetic_receipt_results SELECT approve_question_revision_batch(request_id,payload) FROM synthetic_approval_requests; SELECT pg_sleep(0.5); COMMIT;" >/dev/null &
FIRST=$!
psqlx -q -c "SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; INSERT INTO synthetic_receipt_results SELECT approve_question_revision_batch(request_id,payload) FROM synthetic_approval_requests;" >/dev/null &
SECOND=$!
wait "$FIRST"
wait "$SECOND"
psqlx -q <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM synthetic_receipt_results)<>2
    OR (SELECT count(DISTINCT receipt::text) FROM synthetic_receipt_results)<>1
    OR EXISTS(SELECT 1 FROM synthetic_receipt_results WHERE receipt->>'approved'<>'true')
    OR (SELECT count(*) FROM question_revision_events WHERE request_id=(SELECT request_id FROM synthetic_approval_requests))<>1 THEN
    RAISE EXCEPTION 'Concurrent approval retry was not idempotent.';
  END IF;
END $$;
SELECT 'Concurrent audit processing and atomic approval retries passed' AS result;
SQL
echo "Phase 1 synthetic PostgreSQL checks passed; disposable container will be removed."

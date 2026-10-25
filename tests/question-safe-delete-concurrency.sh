#!/usr/bin/env bash
# Concurrency checks for supabase-question-safe-delete.sql. Run only from
# tests/question-safe-delete-local.sh (throwaway local database, synthetic data).
# Uses psqlx/pgbenchx exported by the runner.
set -euo pipefail
ADMIN="SET request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001'; SET ROLE authenticated;"
STUDENT=00000000-0000-0000-0000-00000000c001
q() { printf '40000000-0000-0000-0000-%012d' "$1"; }
sql() { psqlx -qtAX -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
admin_delete() { sql 2>&1 <<<"$ADMIN SELECT public.delete_questions_permanently(ARRAY['$1']::uuid[]);" || true; }
exists() { sql -c "SELECT count(*) FROM public.questions WHERE id = '$1'"; }
fail() { echo "CONCURRENCY FAIL: $*"; exit 1; }

[[ "$(sql -c "SELECT current_setting('app.question_delete_local_test', true)")" == local-only ]] || fail "not the marked local test database"
sql <<SQL
INSERT INTO public.questions(id, question_no, stem, active)
SELECT ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 50000 + n, 'Concurrency synthetic ' || n, false
FROM generate_series(1, 60) n;
INSERT INTO public.question_revision_drafts(question_id, proposed_by)
SELECT ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000a001'
FROM generate_series(1, 60) n;
INSERT INTO public.in_house_assessment_attempts(id, student_id, status, checkpoint)
SELECT ('41000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '$STUDENT', 'in_progress', '{"currentItemId":"legacy-1"}'
FROM generate_series(0, 8) n;
SQL

# A. A practice result referencing the question is being saved when the delete starts:
#    the delete waits for it, sees it, and refuses. The student save succeeds.
sql <<SQL &
BEGIN;
INSERT INTO public.student_supplemental_practice_results(student_id, answer_details)
VALUES ('$STUDENT', '[{"question_id":"$(q 1)","correct":false}]');
SELECT pg_sleep(1);
COMMIT;
SQL
student=$!; sleep 0.3
out=$(admin_delete "$(q 1)")
wait "$student" || fail "A: student save failed"
[[ "$out" == *"student practice result"* && "$(exists "$(q 1)")" == 1 ]] || fail "A: $out"
echo "PASS A: in-flight practice save is seen; delete refused; student save succeeded"

# B. A CAT exam checkpoint moving to this item (qbank:<id>:<part>) is being saved when the delete starts.
sql <<SQL &
BEGIN;
UPDATE public.in_house_assessment_attempts
SET checkpoint = '{"currentItemId":"qbank:$(q 2)","ngnState":{"current":{"key":{"item_id":"qbank:$(q 2)"}}}}'
WHERE id = '41000000-0000-0000-0000-000000000000';
SELECT pg_sleep(1);
COMMIT;
SQL
student=$!; sleep 0.3
out=$(admin_delete "$(q 2)")
wait "$student" || fail "B: CAT checkpoint save failed"
[[ "$out" == *"assessment attempt"* && "$(exists "$(q 2)")" == 1 ]] || fail "B: $out"
echo "PASS B: in-flight CAT checkpoint (qbank: id) is seen; delete refused; CAT save succeeded"

# C. A CAT answer (child item id) is being saved when the delete starts.
sql <<SQL &
BEGIN;
INSERT INTO public.in_house_assessment_item_responses(attempt_id, item_id, item_source)
VALUES ('41000000-0000-0000-0000-000000000000', 'qbank:$(q 3):2', 'reviewed-question-bank');
SELECT pg_sleep(1);
COMMIT;
SQL
student=$!; sleep 0.3
out=$(admin_delete "$(q 3)")
wait "$student" || fail "C: CAT answer save failed"
[[ "$out" == *"CAT assessment answer"* && "$(exists "$(q 3)")" == 1 ]] || fail "C: $out"
echo "PASS C: in-flight CAT answer is seen; delete refused; answer saved"

# D. A long student save (3 s) is in progress: the delete gives up after ~2 s with a clear
#    message, deletes nothing, and the student save is unaffected. A retry then succeeds.
sql <<SQL &
BEGIN;
INSERT INTO public.student_supplemental_practice_results(student_id, answer_details) VALUES ('$STUDENT', '[]');
SELECT pg_sleep(3);
COMMIT;
SQL
student=$!; sleep 0.3
out=$(admin_delete "$(q 4)")
[[ "$out" == *"students are saving work right now"* && "$(exists "$(q 4)")" == 1 ]] || fail "D: $out"
wait "$student" || fail "D: student save failed"
out=$(admin_delete "$(q 4)")
[[ "$out" == 1 && "$(exists "$(q 4)")" == 0 ]] || fail "D retry: $out"
echo "PASS D: busy delete backs off with a clear message; student save unaffected; retry succeeds"

# E. While a delete holds its locks, student reads are not blocked and student saves
#    wait (not fail) and then succeed.
sql <<SQL >/dev/null &
$ADMIN
BEGIN;
SELECT public.delete_questions_permanently(ARRAY['$(q 5)']::uuid[]);
SELECT pg_sleep(1.5);
COMMIT;
SQL
admin=$!; sleep 0.4
out=$(sql 2>&1 <<SQL
DO \$\$ DECLARE t timestamptz := clock_timestamp(); n int; BEGIN
  SELECT count(*) INTO n FROM public.in_house_assessment_attempts;
  SELECT count(*) INTO n FROM public.student_supplemental_practice_results;
  RAISE NOTICE 'read_ms=%', round(extract(epoch FROM clock_timestamp() - t) * 1000);
  t := clock_timestamp();
  UPDATE public.in_house_assessment_attempts SET checkpoint = '{"currentItemId":"legacy-2"}' WHERE id = '41000000-0000-0000-0000-000000000001';
  INSERT INTO public.in_house_assessment_item_responses(attempt_id, item_id, item_source)
  VALUES ('41000000-0000-0000-0000-000000000001', 'legacy-2', 'synthetic');
  RAISE NOTICE 'write_ms=%', round(extract(epoch FROM clock_timestamp() - t) * 1000);
END \$\$;
SQL
)
wait "$admin" || fail "E: admin delete failed"
read_ms=$(sed -n 's/.*read_ms=\([0-9]*\).*/\1/p' <<<"$out"); write_ms=$(sed -n 's/.*write_ms=\([0-9]*\).*/\1/p' <<<"$out")
[[ -n "$read_ms" && -n "$write_ms" ]] || fail "E: no timings: $out"
(( read_ms < 100 && write_ms >= 500 && write_ms < 3000 )) || fail "E: read ${read_ms} ms, write ${write_ms} ms"
sql -c "SELECT 1/(count(*)::int) FROM public.in_house_assessment_item_responses WHERE item_id = 'legacy-2'" >/dev/null || fail "E: student answer missing"
[[ "$(exists "$(q 5)")" == 0 ]] || fail "E: question not deleted"
echo "PASS E: during a deliberately held delete (1.5 s), student reads took ${read_ms} ms; the CAT save waited ${write_ms} ms, then succeeded"

# F. Repeatable-read transactions are refused (their snapshot could miss new student saves).
out=$(sql 2>&1 <<SQL || true
$ADMIN
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT public.delete_questions_permanently(ARRAY['$(q 6)']::uuid[]);
COMMIT;
SQL
)
[[ "$out" == *"read committed"* && "$(exists "$(q 6)")" == 1 ]] || fail "F: $out"
echo "PASS F: deletes outside read committed are refused"

# G. Load test: 8 simulated students continuously save CAT answers, checkpoints, and practice
#    results for 12 s while an admin deletes 40 unused questions one by one. No student
#    transaction may fail.
cat > "$WORK/student.sql" <<SQL
\set n random(1, 1000000000)
BEGIN;
UPDATE public.in_house_assessment_attempts SET checkpoint = jsonb_build_object('currentItemId', 'legacy-' || :n)
  WHERE id = ('41000000-0000-0000-0000-' || lpad(:client_id::text, 12, '0'))::uuid;
INSERT INTO public.in_house_assessment_item_responses(attempt_id, item_id, item_source)
  VALUES (('41000000-0000-0000-0000-' || lpad(:client_id::text, 12, '0'))::uuid, 'legacy-' || :n, 'load');
INSERT INTO public.student_supplemental_practice_results(student_id, answer_details)
  VALUES ('$STUDENT', jsonb_build_array(jsonb_build_object('question_id', 'legacy-' || :n)));
END;
SQL
bench() { pgbenchx "$WORK/student.sql" -c 8 -j 4 -T "$1" 2>&1; }
ok_bench() { grep -q "number of failed transactions: 0 (" <<<"$1" && ! grep -q "aborted" <<<"$1"; }
summary() { awk '/latency average/{a=$4} /^tps/{t=$3} /number of transactions actually processed/{n=$NF} END{printf "%s transactions, avg %s ms", n, a}' <<<"$1"; }
max_ms() { sed -n 's/^MAX_LATENCY_MS=//p' <<<"$1"; }
base=$(bench 6)
ok_bench "$base" || fail "G baseline: $base"
bench 12 > "$WORK/load.out" & load=$!
sleep 1
deleted=0 busy=0 ms_total=0 ms_max=0
for n in $(seq 11 50); do
  out=$(sql 2>&1 <<SQL || true
$ADMIN
DO \$\$ DECLARE t timestamptz := clock_timestamp(); BEGIN
  PERFORM public.delete_questions_permanently(ARRAY['$(q "$n")']::uuid[]);
  RAISE NOTICE 'ms=%', round(extract(epoch FROM clock_timestamp() - t) * 1000);
END \$\$;
SQL
)
  if [[ "$out" == *"ms="* ]]; then
    deleted=$((deleted + 1)); ms=$(sed -n 's/.*ms=\([0-9]*\).*/\1/p' <<<"$out"); ms_total=$((ms_total + ms)); ((ms > ms_max)) && ms_max=$ms
  elif [[ "$out" == *"saving work right now"* ]]; then busy=$((busy + 1))
  else fail "G admin: $out"; fi
  sleep 0.2
done
wait "$load"; load_out=$(cat "$WORK/load.out")
ok_bench "$load_out" || fail "G load: $load_out"
[[ $((deleted + busy)) == 40 ]] || fail "G count"
[[ "$(sql -c "SELECT count(*) FROM public.questions WHERE question_no BETWEEN 50011 AND 50050")" == "$busy" ]] || fail "G: remaining questions do not match busy count"
echo "PASS G: 0 failed student transactions under load"
echo "  baseline, no deletes (6 s): $(summary "$base"), slowest $(max_ms "$base") ms"
echo "  with 40 deletes (12 s):     $(summary "$load_out"), slowest $(max_ms "$load_out") ms"
echo "  admin deletes: $deleted succeeded, $busy backed off as busy; delete time avg $((deleted ? ms_total / deleted : 0)) ms, max $ms_max ms"
echo "question-safe-delete: concurrency checks passed"

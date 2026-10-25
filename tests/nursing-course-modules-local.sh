#!/usr/bin/env bash
# Synthetic PostgreSQL only; never connects to Supabase or an existing database.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=nursing-course-modules-test-$$
WORK=$(mktemp -d)
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -f -- "$WORK/concurrent.sql" "$WORK/a.log" "$WORK/b.log"
  rmdir "$WORK"
}
trap cleanup EXIT
docker run -d --rm --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for i in {1..60}; do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo "Disposable Postgres did not become ready" >&2; exit 1; fi
psqlx() { docker exec -i "$NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
psqlx < tests/nursing-course-modules-schema.sql
psqlx < supabase-nursing-course-modules.sql
psqlx < supabase-nursing-course-modules.sql
psqlx < tests/nursing-course-modules.sql
psqlx < supabase-nursing-course-modules.sql
psqlx -c "SELECT test_assert((SELECT count(*) = 0 FROM student_class_module_assignments), 'migration replay must not restore removed links');"
cat > "$WORK/concurrent.sql" <<'SQL'
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001', 'NUR 312', ARRAY['m4','m5']);
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001', 'NUR 416', ARRAY['m4']);
SQL
# Independent database connections, not a mocked concurrency check.
psqlx < "$WORK/concurrent.sql" > "$WORK/a.log" 2>&1 & A=$!
psqlx < "$WORK/concurrent.sql" > "$WORK/b.log" 2>&1 & B=$!
if ! wait "$A"; then cat "$WORK/a.log"; exit 1; fi
if ! wait "$B"; then cat "$WORK/b.log"; exit 1; fi
psqlx -c "SELECT test_assert((SELECT count(*) = 3 FROM student_class_module_assignments), 'concurrent saves deduplicate');
SELECT test_assert((SELECT count(*) = 2 FROM student_class_module_assignments WHERE module_key = 'm4'), 'shared module across classes');"
# New connection verifies committed persistence and student-visible RLS.
psqlx <<'SQL'
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
SELECT test_assert((SELECT count(*) = 3 FROM student_class_module_assignments), 'fresh connection persistence');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
SELECT test_assert((SELECT enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm4'), 'other course survives removal');
SELECT test_assert((SELECT NOT enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm5'), 'course-only final removal disables access');
SQL
psqlx -c "SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 312',ARRAY['m5']);"
psqlx -c "SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 312',ARRAY[]::text[]);" > "$WORK/a.log" 2>&1 & A=$!
psqlx -c "SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 416',ARRAY['m5']);" > "$WORK/b.log" 2>&1 & B=$!
if ! wait "$A"; then cat "$WORK/a.log"; exit 1; fi
if ! wait "$B"; then cat "$WORK/b.log"; exit 1; fi
psqlx -c "SELECT test_assert((SELECT enabled AND NOT independent_enabled FROM student_module_access
WHERE student_id = '00000000-0000-0000-0000-000000000003' AND module_key = 'm5'), 'concurrent removal and reassignment preserve access');
SELECT test_assert((SELECT count(*) = 1 AND min(class_code) = 'NUR 416' FROM student_class_module_assignments
WHERE student_id = '00000000-0000-0000-0000-000000000003'), 'concurrent course snapshots stay independent');"
echo "nursing-course-modules: database, RLS, rollback, concurrency, and fresh-connection persistence checks passed"

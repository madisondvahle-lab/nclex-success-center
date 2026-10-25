#!/usr/bin/env bash
# Runs the safe-delete migration against synthetic data in a throwaway local Postgres.
# Uses local Postgres server binaries when present, otherwise a disposable Docker container.
# Never connects to Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=question_delete_test
if command -v postgres >/dev/null 2>&1; then
  DIR=$(mktemp -d)
  PORT=${QUESTION_DELETE_TEST_PORT:-55439}
  trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
  export PGHOST="$DIR" PGPORT="$PORT" PGUSER=postgres
  createdb "$DB"
  psqlx() { psql "$@"; }
else
  NAME=question-safe-delete-test-$$
  trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
  docker run -d --rm --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB="$DB" postgres:17-alpine >/dev/null
  until docker exec "$NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; do sleep 1; done
  sleep 2
  psqlx() { docker exec -i "$NAME" psql -U postgres "$@"; }
fi
psqlx -q -d "$DB" -c "ALTER DATABASE $DB SET app.question_delete_local_test = 'local-only'"
run() { psqlx -q -X -v ON_ERROR_STOP=1 -d "$DB" < "$1"; }
run tests/question-safe-delete-local-schema.sql
run supabase-question-safe-delete.sql
run supabase-question-safe-delete.sql # migration must be safely re-runnable
run tests/question-safe-delete.sql
run supabase-question-safe-delete-rollback.sql
[ "$(psqlx -tAX -d "$DB" -c "SELECT (SELECT count(*) FROM pg_proc WHERE proname IN ('delete_questions_permanently','question_deletion_blockers','question_usage_details','question_usage_summary','prevent_used_question_delete')) || ',' || (SELECT count(*) FROM pg_trigger WHERE tgname = 'questions_prevent_used_delete') || ',' || (SELECT count(*) FROM public.question_deletion_archive)")" = "0,0,4" ] \
  || { echo "rollback check failed"; exit 1; }
echo "rollback removed safeguards and kept the archive"
run supabase-question-safe-delete.sql # re-apply after rollback
echo "question-safe-delete: all synthetic checks passed"

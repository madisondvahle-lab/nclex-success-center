# NUR 312 parallel practice persistence

## Root cause
`nur312-exam2-parallel.html` used the obsolete generic attempt API from
`assessment-persistence.js`. The current helper is diagnostic-only: start
requires a diagnostic profile/mode and returns a server-selected item; answer
uses server diagnostic item IDs; there is no client finalizer. The fixed course
page sent none of those required start fields and therefore received a non-2xx
Edge Function response.

## Repair
The parallel page now uses `course-practice-persistence.js` and the scoped
`save_nur312_parallel_practice` RPC, reusing canonical in-house attempt and
response tables. Access requires the signed-in student's existing assignment.
The server scores only IDs in this fixed bank, using keys generated directly
from the unchanged question JSON. It rejects foreign attempts, invalid items,
stale response revisions, and incomplete completion. Retries are idempotent.
The existing generic diagnostic RPCs remain revoked from browser callers.
No change to `diagnostic-assessment`, diagnostic clients, RLS, questions,
assignments, or historical attempts is needed.

The page waits for response saves before advancing/scoring locally, blocks
navigation/selection during saves, and retains selections for retry on failure.
Completion also remains retryable. Admin `?preview=1` still does not save.
This fix does not add cross-refresh resume or change the practice questions.

## Database and deployment
`supabase-nur312-parallel-persistence.sql` was applied live October 15, 2026.
It adds only the scoped RPC. Regenerate it with
`node scripts/build-parallel-practice-migration.cjs` if the bank is separately
authorized to change. Its template is `scripts/parallel-practice-migration.sql`.
No existing student rows, assignments, questions, or results were persistently
modified while validating.

Deploy the page and helper together via GitHub Pages from `main`/repository
root, at `portal.studywithmadison.com`. The browser fix is required in addition
to the already-installed RPC.

## Validation
- `node --test tests/parallel-practice.test.cjs`
- `supabase db query --linked --file tests/parallel-practice-persistence.sql`

The SQL test starts, answers all 116 items, retries every response, finalizes,
and retries completion using an assigned account. It checks stale revision,
invalid item, premature completion, unlinked/anonymous permission failures, and
unchanged diagnostic RPC access. All test writes roll back.

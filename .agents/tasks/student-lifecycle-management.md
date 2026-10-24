# Student lifecycle management

## Current staged rollout: backend verified, frontend publication October 23, 2026

Owner approved deployment on `c0be8b8e44f090bbfc584c6a203c041eabee8a81`,
preserving PR #245 and using a new explicitly approved controlled Gmail alias.
The alias was absent from students/Auth/intakes before creation. Existing QA
profile was not repurposed.

- Private baseline/function/schema/access backups refreshed and validated.
- Invitation migration applied; comparison verified only its nullable column
  was added and existing account/schema/policy metadata was unchanged.
  Migration SHA-256:
  `c4af9ed58601565c2e81b51847338609466fc18fc84fb5ceb457caa2c9411137`.
- Login function deployed v17 with `verify_jwt=false`; CAT remains v8/true.
  Candidate source SHA-256:
  `ae8b23d8c6fc98898e0d74c93f25fa4e9c4a37d0553135081145bdc9315b6660`.
  Hosted missing/invalid bearer requests returned 401; valid admin with a
  nonexistent profile returned 404.
- Authorized synthetic profile `d4f0cfd3-4e34-4815-870a-1c26ea4b80ff` created
  and activated; invitation recorded. Owner confirmed invitation receipt and
  successful student-dashboard sign-in after correcting an accidental failure
  response. No password reset/recreation was performed.
- Repeat activation confirmed `reused_login=true`, `emailed=false`, identical
  linked Auth ID and invitation timestamp. Subsequent sign-in with the original
  invitation credentials succeeded; the shared student dashboard matched the
  exact synthetic profile. Its attempt to invoke onboarding returned 403.
  Initial subsequent sign-in failures used a hyphen rather than the approved
  plus email alias; correcting the email resolved them without password reset.
- Final snapshot found another existing student
  `3b185b5e-cdae-4b01-be9c-bc7531eb55f7` changed portal stage from assessment
  to active. Auth ID and lifecycle status were unchanged. Deployment actions
  targeted only the synthetic ID. The owner confirmed this was an intentional
  separate change and explicitly requested preserving it. Snapshot comparison
  passed after allowing only this owner-confirmed change, the new nullable
  column, and the authorized synthetic identity. All other original student
  access associations and protected schema metadata matched the backup.
- Deployed v17 source downloaded and byte-compared with the candidate: exact
  match. Reconciled candidate passed 58 tests, including the new Bianca exam,
  plus Deno type-check and whitespace checks. Frontend publication proceeds
  only through the protected PR workflow; no unrelated runtime files included.

## Scope
Adds non-destructive lifecycle controls for students:

- `status`: active, paused, completed
- `archived_at`: reversible archive timestamp

`portal_stage` remains separate and controls onboarding/portal routing. Do not merge these concepts.

## Migration
`supabase-student-lifecycle-migration.sql` is additive and preserves all existing rows:

- adds `students.status` and `students.archived_at`
- backfills existing students to `status='active'`
- keeps `archived_at` null for existing students
- validates allowed statuses
- adds indexes for current/admin and archived lists
- does not change RLS, auth mappings, or child tables

Run the migration before deploying the HTML changes. The new admin UI expects both columns.

## Filtering policy
Operational/current lists exclude archived students with `archived_at IS NULL`:

- `madison-admin.html` current roster
- `madison-assignments.html` assignment/upload pickers
- `shared-progress.html` admin student picker
- `assessment-history-admin.html` new-entry student picker/roster

Historical and self-linked data intentionally remains inclusive:

- external assessment history joins
- shared progress history loaded by direct student ID
- supplemental practice history
- in-house assessment history
- student module access
- student authentication/self lookups
- leads/intake student matching

## Safety
Archive is not delete. Restore clears only `archived_at`. Status changes update only `status`. Authentication is not blocked by either lifecycle control.

## Combined onboarding improvement (local, not deployed)

The existing `create-student-login` Edge Function now accepts `activate: true`.
This admin-only operation enables lifecycle status `active` and portal stage
`active`, preserves an existing linked login/password without another invitation,
or creates a missing login and emails its invitation. For a new login, linking
the Auth user and updating both flags happen in one guarded student-row update.
Archived profiles must be restored first. An already-registered but unlinked
email is not silently attached or reset.

Admin home offers **Activate student & prepare portal access** from the directory
and linked prospect rows, including assessment-only profiles without a login.
It confirms the saved student/email, blocks duplicate in-flight requests, and
verifies all three readiness fields before reporting completion. Assessment-only
login creation and the separate lifecycle/access controls remain available.
Assignments, bookings, curriculum, and student history are not changed.

The directory separately labels portal access, login readiness, and invitation
status. `portal_invite_sent_at` records email-provider acceptance, not delivery or
student sign-in. Existing invitations are not backfilled: NULL displays **Not
recorded**. Email rejection/network errors and failed timestamp writes produce
explicit partial-success messages, not a claim that an invitation was delivered.
When a newly generated invitation fails, the authenticated admin can privately
copy the temporary login details. Re-running activation never resets an existing
password or automatically resends an invitation; password recovery is the
fallback for an existing login.

### Deployment order (requires authorization)

1. Apply `supabase-student-invitation-status-migration.sql`; it adds only the
   nullable timestamp and does not change existing rows, grants, or RLS.
2. Deploy only `create-student-login` with `--no-verify-jwt`, preserving the
   existing production gateway setting and its mandatory `auth.getUser()` and
   `app_admins` checks. Email requires the existing
   `RESEND_API_KEY`; missing configuration stops new combined activation before
   login creation or flag changes.
3. Publish the updated `madison-admin.html` through GitHub Pages/main.

Do not publish the admin page ahead of the migration/function. No live records,
emails, migrations, or deployments were performed for this implementation.
The shared worktree contains earlier deployed booking fixes and unrelated
unpublished commits; isolate this release from current `origin/main`.

### Validation

- Focused Node tests cover service authorization, new/existing accounts,
  lifecycle/access preservation, guarded linking and cleanup, missing email
  configuration, invitation rejection/network failure, timestamp-write failure,
  UI cancellation/duplicate clicks, readiness verification, and indicators.
- All 53 tests passed with `node --test tests/student-onboarding.test.cjs
  tests/admin-prospects.test.cjs tests/consultations-list.test.cjs
  tests/admin-appointment-calendar.test.cjs tests/study-calendar.test.cjs`;
  `git diff --check` passed.
- `npx --yes --package deno deno check supabase/functions/create-student-login/index.ts`
  passed. Deno was absent locally; temporary npm tooling was used without
  changing project dependencies.
- Production integration and actual invitation receipt/student sign-in remain
  unverified for this new action.

### Staged deployment preflight: stopped October 23, 2026

The owner authorized staged deployment with a mandatory stop on unexpected
baseline differences or uncertain authentication compatibility. Production
main/Pages is `c599d0301d5abe294e369a32bcb1599ad5d6e286` (PR #244), including
booking PR #243 and the assessment/workspace display release. Local checkout
has unrelated unpublished assessment/server work; never publish it wholesale.
The onboarding runtime delta against main is limited to the admin page and
`create-student-login`, plus its additive migration and tests/documentation.
No assessment, MCQ, CAT, SATA, NGN, or workspace runtime changes are needed.

Read-only production inspection confirmed the invitation column does not yet
exist. The migration is additive, not destructive. The actual deployed login
function is version **16**, ID `aae05466-e718-40d3-bc4f-dd54455976df`, with
**`verify_jwt: false`**, unlike the earlier prepared deployment instructions
above. Its downloaded source matches `origin/main` exactly and checks the
bearer token using `auth.getUser()` plus `app_admins`. Do not describe the
gateway setting alone as absence of authentication, and do not enable gateway
JWT verification without a compatibility check.

Deployment STOPPED before any migration, function deployment, PR, or publication.
A private session backup preserves the downloaded deployed login source and
function metadata; no student-account backup or mutation was performed. No test
emails were sent, no password/account/access changes were made, and no NGN
admission setting was changed. The production browser available at preflight
was signed out; no test account/email recipient has been confirmed for this
rollout.

Before resuming: confirm an authorized synthetic account and controlled
inbox for invitation/sign-in testing; isolate the candidate on fresh main;
then repeat required checks and create the required database-object/account
backup before applying any migration. Preserve the existing function-level
authentication checks and all real student associations/access.

### JWT investigation completed (production unchanged)

- Historical evidence: commit `0b652499816be1e7da4344dfcf1d6e221f6a2224`
  introduced `DEPLOY_STUDENT_LOGIN.md` on August 13, 2026 with the explicit
  `--no-verify-jwt` command. Its stated reason was CORS preflight, with
  application-level Auth validation and admin membership required. This
  documents the intended configuration, not an audit trail of the exact v16
  deployment command.
- The deployed v16 and candidate have the same authentication gate: require
  Bearer header, validate using `auth.getUser()`, check `app_admins` using the
  verified user ID, then process the student. No student mutation or Auth-user
  creation happens before these checks. Gateway JWT checking is an additional
  layer, not a replacement for admin authorization.
- Actual disposable Docker/Supabase testing used the copied candidate source
  with only its Resend request redirected to a local synthetic-email capture.
  Separate functions had gateway `verify_jwt=false` and `true`; missing-header
  responses confirmed the former rejected in the handler and the latter at
  the gateway. Real local Auth issued ES256 sessions; both ES256 and locally
  signed legacy HS256 admin tokens passed each configuration. Production's
  public JWKS advertises ES256; no live sessions/tokens were copied into tests.
- Both configurations passed: unauthenticated OPTIONS; missing/malformed/anon/
  expired/forged bearer rejection (401); authenticated non-admin rejection
  (403); invitation creation/capture; login using the emailed credentials;
  student-owned profile read and other-student isolation; repeat activation
  preserving the same password and sending no second email; refusal to create
  a duplicate Auth identity for an already-registered but unlinked email.
  Unauthorized calls caused no Auth creation or captured email.
- Both local configurations passed preflight, so the old guide's rationale
  does not establish a present-day requirement to disable verification. Nor
  did the tests establish a need to enable it. Recommendation: preserve false
  for the scoped release, keeping mandatory application-level checks intact.
  Local success with true does not prove every hosted session/client would be
  unaffected by a production setting change.
- Important invitation semantics: this workflow creates a confirmed Auth user
  and emails temporary credentials. It is not Supabase's invitation-link
  acceptance flow. The synthetic invitation test verified sign-in using those
  credentials, not a magic-link/token acceptance operation.
- Private backup now includes students column/constraint/index/trigger/grant/
  RLS definitions, student access associations, intake links, linked Auth
  identity metadata (no password hashes or tokens), and admin membership.
  JSON parsed successfully: 21 student access rows, 13 columns, 3 policies,
  RLS enabled. It is a targeted schema/access rollback snapshot, not a full
  Supabase disaster-recovery/password backup. Refresh before any future write.
- Read-only discovery found existing `QA Test Student`, ID
  `4a0944d5-46d0-40e8-aab4-373ef42d17b8`, with linked confirmed Auth identity.
  Label/recent use do not prove current authorization or inbox control. No
  test-account credentials were retrieved/reset; no production invitations
  were sent. Owner authorization and a confirmed controlled recipient remain
  required for hosted end-to-end checks. Current browser is signed out.
- Final candidate checks: 53 focused tests and Deno type-check passed. The
  narrow security review found no confirmed exploitable vulnerabilities.
  Production remains login v16/gateway false, CAT v8/gateway true; the NGN
  admission secret digest still matches `false`. No production changes,
  migration, function deployment, account creation, email, PR, or publication.
- Reconciled candidate is isolated in session worktree `onboarding-reviewed`,
  branch `release/onboarding-auth-reviewed`, based on production `c599d03`.
  Only onboarding runtime files, its migration/tests and related documentation
  differ. All 53 tests and Deno type-check pass there too. The actual invitation
  migration was applied twice to synthetic local data; assertions verified no
  student/access/Auth data or RLS-policy changes, and NULL historical delivery.
  Production schema/access snapshot was compared again and is identical;
  Giselle's linked regular-portal access is preserved. Local services and
  synthetic data volumes were removed after testing. No production test
  invitation, password reset, or account creation occurred.

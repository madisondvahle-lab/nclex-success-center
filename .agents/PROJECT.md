# NCLEX Success Center Project Context

## Repository boundary
This repository is the private/student-facing NCLEX Success Center and its tutor/admin tooling.

The separate repository `madisondvahle-lab/study-with-madison-site` is the public Study With Madison RN website.

### Belongs here
- student authentication and private dashboards
- NCLEX modules and student practice
- diagnostic/readiness assessments and mock CAT functionality
- question-bank and NGN content infrastructure
- student module assignments
- assessment history and personalization
- shared student/tutor progress tools
- secure tutor/admin tools
- Supabase data/security supporting these functions

### Does not belong here
- public business landing pages
- general tutoring marketing
- public blog posts
- SEO-focused business content
- public package/service marketing

Those belong in `study-with-madison-site`.

## Authentication and privacy
Current secure architecture takes precedence over legacy implementations.

Do not:
- restore browser-only PIN authentication as the security model
- disable Row Level Security
- expose private Supabase storage
- put student data into public files
- hard-code individual student credentials
- bypass authentication simply to make a page easier to access

Historical implementations may be inspected for recoverable UI or educational content, but obsolete security patterns must not be restored.

## Supabase
The repository contains multiple migrations representing project evolution. Do not assume `supabase-schema.sql` alone represents the current database.

Before changing database behavior:
1. inspect relevant current migrations and current application usage
2. identify affected tables, functions, storage, and policies
3. preserve authentication and RLS protections
4. document any manual Supabase step required after deployment

Never silently assume a migration has already been run in the deployed Supabase project.

### Student profile UPDATE remediation (pending approval)

`supabase-student-profile-update-security.sql` removes the deployed unconditional
`allow_anon_update_students` UPDATE policy and adds an authenticated,
restrictive admin-only UPDATE guard. Shared table/column UPDATE grants are
retained because existing admin tools use the same authenticated database role.
The restrictive policy prevents student direct updates even if another
permissive UPDATE policy is present. Existing admin SELECT/ALL policies and
the secure-access schema must be installed first.

The only traced direct student-row edit is dashboard onboarding: `course_name`
and `exam_date`. These descriptive fields are now saved by
`update_my_student_profile(profile_patch jsonb)`, an authenticated own-account
RPC with a strict field/type allowlist, no student-ID argument, and explicit
failure for unlinked/archived profiles. They do not grant enrollment or module
access. Identity, name/email/PIN, portal stage, student type, lifecycle, invite
metadata, and creation fields are not accepted. There is no existing student
name/email/PIN editing workflow to preserve; future self-service changes need
their own reviewed validation, not a broader allowlist. NCLEX target-date
editing stays on `update_my_nclex_target_date(date)`; class exam scheduling
continues to use its separate table and policies. Admin lifecycle changes and
service-role login/invitation operations are unchanged.

Rollout: separately approve/apply the migration before deploying this dashboard.
It changes policies/functions only; it does not backfill or edit student rows.
After approval verify function owner is the intended trusted database owner and
PostgREST has reloaded its schema. Test real admin/student sessions on disposable
staging before production. If rolling back the UI, keep the restrictive policy
and RPC: older onboarding's direct profile UPDATE will be denied rather than
reopening the exposure. Prefer a forward UI fix; never restore the unconditional
policy to recover onboarding.

Validation:
`node --test tests/*.test.cjs tests/*.test.mjs` and
`node --test tests/student-profile-security.integration.mjs`.
The latter starts/cleans up disposable PostgreSQL 17 and PostgREST containers,
uses synthetic signed JWTs, reproduces the original flaw before the migration,
and tests direct HTTP PATCH/upsert/RPC bypass attempts, admin/service-role
compatibility, self-service persistence, and the existing NCLEX date RPC.
It requires Docker; no live Supabase credentials or student records are used.
This remediation is a separate branch/PR, not part of nursing-module PR #252.
No migration has been applied to production by preparing this fix.

## Student learning architecture
Keep these concepts separate:

- **Guide:** educational/remediation content.
- **Quiz:** student module assessment or practice experience.
- **CAT/diagnostic:** adaptive readiness assessment.
- **Question Bank Manager:** internal tutor/admin tooling for reviewing/managing questions.

### Student Previous Tests workspace

The dashboard's **Previous Tests** menu opens a separate workspace rather than
scrolling to a dashboard card. `student-test-history.js` and its stylesheet
provide a searchable, paginated test list, a summary/question table, and
read-only question review with Previous/Next navigation.
The history stylesheet scopes the blue NCLEX exam palette and Arial typography
to the list, results summary, and question review; other dashboard sections
retain their existing theme.
History displays permanent bank numbers (for example `Q-0123`) and readable
question types instead of internal UUIDs. Missing saved numbers are resolved
with metadata-only, RLS-protected reads using bank UUIDs or set-scoped legacy
references. Unmapped or inaccessible numbers are labelled unavailable; lookup
errors show a retry without hiding saved answers or rationales.
Practice detail queries use both the student ID and saved result ID; completed
portal assessments use
the existing authenticated `diagnostic-assessment` review action. Shared
`PracticeReviewData`, `ExamUI`, and option-presentation helpers preserve saved
responses, clinical records, and option order. No new history tables or writes
are introduced. NGN points are distinct from fully correct item counts.
Missing timing/settings/content are labelled not recorded, never reconstructed
from current questions. Local validation: `tests/student-test-history.test.cjs`,
`tests/student-nav.test.cjs`, and the synthetic browser checks in
`tests/student-test-history.browser.js`. These local changes are not a deployment.

### Consultation CPR report attachments

Paid Strategy Sessions retain the existing consultation and linked diagnostic
workflow. The CPR panel reuses the CPR tracker's per-attempt notes and question
counts plus private assessment storage. Its additive
`supabase-consult-cpr-files.sql` migration was explicitly approved and applied
October 26, 2026, with existing data/policy fingerprints unchanged. UI release
is tracked in PR #273. See [the rollout handoff](tasks/consultation-cpr-reports.md).

### Authored clinical-record and NGN supplemental practice

Question-bank archive rollout (PR #278; UI deployment pending): the additive
`supabase-question-archive.sql` adds nullable `questions.archived_at` and a
constraint requiring archived questions to remain inactive. It changes no
policies, grants, or existing rows. The owner separately approved production
migration and cleanup on October 27, 2026. Both are applied and verified:
156 explicit inactive IDs archived, 56 published questions unchanged (including
Q-1146–Q-1151), zero working inactive questions at cleanup. All 15 original-data
table fingerprints (excluding only new `archived_at`) and policy/grant/RLS
signatures matched before/after. No deletion, assignment withdrawal, or
question/correction/audit/flag-content/status changes. All bank column variants
require the new field, so the schema must precede UI deployment.
Working bank/duplicate/audit/correction/flag queues exclude archived questions;
Archive and review-history controls retain access. Restore keeps questions
inactive and preserves outstanding findings. No assignment withdrawal, question
content changes, correction-status changes, or student-history deletion.
Verified scope on October 27: 156 archived inactive, 56 published; 23 correction records
(18 applied, 4 rejected, 1 approved) and 9 audit records attach to the inactive
questions. All 28 correction records are retained; published-question reviews
remain in their existing workflow. A later cleanup needs its own approval and
fresh scope. Validation: 121 focused tests including disposable PostgreSQL;
synthetic 1440px/390px archive/history/restore checks. Cleanup snapshots and exact
target IDs are retained in the originating session, not in the repository.

Clinical-record tabs are independent of interaction type. The existing Question
Bank author supports tabs on single MCQ/SATA questions as well as standalone
NGN items and unfolding cases. Supplemental practice preserves authored tabs
when delivering MCQ/SATA through mixed, weekly, course, and bank-set routes;
questions without records retain their normal display and scoring. This does
not add case studies or standalone NGN types to traditional question selection.

Student practice and the import preview use the same shared `exam-ui.css`
NCLEX-style theme, without practice-specific exam overrides. Questions without
records remain single-column; clinical-record questions retain the renderer's
tabbed layout. The practice library and results-page styling is unchanged.

The custom practice builder opens with Client Needs as its first/default focus
tab. Study Areas remain available in the second tab, and optional topic filters
remain collapsed below. Filters combine as before; switching tabs preserves
selections. The card-based builder uses the existing navy, rose, and cream
palette, labeled controls, and keyboard tab navigation (arrow keys, Home, End).
Client Needs, Study Areas, Topics, question types, and history modes have
Select all / Clear all controls with selection counts. Topic bulk actions
include search-hidden topics, as explained beside the controls. Blank optional
focus filters retain mixed practice; no types or history modes disables Start.
Synthetic browser validation is in `tests/practice-builder.browser.js`.

The Assignments page has a separate **Published NGN case studies and standalone
clinical-record questions** picker. Only explicitly selected published,
schema-versioned authored entries are assigned. A case must have exactly six
items; its charts, chronological notes, disclosure stages, and question order
remain together. Assignment uses existing `student_resources`, and results use
existing `student_supplemental_practice_results`; no new tables or columns.
`score` remains an integer count of fully correct items. `answer_details`
retains interaction/chart snapshots, canonical answers, per-item points and
rationales; explicit NGN results show partial-credit points separately.

Resume uses the existing per-student, per-route `sessionStorage` checkpoints:
refresh or return to the same URL in the same tab/browser session. This is not
cross-device resume. Failed result/completion writes retain the checkpoint and
offer retry; an acknowledged result is not inserted again on completion retry.
Students can reopen completed attempts using **Clinical-record / NGN results**
in supplemental practice. Admins use **Student workspace → Portal assessments
& practice → Review questions**. Reviews use saved snapshots, not a subsequently
edited or unpublished bank entry. The general dashboard's legacy practice
percentage still represents fully correct items, not NGN points.

**Database release prerequisite:** apply `supabase-ngn-practice-completion.sql`
after the existing weekly-assignment migration, before publishing the UI.
The owner approved this narrow completion-function extension on October 26,
2026. It permits owned explicit authored-practice assignments in addition to
the unchanged weekly path. It retains admin/owner checks and authenticated-only
execution, changes no RLS policies, and performs no data backfill. CAT selection,
approval controls, admission settings and server functions are outside this
release. Applied to the linked production project on October 26, 2026, after
PR #268 checks and direct review passed. Readback verified the function owner
(`postgres`), fixed search path, security-definer setting, authenticated-only
grant and both allowed completion branches. Aggregate counts and ordered row
fingerprints for seven application tables (questions, students, resources,
supplemental results, CAT attempts/responses and flags), plus their policy
fingerprint, were identical before/after. No production test records were
created. Deployment remains GitHub Pages from `main` and repository root at
`portal.studywithmadison.com`.

Author workflow:
1. Question bank → **Intake & Legacy** → Create an interactive question. Choose **Unfolding
   case** for a case, or **Single response / MCQ** / **Multiple response / SATA** for a standalone
   MCQ/SATA with records; other existing NGN types remain available.
2. Enter the question/title, rationale and required classification fields.
   Add clinical-record tabs, column headings, dated/timed entries and cells.
   Standalone records must be available from item 1. For a case, add six case
   questions in the intended order, set each interaction and answer key, and
   use **Available from item** on tabs/entries for unfolding disclosure.
3. Use **Preview as student** to verify every chart, stage, interaction, key
   and rationale. Save the inactive draft. Review it in Manage bank, then use
   the existing review/approval and **Publish** action. Publication is not CAT
   approval, and this implementation publishes no content automatically.
4. Assignments → choose one student → select entries in the separate published
   authored-practice picker → **Save assignments**. Leave mixed/traditional
   options unchecked unless separately desired. Multiple cases can be assigned
   together without consuming dated weekly practice slots.
5. Student opens the assigned work, completes it, and waits for **Saved to your
   shared dashboard. Assignment complete.** Then inspect the saved attempt in
   the student's results link or admin Student workspace, including all six
   responses, earned/possible points, records and rationales.

Validation: `node --test tests/ngn-practice.test.cjs
tests/ngn-interactions.test.cjs tests/practice-question-selection.test.cjs
tests/practice-review-data.test.cjs tests/existing-question-author.test.cjs
tests/nursing-class-modules.test.cjs tests/weekly-assignments.test.cjs
tests/assessment-display.test.cjs`, plus
`node --test tests/ngn-practice-completion.integration.mjs` (disposable Docker
PostgreSQL; no production test records). The browser fixture
`tests/fixtures/ngn-practice-browser.js` substitutes a synthetic Supabase client:
block all Supabase network traffic and fulfill the Supabase CDN script with
`window.supabase={createClient:()=>window.syntheticDB}`. Verified scenarios
include explicit multi-assignment, six interaction types in one case,
standalone record-backed MCQ and numeric NGN, staged charts, refresh resume,
failed-save/completion retries, one result per submission, student saved
history and admin saved review. No production students/questions were used.
The final focused gate also includes shared UI, MCQ and SATA presentation
regressions: 99 tests passed. The broader test glob has 22 pre-existing CAT
endpoint-fixture failures also reproduced on clean `main` (`d77ebd8`); those
fixtures do not recognize the existing `get_cat_approved_questions` RPC.
They are outside this release and have not been suppressed or repaired here;
the full repository suite must not be described as green.

An internal question-bank management page must never be used as a student quiz.

Do not replace substantive module content with a login redirect merely because the content requires authentication. Preserve the module and protect access at the appropriate session/routing layer.

## Curriculum
Use `.agents/STATUS.md` as the current curriculum authority.

The repository contains an older 21-module curriculum map. It is historical reference, not permission to restore old numbering. In particular, historical M6 Fluids & Electrolytes / M10 Endocrine numbering conflicts with the current curriculum direction.

## Diagnostic and question bank
The diagnostic/CAT system has evolved through multiple iterations and currently uses a larger question bank, core-safety coverage, adaptive behavior, mock CAT functionality, and assessment-history personalization.

When changing CAT mechanics, preserve clinical content unless clinical edits are explicitly authorized. When changing clinical content, follow `.agents/CLINICAL-STANDARDS.md`.

## Admin architecture
Do not assume one legacy admin page contains all current functionality. Current admin/tutor workflows are distributed across secure tools including student/module assignments, assessment history, progress/report tooling, and question-bank review.

Inspect the current implementation before adding a new admin workflow so existing functionality is not duplicated.

### NCLEX Coaching Outcomes (implementation prepared; database rollout pending)

`madison-coaching-outcomes.html` adds an admin-only outcomes workspace linked from
Admin home. It reuses existing students, intake links, actual NCLEX attempts,
authentication and `is_app_admin()`. Payment and historical coaching completion
are manually verified; no Stripe synchronization or new paid services are added.
Standalone Strategy Sessions, free consultations and academic tutoring do not
qualify. At least one completed paid NCLEX coaching/tutoring session beyond a
Strategy Session is required.

`supabase-nclex-coaching-outcomes.sql` adds linked eligibility/completion records,
private versioned evidence, admin-only storage, and database-generated audit
history. It extends existing attempts without backfilling their content or
duplicating students/intakes. Existing attempt editors remain compatible;
tracked attempts must be corrected rather than deleted. Attached evidence,
including revoked versions, cannot be overwritten/deleted.

Primary reporting selects the earliest examination after qualifying coaching
before applying filters, one student per cohort. The approved known-outcome
rate includes explicit student reports, separately labeled from documented and
independently checked results. Actual examination attendance requires explicit
confirmation; scheduled dates do not automatically become tested outcomes.
Undated, duplicate and ambiguous same-day histories require review. Nursys
findings need identity/credential checks and separate attempt/date association;
license absence never establishes failure. Zero denominators show insufficient
data. Untested students remain outside examination-date cohorts. Reviewer
JSON/CSV excludes identity and private free text, payment references and evidence
links. Exact dates mean exports are controlled/de-identified, not public reports.
Follow-up preference/consent fields are reserved; no messaging is implemented.

**Required release order:** separately approve a read-only live-schema/policy
preflight and production migration application before merging/publishing this
UI through main/GitHub Pages. Check all existing permissive storage policies
leave the new bucket admin-only. Creating a PR does not apply the migration.
No production data updates, automated messages or migration application were
performed during local implementation.

Validation: `node --test tests/nclex-coaching-outcomes.test.cjs` and
`node --test tests/nclex-coaching-outcomes.integration.mjs` (disposable Docker
PostgreSQL 17). With Docker unavailable, the integration test accepts
`COACHING_TEST_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js` for isolated
embedded PostgreSQL; no repository dependency is added. Local validation passed
44 focused tests including migration/RLS/audit/storage and existing admin/consult
regressions. The synthetic browser fixture is
`tests/fixtures/coaching-outcomes-browser.js`; intercept the Supabase CDN script
and block all Supabase network requests. Browser checks covered historical entry
without student writes, outcome corrections, evidence upload/hash/revocation,
exports, source failures, attendance confirmation, and 390px/320px layouts.
Live Supabase, Storage API and authenticated production behavior remain unverified.

## Historical recovery
Git history contains useful earlier module content and UI implementations.

Historical content may be selectively recovered when useful, but do not:
- restore an entire historical file without reviewing it
- restore obsolete authentication/security
- restore obsolete curriculum numbering
- overwrite newer content with an older version
- assume a historical file is compatible with current Supabase behavior

## GitHub search limitation
Repository code-search indexing may be unavailable. An empty search result is therefore not sufficient evidence that a file, phrase, or implementation does not exist. Use direct file inspection, repository structure, commits, and PR history as needed.

## Change strategy
For substantial work:
1. establish the exact scope
2. inspect current relevant files
3. check STATUS and applicable standards
4. make the smallest coherent change
5. validate behavior
6. record manual deployment/database steps
7. leave a handoff when work is incomplete

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

### Authored clinical-record and NGN supplemental practice

Clinical-record tabs are independent of interaction type. The existing Question
Bank author supports tabs on single MCQ/SATA questions as well as standalone
NGN items and unfolding cases. Supplemental practice preserves authored tabs
when delivering MCQ/SATA through mixed, weekly, course, and bank-set routes;
questions without records retain their normal display and scoring. This does
not add case studies or standalone NGN types to traditional question selection.

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
release. Deployment remains GitHub Pages from `main` and repository root at
`portal.studywithmadison.com`. Preparing this file does not mean it is applied.

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

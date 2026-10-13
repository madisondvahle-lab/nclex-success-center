# Admin center redesign — Phase 1

## Task
Continue the admin-center redesign with a consolidated dashboard, student directory, and student-profile shell while preserving existing student records, assignments, history, authentication, and QBank content.

## Scope
### Files changed
- `madison-admin.html`
- `madison-consultations.html`
- `madison-leads.html`
- `shared-progress.html`

### Files not to change without separate authorization
- Supabase schema, RLS, storage policies, and student records
- Question IDs, clinical wording, answers, rationales, or unpublished drafts
- Existing course-specific assignments or student performance history

## Clinical-content authorization
- [x] Clinical content is locked. Do not change stems, choices, answers, rationales, clinical facts, or question IDs.

## Acceptance criteria
- [x] Provide one admin landing page with student lifecycle/status context, directory search and filters, operational metrics, recent activity, upcoming consultations, and CAT check-in.
- [x] Preserve the reversible archive/status model and existing assignment links.
- [x] Make dashboard links open the selected consultation or open the quick-consult intake form.
- [x] Add clear profile context and section navigation that targets the existing student-workspace sections.
- [x] Do not add database migrations or duplicate existing student/consultation workflows.

## Current state / context
- `madison-admin.html` now contains the Phase 1 dashboard and data wiring. Activity-source failures remain visible and are not treated as “no activity”; a roster query failure is not overwritten by later dashboard renders.
- `madison-consultations.html?consultation=<id>` opens the selected booking in the existing consultation editor.
- `madison-leads.html?new=consult` opens the existing Quick consult intake panel after admin initialization.
- `shared-progress.html` shows the selected student’s program, lifecycle status, and relevant NCLEX target or course-assignment context. Its navigation points to the existing overview, performance, practice activity, assignment, report, and note sections.
- No Supabase schema or clinical/QBank content was changed.
- The worktree also contains earlier student study-flow changes in `PRODUCT.md` and `supplemental-practice.html`; preserve them.
- Deployment source of truth: `portal.studywithmadison.com` is served by GitHub Pages from this repository’s `main` branch and repository root. DNS and response headers identify GitHub Pages; do not assume Netlify or Cloudflare Pages.

## Validation performed
- Parsed the inline JavaScript in all four changed HTML files with Node.
- `git diff --check` passed.
- The final Impeccable detector pass reported inherited font/type and semantic side-accent findings in the existing admin surfaces; those shared visual conventions were left unchanged in this narrowly scoped Phase 1 pass.
- Live Supabase and Calendly behavior was not exercised; previewing the admin route without an authenticated session correctly redirected to student sign-in.

## Manual steps required
- None for these changes. Existing lifecycle behavior depends on the already-documented student lifecycle migration; no new SQL is required.
- Publish only through the verified GitHub Pages deployment path after the change is approved and merged.

## Handoff / remaining work
- Continue later admin phases by integrating deeper performance, activity, report, and assignment workflows into the profile view without duplicating their current sources of truth.
- Further consultation and dashboard polish remain outside this Phase 1 implementation.

## Risks or unresolved questions
- A full authenticated browser review and live data validation remain outstanding.
- The Impeccable detector reports inherited font/style findings on several admin pages; do not broadly restyle those pages as part of this handoff without a focused design decision.

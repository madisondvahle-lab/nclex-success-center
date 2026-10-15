# AI / Human Task Handoff: Student QBank Navigation Sidebar & Gap Analysis

## Task
Build the responsive student practice navigation shell (sidebar + mobile drawer) inspired by nursing school QBank platforms, wire it exclusively to existing student features without placeholder routes, and document gaps for features that do not yet exist.

## October 14, 2026: Practice-first student home
- Started from current `main` (`28e7e7c`), not the obsolete clinical-audit branch.
- Both student dashboard and practice navigation now explicitly say **Question Bank**. NCLEX students see **Create practice**; nursing students retain **Exam Prep**. Both use `supplemental-practice.html`, which already selects the appropriate student workflow.
- The dashboard now opens with a compact greeting and a prominent **Start practice** action. NCLEX assigned work (including assigned practice sets) and available modules appear before the plan and performance sections. Nursing students retain their class-selection prerequisite and assigned exam workflow.
- Repaired role-aware sidebar section links and incoming hashes. Links select visible cards in the active portal; nursing students who have not selected a class are taken to the class selector rather than hidden content. Removed duplicate module element IDs.
- Corrected the mobile shell layout, closed-drawer keyboard access, focus containment, Escape/backdrop closing, body scroll locking, and resize behavior. Preserved the existing navy/teal/cream identity and NCLEX rose accents; the design detector's incumbent Inter-font warning is intentionally not a reason to change the site's typography.
- No clinical content, question IDs, bank activation, Supabase queries for practice, authentication, assignment checks, RLS, database schema, or tutor tools changed. The existing practice account lookup still requires the signed-in student's profile; a tutor without a student profile is not treated as a student or given a bypass.
- Validation: `node --test tests/student-nav.test.cjs`; headless browser checks using synthetic Supabase responses at 1440px, 390px, and 320px for NCLEX and nursing students. Checked practice destinations, role-specific builder vs assigned exam lists, section/hash links, focus handling, empty assignments, and signed-out/missing-profile redirects. No production student data was used.
- Deployment remains **GitHub Pages from `main`, repository root**, at `portal.studywithmadison.com`. Review and merge the feature branch into `main` to publish; no migration, production deployment, or merge was performed by this task.

## Scope
### Files changed / created
- `student-nav.css` (Created: responsive sidebar, off-canvas mobile drawer, skip-links, focus outlines, Nursing teal vs NCLEX rose themes)
- `student-nav.js` (Created: menu toggle, Escape key handler, role/label updater, smooth anchor scrolling)
- `student-dashboard.html` (Modified: integrated sidebar shell, mobile top-bar, anchor targets for modules, previous tests, and performance)
- `supplemental-practice.html` (Modified: integrated sidebar shell, mobile top-bar, active practice item, auth and ExamUI preserved)
- `.agents/tasks/student-practice-sidebar.md` (Created: handoff and gap analysis)

### Files that should not change
- Question content block in `supplemental-practice.html` (lines 199–1708)
- Question IDs, keys, rationales, and clinical content in all files
- Supabase database schema and RLS policies

## Clinical-content authorization
- [x] Clinical content is locked. Do not change stems, choices, answers, rationales, clinical facts, or question IDs.
- [ ] Clinical editing is explicitly authorized for the scope described below.

Authorized clinical scope, if any: None.

## Acceptance criteria
- [x] Responsive navigation sidebar built with accessible skip link, high-contrast focus rings, and mobile drawer.
- [x] Wired to existing live student features only:
  - **Overview -> Dashboard**: Links to `student-dashboard.html`.
  - **Overview -> Lectures & Guides**: In-page anchor to `#modules` on dashboard (`#modules-nclex` or `#modules-nursing`).
  - **QBank -> Exam Prep / NCLEX Review**: Links to `supplemental-practice.html`.
  - **QBank -> Previous Tests**: In-page anchor to `#previous-tests` on dashboard (`#cat-trend-card` / `#log-cat-card` or `#progress-nursing`).
  - **QBank -> Performance**: In-page anchor to `#performance` on dashboard (`#cat-results-card` or `#progress-nursing`).
- [x] Preserved distinct NCLEX student path (rose accent, "Learning Library", "NCLEX Review", CAT trend logging) vs Nursing Course student path (teal accent, "Study Guides & Modules", "Exam Prep", course-to-exam docket).
- [x] ExamUI takeover behavior preserved (full-screen overlay when practice begins, returns to docket on exit/completion).
- [x] Sign out wired across desktop sidebar, mobile header, and legacy triggers.
- [x] No dead links, no placeholder routes, no leaks of tutor answer banks.

## Gap Analysis (Platform Inspiration vs Current Capabilities)
Based on the reference nursing-school testing platform sidebar:

| Feature in Reference | Current Status in Success Center | Decision & Recommendation |
|---|---|---|
| **Lectures** | Exists as **Study Guides & Modules** (`#modules-nursing`) and **Learning Library** (`#modules-nclex`). | **Wired directly.** Dynamic labeling adapts to student type. |
| **QBank -> Create Test** | NCLEX students can build a practice set from one or more active bank topics, or leave topics unselected for a mixed set. Students and tutors can choose 10, 20, 30, 40, 50, 60, 75, or 100 questions. Course-based nursing students continue to see only their assigned course materials and sets. | **Implemented in `supplemental-practice.html` and `madison-assignments.html`.** The builder reads active bank items only; no database migration was needed. |
| **QBank -> Previous Tests** | Exists as **Recent quiz scores** (`student_supplemental_practice_results`) and **CAT / Readiness trend** (`student_assessment_uploads`). | **Wired directly.** Direct anchors to `#previous-tests`. |
| **QBank -> Performance** | Exists as **Recent quiz scores** (Nursing) and **Category Breakdown & CAT trend** (NCLEX). | **Wired directly.** Direct anchors to `#performance`. |
| **QBank -> Search** | **GAP.** Existing search pages (`question-bank-review.html`, `madison-questions.html`) are administrative tutor tools that expose answer keys, rationales, and full answer sets. | **Omitted from sidebar.** Exposing administrative search to students would compromise the question bank and NCLEX practice integrity. A student question search would require a separate RLS-protected endpoint stripping answer keys. |
| **QBank -> Notes** | **GAP.** No student-facing saved notes or bookmarking system currently exists in the database schema or UI. | **Omitted from sidebar.** Requires schema additions (`student_question_notes` or `student_study_notes` table with student RLS) before exposing in navigation. |

## Current state / context
- The original student navigation shell and QBank assignment presentation remain in place.
- `student-nav.css` and `student-nav.js` are self-contained and reusable across future student pages.
- Desktop breakpoint: fixed 256px sidebar at `min-width: 961px`.
- Mobile breakpoint: hidden sidebar, visible `.portal-mobile-bar` at `<= 960px`, off-canvas drawer with backdrop, auto-closing on link selection or ESC press.

## Validation performed
- Verified syntax of `student-nav.js` with `node -c`.
- Verified inline JavaScript parsing of `student-dashboard.html` and `supplemental-practice.html`.
- Verified balanced container elements (`.portal-layout`, `.portal-sidebar`, `.portal-main`, `.portal-mobile-bar`).
- Verified `git diff supplemental-practice.html` to confirm questions block (lines 199–1708) is completely untouched.
- Checked color contrast, keyboard accessibility (skip-link, tab focus rings, ESC key handling), and responsive breakpoints.

## Manual steps required
- None. No database schema changes, migrations, or third-party service updates needed.

## Handoff / remaining work
- When student question bookmarking/notes ("Notes") is prioritized:
  1. Create a Supabase table `student_question_notes` with `student_id` RLS.
  2. Add note-taking capability in `ExamUI`.
  3. Wire into a new QBank nav item `nav-item-notes`.

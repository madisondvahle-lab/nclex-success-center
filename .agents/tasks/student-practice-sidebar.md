# AI / Human Task Handoff: Student QBank Navigation Sidebar & Gap Analysis

## Task
Build the responsive student practice navigation shell (sidebar + mobile drawer) inspired by nursing school QBank platforms, wire it exclusively to existing student features without placeholder routes, and document gaps for features that do not yet exist.

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
| **QBank -> Create Test** | **GAP.** Practice sets are currently assigned by Madison by course exam (e.g. NUR 321 Exam 2) or mixed NCLEX review sets. An arbitrary multi-topic student custom test builder does not yet exist. | **Omitted from sidebar.** Implementing an arbitrary test builder requires backend queries, topic multi-select UI, and question selection rules without exposing unpublished items. |
| **QBank -> Previous Tests** | Exists as **Recent quiz scores** (`student_supplemental_practice_results`) and **CAT / Readiness trend** (`student_assessment_uploads`). | **Wired directly.** Direct anchors to `#previous-tests`. |
| **QBank -> Performance** | Exists as **Recent quiz scores** (Nursing) and **Category Breakdown & CAT trend** (NCLEX). | **Wired directly.** Direct anchors to `#performance`. |
| **QBank -> Search** | **GAP.** Existing search pages (`question-bank-review.html`, `madison-questions.html`) are administrative tutor tools that expose answer keys, rationales, and full answer sets. | **Omitted from sidebar.** Exposing administrative search to students would compromise the question bank and NCLEX practice integrity. A student question search would require a separate RLS-protected endpoint stripping answer keys. |
| **QBank -> Notes** | **GAP.** No student-facing saved notes or bookmarking system currently exists in the database schema or UI. | **Omitted from sidebar.** Requires schema additions (`student_question_notes` or `student_study_notes` table with student RLS) before exposing in navigation. |

## Current state / context
- The branch is `madisondvahle-lab-student-qbank-sidebar`.
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
- When student test generation ("Create Test") is prioritized:
  1. Build a custom test configuration modal/page supporting topic multi-select, question count, and timer options.
  2. Wire into a new QBank nav item `nav-item-create-test`.
- When student question bookmarking/notes ("Notes") is prioritized:
  1. Create a Supabase table `student_question_notes` with `student_id` RLS.
  2. Add note-taking capability in `ExamUI`.
  3. Wire into a new QBank nav item `nav-item-notes`.

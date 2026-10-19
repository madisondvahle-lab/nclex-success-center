# Current Project Status

Last reviewed: August 26, 2026

This file describes the current intended state of the NCLEX Success Center.
When it conflicts with historical commits, legacy files, or an older curriculum catalog, use this file unless the task explicitly says otherwise.

## Current curriculum

| Module | Topic | Current status |
| ------ | ----- | -------------- |
| M1 | Newborn Care | Current implementation present |
| M2 | Maternal & OB | Current implementation present |
| M3 | Pharmacology | Current guide implementation present |
| M4 | Cardiac | Current guide implementation present |
| M5 | Respiratory | Current guide implementation present |
| M6 | Endocrine | Current guide implementation present |
| M7 | EKG / Rhythm Recognition | Current implementation present in `module7-ekg.html` |
| M8+ | TBD | Do not infer future numbering without explicit approval |

## Current module files

Authoritative current module files presently include:

- `module1-newborn.html`
- `module1-guide.html`
- `module2-maternal.html`
- `module2-guide.html`
- `module2-studyguide.html`
- `module3-guide.html`
- `module4-guide.html`
- `module5-guide.html`
- `module6-guide.html`
- `module7-ekg.html`

Supporting infographic and asset files may also exist.

Files with names such as `.pre-*`, backups, historical copies, or archived recovery files are not automatically authoritative. Inspect the current implementation before making changes.

## Module 7 — EKG / Rhythm Recognition

M7 is now assigned to EKG / Rhythm Recognition.

Current implementation:

- Primary file: `module7-ekg.html`
- EKG asset directory: `assets/ekg/`
- A pre-strip backup may exist as `module7-ekg.pre-strips.html`
- Do not rename or renumber M7 without explicit approval.
- Preserve the established Success Center module design and navigation patterns.
- Clinical EKG content changes must follow `.agents/CLINICAL-STANDARDS.md`.

## Historical curriculum warning

Previous repository versions used different module numbering, including Fluids & Electrolytes as M6 and Endocrine at a later module number.

Those historical assignments are NOT current curriculum authority.

Current numbering is:

M1 Newborn  
M2 Maternal & OB  
M3 Pharmacology  
M4 Cardiac  
M5 Respiratory  
M6 Endocrine  
M7 EKG / Rhythm Recognition

Do not restore historical numbering unless explicitly instructed.

## M3-M5 recovery history

M3-M5 were previously recovered and sanitized from verified repository history.

Older task files and draft PR notes may describe activation blockers that were accurate during the recovery phase. Treat those documents as historical context unless the current repository, Supabase state, or an active handoff confirms the blocker still exists.

Do not undo current working implementations merely to match an older recovery document.

## Known implementation considerations

- `supabase-module3-safe-placeholder-migration.sql` exists from the M3 recovery/assignment cleanup work.
- `supabase-core-rn-module-catalog.sql` exists and may affect module catalog state.
- Student module access is driven through Supabase and `student_module_access`.
- Guide presence on disk does not by itself prove every quiz, catalog entry, or student assignment path is enabled.
- Inspect the current code and Supabase state before changing access behavior.
- Do not use old recovery notes as proof that a current module is disabled.
- Do not expose internal admin tools as student-facing guide or quiz URLs.

## Current architecture snapshot

### Student access

The current architecture uses Supabase Auth, authenticated student-specific access, and Row Level Security.

Legacy browser PIN systems and historical public hub implementations are not authoritative.

### Module availability

Student module access is driven through the Supabase module catalog and `student_module_access`.

Do not assume a historical static module array or old SQL migration represents the live state.

Before changing assignment behavior, inspect:

1. Current module catalog configuration
2. `student_module_access`
3. Current assignment UI/code
4. Existing Supabase/RLS behavior

### Diagnostic / CAT

The repository contains an adaptive NCLEX-style readiness/CAT system with a large question bank, core-safety blueprint logic, mock CAT behavior, and assessment-history personalization.

It is an educational readiness tool, not the official NCLEX CAT.

CAT selection (`nclex`, `mock`, and readiness `assessment` modes) now reads
the authenticated student's saved item responses across prior attempts.
Case-study child IDs map to their selectable parent using the item-key table.
Unused items take priority only within the existing selection score tolerance,
after required-topic, category, and difficulty ranking; previously answered
items remain eligible when needed. Current-attempt duplicates remain excluded.
This requires deployment of the `diagnostic-assessment` Edge Function, including
its shared history helper; no schema migration or historical-data update is
needed. A branch or pull request alone does not update the live CAT.

### Admin

Admin functionality is distributed across secure tools for assignments, assessment history, shared progress, student management, and question-bank review.

Do not assume one historical admin HTML file represents the complete current admin system.

## Clinical content

Before changing:

- nursing facts
- NCLEX teaching
- questions
- answer choices
- rationales
- EKG interpretation
- medication guidance
- priority/delegation logic

read `.agents/CLINICAL-STANDARDS.md`.

Technical work does not authorize clinical rewriting.

## Multi-agent coordination

Multiple AI agents may work on this repository concurrently.

Before starting substantial work:

1. Read `AGENTS.md`.
2. Read this file.
3. Read `.agents/PROJECT.md` when architecture is relevant.
4. Read `.agents/CLINICAL-STANDARDS.md` for clinical work.
5. Inspect `.agents/tasks/` for an active handoff.
6. Inspect current repository files before editing.
7. Keep the task tightly scoped.
8. Do not modify another agent's active work unless the task requires it.

For substantial work, create or update a task handoff in `.agents/tasks/`.

## Current priority

Continue building and refining the current Success Center without regressing existing modules.

Immediate work should use the current M1-M7 curriculum as authoritative.

M7 is EKG / Rhythm Recognition.

Future modules M8+ remain unassigned until explicitly defined.

## Consult diagnostic
`madison-diagnostic.html` (tutor-only) added with shared `exam-ui.*` engine; see `.agents/tasks/consult-diagnostic.md`.

## Consult profile merge
The Admin home Prospects section includes the admin-only merge workflow for duplicate `consult_intakes` profiles. The atomic `merge_consult_intakes` RPC moves CPR attempts, uploaded-report metadata, consult-prep resources, diagnostics, and consultation links while preserving the duplicate profile/resource details in a restricted audit snapshot. It refuses profiles linked to different student accounts. Apply `supabase-consult-intake-merge-migration.sql` after its listed prerequisites before using the workflow; see `.agents/tasks/consult-intake-merge.md`. The legacy `madison-leads.html` route redirects to Admin home; student-account merging and multiple-CPR-file uploads are not part of this workflow.

## Question bank management and flags
The master `questions` table now has `item_type`/`item_data` (SATA, bowtie, case), `question_no` (Q-0001 numbering) and a `question_flags` table (student reports and 'discuss' flags). `question-bank-review.html` manages the bank (bulk actions, edit, flagged inboxes). Details and the SQL files to run are in `.agents/tasks/consult-diagnostic.md`. Deployment is unchanged: GitHub Pages from `main`.
- NCLEX student practice in `supplemental-practice.html` offers independent Tutor feedback and elapsed-time toggles, question-history filters, question counts, Traditional (MCQ) or Next Gen (SATA), and focus views for broad Study Areas or NCLEX Client Needs. It prioritizes unused questions and no longer lets students select difficulty. Other NGN types are not included. Core-Safe CAT and SWM-CAT withhold rationales until the results review.
- Student question-bank access uses the authenticated SELECT policy in `supabase-questions-student-read-rls-fix.sql` (applied live 2026-10-16); students can read active rows only, while the existing admin policy continues to govern inactive questions and management. After publishing the audited 25-item SATA pilot, verified as the authenticated role: 433 active MCQs and 62 active SATA items are readable. All 25 pilot questions are active, published, and Study Area-tagged.
- `supplemental-practice.html` has legacy inline sets outside the master bank. `supabase-legacy-practice-sets-qbank-migration.sql` moves the four sets shown in the NCLEX assigned-review list (Safety & Priority, Medication & Procedure Safety, NGN Acute Care Judgment, and NUR 215 Foundations: 75 questions, including 9 SATA) into `questions`, reusing exact existing matches (activating inactive matches as approved by the user) and linking set membership through `question_set_items`. The SQL was applied successfully on 2026-10-16; Supabase returned the expected set counts of 5, 5, 5, and 60. The page now loads those sets from the bank while preserving legacy question IDs in practice history. Other embedded sets are unchanged. Weekly assignments use frozen `question_ids`, and nursing course/exam practice queries `questions` by `course_key` and `exam_key`.
- Student custom practice and tutor Mixed NCLEX Review assignments support eight broad Study Area filters while retaining optional NCLEX category and topic filters. `supabase-question-study-areas-migration.sql` mapped 441 existing questions. On 2026-10-16, 28 additional existing SATA questions were revised in place, assigned Study Areas, and activated; the mixed/category/topic builder now supports MCQ and SATA. After publication of the 25-item SATA pilot, current active tagged counts are 92 Adult Health, 179 Maternal & Newborn, 13 Pediatrics, 29 Mental Health, 54 Pharmacology & Medication Safety, 30 Fundamentals/Safety, 83 Leadership, and 14 Health Promotion. One active MCQ remains untagged. See `.agents/tasks/study-area-filters.md`.
- Ideas not yet built: weekly per-client report with chart, admin "Needs attention" list, shared category names across CPR/practice/diagnostic, link CPR tracker to client records, hide/redirect `diagnostic.html?mode=mock`.

## Student CAT logging (Phase 9)
- `student-dashboard.html` "Log a CAT or readiness exam" card: PDF (pdf.js) or image (Tesseract.js) is read in the browser by `assessment-import.js` (UWorld table parser, generic "Category NN%" fallback), shown on a confirm form, then saved to `student_assessment_uploads` + `student_assessment_categories` (question counts in `total_count`).
- `shared-progress.html` timeline upload also reads one CAT/readiness PDF or image at a time in-browser, previews extracted scores, then saves recognized overall and category scores with the uploaded report. Admins can use **Read CAT scores** on an existing CAT/readiness timeline report that has no category scores. Batch uploads remain attachment-only.
- Requires `supabase-student-score-entry.sql` (student INSERT policy on categories). Report files go to the private `assessment-reports` bucket; apply `supabase-assessment-report-storage-rls-fix.sql` to ensure student access checks use the storage object path.
- Admin workspace reads `total_count` as the per-category question count; counts under 5 are flagged low sample.
- Practice buttons on the student home use `supplemental-practice.html?mixed=10&cat=<name>`.
- Jitsi tutoring room removed (Zoom is used).

## Phase 10 – Report readers and graphics library
- `assessment-import.js`: Archer report parser (overall Classic/NGN only; no category %), `parseCPR` (strict: only fills when all 8 categories are confidently read), used by `madison-cpr.html` "Read it for me".
- Graphics library: `supabase-graphics-library.sql` (run it), `madison-graphics.html` (admin), `graphic.html` (viewer), searchable card on the student dashboard.
- Graphics library is shared: nursing-student hub also has the searchable card (`gfxn`) with a topic filter; one `graphics` table serves NCLEX and nursing students.

## Weekly study plans (step 1 of 4)
- `madison-study-plans.html` (admin "Weekly plans") sets each NCLEX student's weekly rhythm (default 3×50 Qs Mon/Wed/Fri + 2 spaced CATs Tue/Sat, platform) and focus categories; students see it read-only on `student-dashboard.html`.
- Admins can optionally override platform, task title, and instructions per CAT weekday. Students see those details on the recurring weekly plan and dated assignments. Platform presets include Remar and NurseMeg. `supabase-weekly-cat-details-migration.sql` is applied live (2026-10-16). The generator skips assignments on/after a student's NCLEX target date; student day changes preserve first/second CAT task settings.
- Data extends the existing `student_study_plans` table via `supabase-weekly-study-plan-migration.sql` (applied to live Supabase 2026-10-14; RLS verified). Shared logic: `weekly-plan.js`.
- Step 4: **Weekly review** section on the same page lists per-week completion (self-reported) and recorded results per NCLEX and nursing student (nursing rows are review-only), with Edit focus & plan and idempotent Assign next week; no migration (`weekly-review.js`). Steps 2–4 details: see `.agents/tasks/weekly-study-plans.md`.
- Students can now move their practice/CAT days in the weekly plan card, preserving tutor-assigned counts, platforms, and focus. `supabase-student-study-days-migration.sql` is applied live; owner-only RPC, stale-edit protection, read-only staff preview. Existing dated assignments stay fixed. The NCLEX practice banner, roadmap, and duplicate weekly-priorities panels are removed.

## Weekly assignments (step 2 of 4)
- Admin Weekly plans now generates one student's or all planned NCLEX students' dated practice/CAT assignments for a selected week, reusing `student_resources`; reruns preserve existing work and completion.
- Portal practice uses frozen active MCQ IDs matching saved focus; external platforms receive manual setup instructions. Students see due dates, mark completion, and portal practice completion follows score saving.
- `supabase-weekly-assignments-migration.sql` applied live 2026-10-14; admin/student/anon RLS and generation verified in rolled-back SQL tests. No questions or real assignments changed during validation.
- Step 3 dashboard reminders and step 4 Weekly review queue are live. Details, limits, and validation commands: `.agents/tasks/weekly-study-plans.md`.

## Student study calendar
- `student-dashboard.html` provides a shared month-grid calendar for NCLEX and nursing students. NCLEX students can set/update their next attempt date in the calendar (existing `update_my_nclex_target_date` RPC); nursing students use the class-specific exam-date controls. The grid shows weekly-plan repeats through the NCLEX target date, dated assignments, class exam dates, and scheduled tutoring appointments linked to the signed-in student.
- `study-calendar.js` builds local-calendar month grids and event lists. Dated work replaces the matching recurring NCLEX plan entry. Consultation details use a narrow student-scoped RPC; the consultation table remains admin-only.
- Admins can use the separate `madison-tutoring-sessions.html` page to open upcoming tutoring appointments and save private, session-specific notes on the consultation record. This applies to future and in-progress tutoring appointments; existing past appointments are not included in the new notes workflow.
- The NCLEX date is highlighted as **NCLEX EXAM DAY**, with a **BIG DAY** selected-day agenda. Recurring practice/CAT entries and newly generated assignments stop before that date. Previously generated assignments are preserved.
- Apply `supabase-student-calendar-consultations-migration.sql` after the Calendly consultations migration to enable student appointment display. Without it, the calendar still shows other events and reports appointment unavailability.
- Validation: `node --test tests/study-calendar.test.cjs`; dashboard inline-script parse and `git diff --check`.

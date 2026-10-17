# Consult diagnostic (tutor tool)

Status: deployed to main (GitHub Pages) and in use by the tutor. Verified in jsdom only; no agent has a real browser.

Files: `madison-diagnostic.html` (admin-gated page, start screen, results), `exam-ui.css` + `exam-ui.js` (reusable NCLEX-style exam engine: right-click strikethrough, Notes/Calculator/Feedback, NGN case tabs, matrix/cloze/highlight/SATA/fill), `consult-diagnostic-bank.js` (cd001-cd041 plus the 6-item heart-failure case `cdcase1`; each tagged category/topic/pattern/difficulty/rationale).

Facts:
- Items cd001-cd024 are original. cd025+ were added from the tutor's example screenshots (keys came from the tutor's screenshots; rationales were written by the agent and need tutor clinical review). Invented/guessed details: cd034 lab values, cd037 'pyloromyotomy' option.
- Question count 10/15/20/25/30 (picker max 30; bank is larger) is selectable (case study included at 20+, topics balanced).
- Optional save: pick a consultation, then 'Save to student profile' writes to `consult_diagnostic_results` (admin-only RLS). REQUIRES running `supabase-consult-diagnostic-migration.sql` first. With no consultation selected nothing is stored.
- Not yet surfaced on shared-progress.html next to CPR reports; saved results show on the diagnostic page per consult. Follow-up.
- Bank is a public static JS file, so answer keys are visible in source (same as existing banks).
- Results are discussion prompts, not an NCLEX score or pass prediction.
- Arial in exam-ui.css is intentional to match the testing interface.
- Follow-up: restyle the rest of the platform (diagnostic.html and module quizzes) onto exam-ui.css/js incrementally. Not done.
- Clinical content should get tutor review before real consults.

## Phase 2: student practice in the exam look
- `supplemental-practice.html` now runs every set (assigned sets, Mixed Review from the `questions` table, course exam practice) in `ExamUI` via `beginPractice()`; the classic renderer remains as fallback.
- `exam-ui.js` gained `instant: true` (Check answer -> correctness + rationale, answer locks) and `noFeedback: true` (hides the tutor Feedback tool for students).
- `exam-adapters.js` maps practice-set questions to ExamUI entries (intro + following questions become a case study). Wording, answers and IDs are untouched. Result saving (`saveResult`) is unchanged.
- Pre-existing quirk left alone: scenario 'intro' rows count in the total, which lowers the displayed % on the case-study set.
- Next: module quizzes (module7-ekg-quiz.html first), then module guides, then diagnostic.html. Consult items are not in the `questions` table (it only supports 4-option single-answer); SATA/NGN storage needs a schema decision.

## Phase 3: bowtie item type
- `exam-ui.js` supports `type:'bowtie'` (tap-to-place, 5 points; two actions and two complications are order-independent). Bank items cd037 (pyloric stenosis) and cd038 (osteomyelitis).

## Phase 4: master question bank management (question-bank-review.html)
Admin page now has: live-bank list with filter/search/select-all and bulk Publish / Make inactive / Delete forever; per-row Edit form (MCQ options, SATA options/keys; bowtie/case wording only); select-all for legacy import review; a button that imports the consult diagnostic bank as inactive drafts (`source_key` = `consult-<id>`).
Migrations the tutor has run (all in repo root): `supabase-question-item-types.sql` (`item_type`, `item_data`; option/answer columns nullable), `supabase-question-numbers.sql` (`question_no`, shown as Q-0001), `supabase-question-flags.sql` + `supabase-question-flags-discuss.sql` (`question_flags` with `kind` = report|discuss).
- Student practice (`supplemental-practice.html`) only reads single-answer rows, so SATA/bowtie/case rows in `questions` are ignored there until the exam player is wired to `item_data`.
- Students flag questions from the ExamUI top bar ("Flag question", option `onFlag`; signed-in students only, currently only in supplemental-practice). Reports and discuss flags appear in separate inboxes on the Question bank page; discuss flags also show per student on `shared-progress.html` (admin only, card `#discuss-card`).

## Controlled bulk question import (implementation branch)
`question-bank-review.html` adds a JSON intake path for 25–50 items. It validates required NCLEX category, topic, clinical-judgment skill, difficulty, references, full rationale and option rationales; MCQs require four choices and one letter key, while NGN items require a non-empty `item_data` object. It compares stems with the complete bank and flags exact/near overlaps. Clear, structurally valid items can be marked reviewed together; flagged overlaps still require individual review. Optional per-item review remains available. Inserts are inactive and append-only. In **Manage questions**, matching imported rows are grouped by batch for one **Approve batch** action and a separate **Publish batch to students** action. Approval never activates questions, and the bulk publish action still enforces approval.

Before using it, run `supabase-question-bulk-import.sql` after the question-bank-review and item-type migrations. It adds `clinical_judgment_skill`, `option_rationales`, `reference_list`, supporting indexes, and the `approved` review status without changing existing question IDs/content/history. The admin page now pages through the bank and review records in 500-row batches rather than stopping at 1,000.

Batch JSON is either an array or `{ "items": [...] }`. Each item uses `id`, `stem`, `item_type`, `difficulty`, `nclex_category`, `topic`, `clinical_judgment_skill`, `rationale`, `option_rationales`, and `references` (`[{ "title": "...", "url": "https://..." }]`). MCQ items also provide `options` (four strings) and `correct_answer` (`a`–`d`); NGN items provide their full structure in `item_data`. New imports only—do not use the intake path to overwrite audited questions or submit the unapproved replacement drafts from PR #143.

Edits to existing numbered or active questions now create `question_revision_drafts`; they do not change the live row. Admins compare original/proposed content, approve or reject, and only then apply an approved revision. The apply RPC locks the existing question and rejects stale drafts if any tracked content changed after proposal. It updates the same UUID and leaves `question_no`, `module_key`, active state, assignments, and student responses intact. Direct browser table writes remain insert-only, and deletion of a question with revision history is restricted.

### Reopening correction drafts
Apply `supabase-question-revision-edit.sql` after the bulk-import migration
(applied live October 14, 2026). Reopening an existing question loads its open
correction's proposed fields and reason rather than the original bank values.
The correction list also has **Edit correction draft**. Saving an existing
correction uses an admin-only RPC to update the same draft, preserving its base
snapshot and leaving the question untouched. Editing an approved correction
clears approval and returns it to pending review. Expected proposal time and
status prevent stale edits; failures keep the unsaved form open. New corrections
still insert once, with double-submit protection.

Validation: `node --test tests/question-revision-edit.test.cjs` and
`supabase db query --linked --file tests/question-revision-edit.sql`.
The SQL test rolls back all draft/review changes and checks base preservation,
fresh approval, stale/closed draft rejection, admin-only permission, and unchanged
live question content. The migration adds a function only; no clinical content
or existing drafts were persistently modified during implementation.

The student Mixed Review query also pages active question records in batches of 500 so newly published MCQs remain discoverable beyond 1,000 rows. The existing practice renderer still filters to single-answer questions; NGN rendering/scoring remains a separate follow-up.

## Phase 5: assessments / workspace (context)
- Two stores: `student_assessment_uploads` and `external_assessments` (Assessments page); the workspace merges both. Admin can delete a report from the workspace, and an entry from the Assessments page (roster cards are clickable).
- Student dashboard has a weekly CAT trend card (`renderCatTrend`, reads `external_assessments`).
- CAT/readiness platform grouping in `student-dashboard.html` and `shared-progress.html` uses `assessment-platforms.js` for case/whitespace identity and known display names (for example, UWorld). Unknown names stay distinct except for case/whitespace; no stored records are rewritten. Saves select the saved platform and reveal its CAT series if Practice only was selected. Student saves await refresh and distinguish refresh errors from save failures. Regression command: `node --test tests/assessment-platforms.test.cjs tests/student-nav.test.cjs`. Publish both HTML files and the helper together via the authorized GitHub Pages `main`/root deployment; no SQL migration is needed.
- Admin home links to a single student workspace with assignments, progress, CAT/readiness data, reports, portal assessment attempts, supplemental practice, and private notes; the activity section combines in-house assessment attempts and supplemental practice results.
- Shared-guidance/coach-review card and priority map were removed/hidden; private session notes kept.

## Next
- Wire ExamUI to master-bank `item_data` for student practice; restyle module quizzes (module7-ekg-quiz.html first), module guides, diagnostic.html.
- Show consult diagnostic results on the student workspace; add Flag button to consult/quiz pages.

## Update (PRs #113-#119)
See `.agents/STATUS.md` Phase 6 for CPR tracker, client overview, This week card, Bianca NUR 215 page and modal fix.

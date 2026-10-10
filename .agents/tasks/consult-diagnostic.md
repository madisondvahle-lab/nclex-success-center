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

## Phase 5: assessments / workspace (context)
- Two stores: `student_assessment_uploads` and `external_assessments` (Assessments page); the workspace merges both. Admin can delete a report from the workspace, and an entry from the Assessments page (roster cards are clickable).
- Student dashboard has a weekly CAT trend card (`renderCatTrend`, reads `external_assessments`).
- Shared-guidance/coach-review card and priority map were removed/hidden; private session notes kept.

## Next
- Wire ExamUI to master-bank `item_data` for student practice; restyle module quizzes (module7-ekg-quiz.html first), module guides, diagnostic.html.
- Show consult diagnostic results on the student workspace; add Flag button to consult/quiz pages.

## Update (PRs #113-#119)
See `.agents/STATUS.md` Phase 6 for CPR tracker, client overview, This week card, Bianca NUR 215 page and modal fix.

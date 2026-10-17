# NCLEX Study Area Filters

## Status

The user reports running the Study Area migration. The result has not been independently verified in this workspace. Student and tutor UI changes are implemented locally and awaiting deployment.

## Confirmed scope

- Use the eight approved Study Areas in student custom practice and tutor Mixed NCLEX Review assignments.
- Keep official NCLEX categories and specific topic filters available as optional narrowing.
- Preserve existing question content, IDs, answers, rationales, and practice history.
- Do not modify weekly-plan targeting or add performance-based automation.
- The user will run the Supabase migration; do not deploy before the migration is ready and the user requests deployment.

## Current changes

- `study-area-names.js`: canonical labels and validation.
- `question-bank-selection.js`: Study Area filtering intersects with category, topic, and difficulty.
- `supplemental-practice.html`: Study Area builder filters and assigned `area` URL parameter support.
- `madison-assignments.html`: optional Study Area selection, saved assignment URL parameters, and restoration on student selection.
- `tests/practice-question-selection.test.cjs`: filter, URL, and inline-script coverage.

## Approved mapping and migration

- The user approved a reconstructed mapping from the five original exports: 441 unique active question numbers (432 MCQs, 9 SATA).
- Approved totals: 64 Adult Health / Medical-Surgical; 172 Maternal & Newborn; 11 Pediatrics; 29 Mental Health; 47 Pharmacology & Medication Safety; 25 Fundamentals, Safety & Infection Control; 82 Leadership & Professional Practice; 11 Health Promotion & Maintenance.
- The approved crossover decisions are included: Q-0093 and Q-0040 → Mental Health; Q-0988 → Fundamentals; Q-1001 → Adult Health.
- `supabase-question-study-areas-migration.sql` adds `questions.study_area`, validates every expected question number, active state, and item type before updating, and is safe to rerun without overwriting conflicting tags.
- The user reports running the migration in Supabase. Confirm the schema is available in the deployed app after Pages publishes.

## Validation

- `node --test tests/practice-question-selection.test.cjs`: 9 passed, including mapping coverage/type/count checks and inline-script parsing.
- `git diff --check`: passed.
- Impeccable detector reported a low-confidence page-level `flat-type-hierarchy` warning at `madison-assignments.html:13`. The new Study Area text was aligned to the existing 14px scale; the broader pre-existing type hierarchy was left unchanged to avoid unrelated admin-page redesign.

## Practice builder follow-up (pending deployment)

- `supplemental-practice.html` now has an original, UWorld-inspired student test builder using the portal's existing visual language. It offers Tutor or Timed mode, question count, Traditional (MCQ) or Next Gen (SATA), question-history modes, and two focus views: Study Areas and NCLEX Client Needs. It does not add a Systems taxonomy or expose difficulty selection.
- Timed mode uses the existing elapsed-time clock, does not auto-submit, and delays answer feedback until the set is complete. Tutor mode keeps immediate feedback.
- New bank-practice sessions prioritize questions with no saved practice attempt; previously practiced eligible items fill the set only after unused items run short. Latest attempt state powers Correct, Incorrect, Omitted, and Marked filters. Mark-for-review state is saved in the existing `answer_details` JSON; no schema change is required.
- A new set is offered only when detailed practice history saves successfully, so a failed save cannot silently make the next set repeat the same questions.
- Validation: `node --test tests/practice-question-selection.test.cjs`; `git diff --check`.

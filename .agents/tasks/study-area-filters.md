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

# Module 3 Recovery Handoff

## Task
Recover Module 3 Pharmacology from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module3-guide.html` blob SHA: `22362b0f45ff41e3ceeac273e7fc1fb9b1f9f65a`.
- Branch `restore/m3-verbatim` currently restores that exact blob at `module3-guide.html`.
- No clinical wording, questions, answers, rationales, or IDs were changed in the recovery commit.
- Do NOT merge the restored file directly to main yet. The historical page predates current secure student access and must be adapted before student assignment is re-enabled.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or question IDs.
- [ ] Clinical editing is authorized.

## Required next work
1. Inspect the restored historical M3 guide and identify legacy navigation/authentication/result-saving behavior.
2. Preserve useful educational and question content verbatim.
3. Adapt only technical access/navigation/result-saving behavior to current Supabase Auth/RLS architecture.
4. Keep the internal Question Bank Manager separate from the student module.
5. Validate the student-facing page and only then restore M3 to the module catalog/assignment UI.
6. Update `.agents/STATUS.md` when M3 becomes safely assignable.

## Acceptance criteria
- Student M3 never links to `question-bank.html` or another admin/internal tool.
- Current Supabase Auth/RLS protections are not weakened.
- Historical clinical content is not silently rewritten during recovery.
- Existing M3 access rows may be preserved.
- New M3 assignment stays disabled until the student-facing implementation is ready.

## Manual step already pending from prior cleanup
Run `supabase-module3-safe-placeholder-migration.sql` once in Supabase SQL Editor to clear legacy `question-bank.html` M3 guide/quiz URLs while preserving access rows.

## Risks / unresolved items
- The historical page is large and includes embedded teaching content and practice questions.
- Its old client-side behavior may not be compatible with current authentication, results, or dashboard architecture.
- Do not solve those incompatibilities by restoring obsolete PIN/public access patterns.

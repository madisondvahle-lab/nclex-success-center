# Bianca NUR 235 Test 2 — Version 2 Release Assets

**Release state:** Prepared for review only. This change is not merged or
deployed and does not update Bianca's assignment, redirect the original exam,
or modify existing results.

## Versioned assets

- Page: `bianca-nur235-test2-2026-v2.html`
- Bank: `bianca-nur235-test2-2026-v2-bank.json`
- Result key: `bianca-nur235-test2-2026-v2`
- Bank version: `2.0.0`

The bank was retrieved from the validated candidate in PR #254. It retains
the original 100 question IDs and the 70 single-select / 30 SATA structure.
Its difficulty labels are 48 moderate and 52 challenging, matching the final
question records (the previous proposal metadata had stale difficulty totals).
The new page uses the existing exam UI and scorer, loads the versioned bank,
keeps tutor and exam modes, exposes correct-answer and option-specific
rationales, and defaults to all questions matching the selected filters
(initially all 100). A smaller count remains selectable. New results use the
new practice key and do not combine with previous result rows keyed to the
flawed exam.

## Validation completed

The focused release test is:

```sh
node --test tests/bianca-nur235-test2-v2.test.cjs
```

It checks IDs and distribution, answer-key/rationale mappings, every MCQ and
SATA key against the shared scorer, incorrect and incomplete/extra response
behavior, versioned bank/result-key isolation, rationale wiring, tutor/exam
modes, and Q047's corrected key.

Local browser validation was performed from a loopback-only static server;
Supabase requests were blocked and no production result was submitted. The
page loaded the v2 bank, displayed 100 matches with `All 100` selected, and
started a 100-question tutor session. A correctly answered MCQ and an exact
four-choice SATA response each displayed the correct result, correct-answer
rationale, per-option rationales, and clinical-reasoning guidance. A
10-question exam-mode run completed and displayed end-of-exam review with
correct answers, the selected response, and rationales. The release PR does
not alter the production assignment or dashboard; verifying Bianca's live
dashboard link requires the separately approved deployment and exact-row
assignment update below.

## Approval-gated production sequence

This PR intentionally does not update the existing assignment, old exam URL,
or production database. After separate explicit release approval:

1. Merge/deploy the versioned page and bank without redirecting the old page.
2. Independently verify the deployed versioned page loads 100 questions,
   defaults to all 100, preserves MCQ and exact-set SATA scoring, shows
   rationales in tutor mode and end-of-exam review, and writes only the v2
   result key. Use a controlled test identity or a non-production test; do not
   create a misleading Bianca result.
3. Update only Bianca's existing NUR 235 `student_resources` record, selected
   by exact student ID and existing URL. Change only its `url` to
   `bianca-nur235-test2-2026-v2.html` (and title only if separately approved
   as necessary). Preserve the row ID, due date, note, status/completion
   fields, all other resources, and all other students.
4. Verify the student dashboard links to the v2 page, that Bianca can open it,
   and that her other assigned resources remain unchanged.
5. Only after those checks succeed, redirect the old
   `bianca-nur235-test2.html` route to the revised page so an old bookmark
   cannot start the flawed version. Do not remove or overwrite the old bank
   during this release; keep the original page and bank recoverable in Git for
   rollback. The old route must not redirect before the v2 page and assignment
   update have both been verified.

If release verification fails before assignment update, leave the old
assignment untouched and fix or remove the v2 release assets. If the
assignment has been updated but rollback is required, pause/withdraw the
v2 link, restore the original assignment URL by an exact-row update, and
verify dashboard access before any additional redirect action. Never delete
or rewrite historical results.

## Prior results and reporting limitation

New attempts use `bianca-nur235-test2-2026-v2`, keeping them separate from the
old key `bianca-nur235-test2-100`. No historical score is imported into the
corrected assessment. No result rows should be deleted or rewritten.

The admin assignment-activity matcher currently uses title-token overlap,
which can attribute another practice set's results to the NUR 235 assignment.
The observed “2 attempts” summary therefore is not reliable evidence of
NUR-235-specific attempts. The practice activity list showed NUR 215 records;
an exact old-key result was not confirmed in the read-only UI. Abandoned
in-progress work is stored in browser session storage and cannot be verified
as a server attempt. Correct per-assignment reporting or marking legacy rows
superseded requires a separate, narrowly scoped, auditable change and is not
included here.

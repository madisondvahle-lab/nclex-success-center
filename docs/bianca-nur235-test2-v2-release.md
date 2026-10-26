# Bianca NUR 235 Test 2 — Version 2 Release Assets

**Release state:** V2 is deployed from PR #255. Bianca's existing NUR 235
assignment now points to v2. The old URL redirect is proposed separately in
the legacy-retirement release; no historical results were modified.

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
correct answers, the selected response, and rationales. Live verification
confirmed the deployed page, assignment, and dashboard after the approved
production update. No test result was written.

## Production deployment and rollback

After explicit release approval, the following steps were completed:

1. PR #255 was merged and the versioned page and bank deployed without
   redirecting the old page.
2. The live page loaded all 100 questions with All 100 selected. A keyed MCQ
   and exact-set SATA response each scored correctly and displayed the overall
   and per-option rationales. Supabase result writes were blocked; no Bianca
   result was created.
3. Only the `url` on Bianca's existing NUR 235 `student_resources` record
   was updated to `bianca-nur235-test2-2026-v2.html`. Its row ID, resource
   type, title, and due date were preserved; the row has no status field. The
   NUR 215 resource and URL were unchanged.
4. Bianca's student-dashboard preview linked NUR 235 to v2 and NUR 215 to
   `bianca-nur215.html`.
5. The separately proposed legacy-retirement release redirects
   `bianca-nur235-test2.html` to v2. It retains the old exam source and does
   not delete or overwrite the legacy bank. Deployment is gated on its own
   protected workflow succeeding.

If the legacy-retirement deployment fails, the assignment remains linked to
the live v2 exam. If the corrected exam must be rolled back after retirement,
first revert the legacy redirect through the protected GitHub workflow and
verify the original URL is restored, then restore the assignment URL to
`bianca-nur235-test2.html` by an exact-row update and verify dashboard access.
The original bank and page remain in Git. Never delete or rewrite historical
results.

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

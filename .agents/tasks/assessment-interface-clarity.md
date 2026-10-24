# Assessment interface clarity - local candidate

## Approved release reconciliation (October 24, 2026 UTC)

The owner approved release and then explicitly approved reconciliation with
new production main `87725f15aa2e34937a8a253c00998194a04a8b95` (PR #243).
Release branch `release/assessment-interface-clarity` reapplies original
`0ee5c5b` as `9c25fb22c5ea3b88ebe82077e09b4b9709c02613`, without conflicts.
All seven original candidate files are identical before this documentation
update; the six booking/routing release files are unchanged from current main.
No MCQ work, server, scoring, persistence, blueprint or question-bank changes
are included.

Reconciled validation: **309 tests passed**, zero failures/skips. This includes
the original 305 and four added baseline booking regressions. Deno type-check
of the unchanged CAT endpoint passes using the existing cached Deno tooling;
JavaScript syntax and whitespace checks pass. All 29 local browser scenarios
pass again with zero page errors/production Supabase requests.

Read-only production preflight: CAT version 8 ACTIVE, JWT verification true,
new NGN admission secret digest matches false; latest Pages build/main remains
`87725f15`. Active Protect Main ruleset requires a PR, disallows deletions and
force pushes, and has no bypass actors. No protection changes are authorized.

Proceed through protected PR workflow, then verify the matching live assets,
mode URLs and no-write display/history checks. No production test attempts,
submissions, records or schema/function changes are authorized.

## Scope and isolation

Prepared on `fix/assessment-interface-clarity` from deployed main
`d916e8d0e2e470e445645ebaba9cccc73060162c`. Local only: no push, PR,
merge, deployment, database writes, eligibility changes or NGN admission changes.
Production remains GitHub Pages main/root at `portal.studywithmadison.com`,
with CAT server version 8/JWT verification enabled and new NGN admissions off.

The separate `fix/mcq-presentation` worktree remains based on the same deployed
commit. Its MCQ implementation is pending; it is not included or validated as
part of this interface candidate. Original SATA/NGN branches remain untouched.

## Implementation

- Names: Adaptive Practice, Short Adaptive Assessment, Full-Length Adaptive
  Mock, Targeted Remediation Practice, Initial Baseline Assessment.
- All supported `mode` URLs preselect the existing internal mode. Unknown
  values fall back to practice. The baseline route retains both existing
  frontend stage restriction and unchanged server authorization.
- Short results display Above/Below Study Benchmark for saved PASS/FAIL.
  Neither the raw server result nor historical records are changed.
- Missing/unsupported classifications display Insufficient Evidence. Removed
  the result-screen fallback that inferred a classification from 75% correct;
  it never changes the stored outcome, threshold or scoring calculation.
- Full mock retains its underlying PASS/FAIL with explicit educational-only,
  non-predictive wording. Short results have the same limitation disclosure.
- Completion copy consumes the server's existing completionReason. Legacy
  early completions have an explicitly unknown reason; no pool exhaustion or
  confidence stop is invented. Question-pool limits are disclosed at setup.
- Remediation description matches separate-bank, optional focus and recorded
  external-category personalization. Displayed length follows the existing
  shared question-count state; no count control/behavior is changed.
- Responsive mode cards, keyboard-visible focus and selection state.
- Activity history uses new display names; stored names and legacy platform
  identities used to group historical trend charts remain unchanged.

Runtime files: `diagnostic.html`, `shared-progress.html`, `assessment-display.js`.
Tests: `tests/assessment-display.test.cjs`,
`tests/assessment-interface.browser.js`,
`tests/fixtures/assessment-interface-browser.js`.

No server, migration, persistence wrapper, option-identity helper, scorer,
question bank or blueprint changes. No question text/keys or student records
were changed. No numerical CAT calculation or stopping rule was changed.

## Validation

- Full Node suite: 305 tests passed, zero failures/skips.
- Browser: 29 scenarios passed with actual local React screens and synthetic
  transport, at 1280px, 390px and 320px. All five mode URLs, answer/result flow,
  PASS and FAIL independent of percentage, missing NGN result/pool reason,
  unknown/default URLs, saved drafts/resumes without restart, authorized
  baseline, unauthorized-stage redirect and signed-out redirect.
- No browser page errors or production Supabase requests in the completed run.
  Native DOM activation exercised real browser event handlers because this
  integrated browser's pointer/stability driver stalled; this does not certify
  physical touch/pointer behavior on real devices.
- Fixture transport is restricted to localhost referrers and cleaned up in
  finally. Initial browser harness attempts failed from malformed synthetic
  history (interaction without NGN credit) and driver limitations; corrected
  fixtures passed. No application scoring fix was needed for those failures.
- History unit test preserves original saved title, mode, result and score.
  Existing hosted-baseline, cached-client, SATA, NGN, save/concurrency and
  stopping-rule regressions pass.
- Syntax and whitespace checks pass. No production assessment was created,
  submitted or reviewed with write operations. This is not a production
  authenticated end-to-end assessment run.

Reproduce Node:
`node --test tests/*.test.cjs tests/*.test.mjs supabase/functions/_shared/*.test.mjs supabase/functions/question-audit/*.test.mjs`

For browser checks serve this worktree on localhost:8768, open a local asset
page, load `tests/assessment-interface.browser.js` into a Playwright runner
and call `runAssessmentInterfaceBrowserChecks(page)`.

## Release recommendation and remaining limitations

1. Owner review and separate publication authorization.
2. Reconfirm current main and server baseline; apply only this UI candidate
   through protected PR checks. Publish HTML and display helper together.
   No server deployment or database migration is needed for this candidate.
3. Verify all mode URLs, assets, stage gates, historical display and resume
   read-only. Keep NGN admissions off.
4. Finish the separate MCQ candidate and server-first compatibility testing.
   Both touch assessment HTML, so reconcile UI hunks deliberately and rerun
   both suites; compatibility with an unfinished MCQ implementation is not
   claimed. Prefer releasing this independent UI correction first.

Old records do not always record completion reasons; no historical backfill
is proposed. The educational model remains uncalibrated to official NCLEX
outcomes. This change does not fix MCQ randomization, standalone persistence,
the practice-count issue, or other deferred features.

Rollback may restore prior UI only while retaining all combined-compatible
server, SATA/NGN scorer, renderer and option assets. Do not restore an
incompatible pre-combined server. New NGN admission requires separate approval.

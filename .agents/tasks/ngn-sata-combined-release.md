# Combined SATA presentation and Phase 2 CAT release candidate

## Approved staged production rollout (October 23, 2026)

The owner approved the staged release of `af7bd6c`, with NGN admissions kept
disabled. Runtime code is unchanged from that candidate. Latest production
main `2fec3b9` added only the PR #240 practice-day deployment documentation;
it was preserved in the release branch without changing any runtime file.
All individualized practice-day runtime files remain identical to main.

Server-first checkpoint completed:

- Hosted version 7 and frontend CAT hash matched the baseline below. The save
  RPC still matched corrected SHA-256 `53a7e5e58645c0bcb66eed412d58925e6635679a942bb2da08beac9024bfc386`,
  with the same owner, service-role-only grant, definer and search path.
- Full latest-baseline regression rerun: 262 passed.
- Deployed only `diagnostic-assessment`, now **version 8**, ACTIVE, JWT
  verification **true**. NGN admission-secret digest still matches `false`.
- Read back all six source modules using the Management API multipart response:
  every source byte matches the approved candidate. The CLI source downloader
  refuses root-level imported assets outside its extraction directory; no
  extraction guard was bypassed. Comparison was performed in memory instead.
  Handler SHA-256: `a4b839fce656c2e4f71d6ec46264b60ec7da0ed277a5fe59dc5ed6c8c3368026`.
- Authenticated production nonadmin session: 20 non-persistent resume requests,
  all five modes across legacy/SATA-only/NGN-only/combined capabilities, passed.
  This session has no saved attempts to review; no start/submission was made.
  Anonymous endpoint requests return 401.
- Aggregate fingerprints for questions, reviews, private CAT keys, attempts,
  responses, students and study plans are unchanged after installation.
  Existing four attempts/100 responses remain; zero NGN/identity attempts.
- Read-only schema-versioned reviewed NGN inventory: zero candidates.
  No question eligibility or activation changed.
- Frontend remained on `2fec3b9` during server verification; protected frontend
  PR/Pages publication is the next authorized checkpoint.

### Monitoring resolved through dashboard; frontend continuation approved

On October 24 at 00:49 UTC, the owner accepted monitoring clearance and
authorized completing PR #242 and publishing matching frontend assets, subject
to renewed baseline/check validation. Production write-based testing, new NGN
admissions, question activation and billing changes remain unauthorized.
The release remains server-first, with compatible version 8 retained.

On October 24, the owner signed into the shared Supabase dashboard. Read-only
dashboard log views successfully returned production records for the exact
window **2026-10-23 05:11:59 UTC through 2026-10-24 00:44:55.774 UTC**.
The deprecated public logging endpoint was not retried, and no internal
dashboard endpoint was called directly. Results were inspected through the
official dashboard's function and log collection views, including full-window
severity charts rather than relying on the latest 100-row previews.

| Collection | Full-window evidence |
| --- | --- |
| CAT invocations | 28 records, all version 8: 27 HTTP 200 and one HTTP 401; zero HTTP 5xx |
| CAT runtime | 54 records: 27 Boot and 27 Shutdown; zero warnings/errors |
| Postgres | 347 routine entries; zero WARNING/ERROR/FATAL/PANIC |
| PostgREST | 156 routine entries; zero warnings/errors |
| Auth | 86 informational entries, one warning, zero errors |

The HTTP 401 at 05:12:22.250 UTC matches the intentional anonymous rejection
check recorded during the deployment verification, not an authenticated CAT
failure. The auth warning at 14:48:56 UTC reports
`refresh_token_not_found` on POST `/token` (HTTP 400). It is an Auth
session-refresh event, not a CAT invocation, retrieval or save-RPC error;
no version 8 CAT failure is evidenced. The sampled predeployment Auth window
(October 23, 00:45:00 through 05:11:58 UTC) had 41 informational entries and
no warnings/errors. Therefore do not claim that this warning was demonstrably
preexisting or that its cause was conclusively established.

**Monitoring checkpoint cleared for the observed release stage.** These
records corroborate earlier authenticated read-only resume checks and isolated
integration tests; they do not prove live scoring/persistence workflows that
were deliberately not exercised. No production assessments, submissions,
scores or student records were created or changed for this inspection.

At monitoring clearance, fresh read-only checks showed version 8 ACTIVE, JWT
verification true, admission digest matching `false`, and PR #242
OPEN/draft/unmerged. The subsequent explicit approval above authorizes the
protected frontend workflow only. Recheck current main/server before merging;
keep admissions disabled and do not redeploy or roll back the compatible server.

The dashboard separately warns that the organization exceeded quota in the
previous billing cycle and projects may be restricted beginning November 15,
2026 if it remains over quota. This is an operational billing concern, not a
logged version 8 regression. The owner's reported upgrade was GitHub, not
Supabase; no Supabase plan change was assumed or made.

### Historical publication hold: monitoring access initially unavailable

Frontend release [PR #242](https://github.com/madisondvahle-lab/nclex-success-center/pull/242)
is prepared, not merged. No production frontend publication has occurred.
PR checks passed or were explicitly skipped; main's ruleset requires a PR and
does not prescribe additional required check names. Exact approved runtime,
latest-main preservation and Deno checks passed before the pause.

Post-installation error-log monitoring could not be established through the
Management API: `logs.all` returns HTTP 410, while its documented replacement
`logs` returns backend errors or rejects documented `source_name` fields.
These are monitoring/query errors, not evidence of a CAT runtime regression.
Do not equate successful resume probes with a clean production error log.
Do not proceed with frontend merge until read-only monitoring is verified.

Next checkpoint: inspect the Supabase dashboard for this project's
`diagnostic-assessment` version 8 invocation/function logs and database error
logs since its deployment (2026-10-23 05:11:59 UTC), or restore a working
read-only log query. Check for boot/import errors, authentication failures,
failed CAT requests and save-RPC errors. Investigate any error before further
rollout. Recheck main, deployed sources, admissions and data preservation
before resuming the protected PR/Pages sequence.

Final paused-state reads reconfirmed version 8 ACTIVE/JWT true, admission
digest `false`, unchanged corrected save RPC/permissions, and all seven
application-table fingerprints identical to predeployment. No production CAT
starts, submissions, student-record writes, SQL changes, question activations
or rollback were performed. Retain the compatible server; never revert to an
identity/NGN-incompatible legacy server. Live scoring, pause/resume with an
actual saved attempt and completed review remain untested under the current
no-test-record restriction; isolated end-to-end results below cover them.

The pre-existing practice total-label issue is tracked separately in
[#241](https://github.com/madisondvahle-lab/nclex-success-center/issues/241).
It is not fixed or otherwise included in this release.

## Status and boundaries

Prepared and tested on `release/ngn-sata-combined`. The staged rollout status
above supersedes the original local-only status below. This handoff supersedes the separate
SATA/Phase 2 deployment sequences, not their implementation records.

- Original SATA `88ce6ccfb2b1247df0709ba8ab2757281094a301` and Phase 2
  `5c42a5624b045ea0fc46193e99fcaf2f58c167d6` remain unchanged on their original
  branches/worktrees. The combined branch retains the exact Phase 2 ancestry.
- Initially based on verified deployed CAT revision `10518df`. During testing,
  unrelated PR #239 advanced remote `main` to
  `2464dcf017eb73589adecd15d33bfe3d8fce5007`. That baseline was integrated
  locally into this release branch. Its eight weekly-plan files are
  byte-identical to remote `main` and are not part of this release's PR diff.
  No merge into `main` occurred.
- The deployed question-counter correction is retained. Simulator and
  prior-question-history selection enhancement remain excluded.
- No production database/configuration/question/student writes occurred.
  No inactive production questions were activated. Q901's approved unapplied
  correction draft remains unchanged. No clinical content or answer key changed.

## Fresh read-only production baseline

Rechecked while preparing this candidate:

- Hosted `diagnostic-assessment`: version 7, ACTIVE, JWT verification enabled.
- Downloaded handler SHA-256:
  `90d01bf586b909e0979e2f1843239fc214e6958838139babddb2f7e31b532da0`.
- Downloaded engine SHA-256:
  `25f80bc6f0938d701187a6efc9934573cdd1bc3e9b5d7ecc91792bb0f1969c8d`.
- Both still match the actual-hosted differential fixtures. Do not substitute
  the repository's old history-aware server for this installed baseline.
- Published CAT HTML SHA-256:
  `999cd2762e912324e862a588727b801727e7e533cce5062b9ed48d6b9c314b90`,
  identical to `10518df`; PR #239 did not change CAT assets.
- Admission secret exists and its digest matches the literal `false`.
  No secret value was printed or changed.

## Reconciled behavior

- Independent `ngn-cat-v1` and `sata-order-v1` capability checks. New-format
  attempts require all capabilities recorded on that attempt; no in-progress
  or completed attempt is upgraded, reshuffled, converted, or regraded.
- Static SATA orders/opaque IDs are created once in the server checkpoint.
  Reviewed NGN standalone/case-child SATA mappings are instead created from
  the private frozen snapshot's actual option count and retained through stages.
- The backend resolves submitted IDs against its saved mappings, rejects
  unknown/duplicate identities and replacement mappings, and stores canonical
  numeric responses. Client-provided maps do not determine scores.
- NGN draft validation and static draft decoding remain distinct. Clinical-tab
  selection, pause/refresh/resume, feedback-to-next-item pauses, and historical
  reviews preserve the saved ordering and canonical answers.
- Existing binary, NGN plus/minus/all-or-nothing, group evidence, difficulty,
  stopping and response-commit rules are preserved. The adaptive engine and
  shared scorer are byte-identical to the approved Phase 2 versions.
- Authored standalone option rationales are retained in the private snapshot.
  Combined review supports existing numeric, lowercase-letter and uppercase-
  letter canonical rationale keys without rewriting those keys.
- Combined pages load helper/scorer/engine/author/persistence assets with
  `?v=ngn-sata-v1`; wire versions remain unchanged. Missing/mixed modules fail
  before assessment requests. The helper's required rationale capability is
  checked, not merely its unchanged transport version.
- Unversioned Phase 1 engine/author and the SATA-only engine/persistence assets
  are preserved. Older NGN-only HTML does not opt into option identities simply
  because it loads newer JavaScript.
- Author/import positioning warnings never alter correct combinations.
  Unbiased cryptographic Fisher-Yates is not conditioned on the answer key;
  a prefix-correct permutation can occur by chance.

## Compatibility matrix

| Saved attempt | Legacy client | SATA-only client | NGN-only client | Combined client |
| --- | --- | --- | --- | --- |
| Core, numeric answers, no presentation | Supported | Supported | Supported | Supported, no reshuffle |
| Core with saved SATA identities | Refresh required | Supported | Refresh required | Supported |
| NGN model, numeric options | Refresh required | Refresh required | Supported | Supported, no conversion |
| NGN model with saved SATA identities | Refresh required | Refresh required | Refresh required | Supported |

Unsupported resume/checkpoint/answer/abandon/review requests fail before a write.
With admissions off, even combined clients start the core model; their new
SATA options can still be randomized. SATA-only clients never enter the NGN
model, even when NGN admissions are later enabled.

## Validation

- Full current-baseline Node regression suite: **262 passed, zero failures**.
  Includes actual-hosted handler differential workflows for all five modes,
  11,328 legacy engine comparisons, production-counter regressions, cached
  clients, concurrency, 150-response mixed CAT, scoring/history and shared UI.
- Exhaustive SATA scoring: **272,160 comparisons**, all 720 six-option orders,
  all 63 nonempty selections, 3/4/5 correct answers, plus/minus and all-or-nothing.
- Deno type-check and whitespace checks passed.
- Real disposable Supabase Auth/RLS/atomic-RPC testing:
  - **20 admissions-off workflows**: legacy, SATA-only, NGN-only and combined
    clients across practice, Core-Safe CAT, mock CAT, readiness and remediation.
    Binary scores, legacy adaptive/stopping behavior, drafts, replays and history
    were checked against existing helpers.
  - **48 NGN workflows**: NGN-only and combined clients across Core-Safe CAT,
    mock CAT and readiness; standalone SATA with 3/4/5 correct choices, three-
    child SATA cases, highlight, cloze, matrix and bow-tie.
  - Real reauthentication/resume, foreign-owner/premature-review rejection,
    private table/checkpoint restrictions, authorized admin review, simultaneous
    submissions (one 200/one 409), canonical rows, rationales and frozen content.
  - Enabled run preserved all **219 prior attempts and 9,107 response rows**
    byte-for-byte. Three combined cases were paused for rollback testing.
  - After restarting the same server with admissions **false**, all three
    pending cases resumed/completed from unchanged mappings and source snapshots
    despite source edits/unpublishing. Three subsequent new starts used the core
    model. All **9,158** preexisting response rows and all unrelated attempts
    stayed byte-identical.
  - Final exact-runtime repeat of all 20 admissions-off workflows also passed,
    preserving **276 prior attempts and 9,177 prior response rows** byte-for-byte.
- Actual loopback browser tests, using real local Auth for CAT:
  - Combined NGN three-child case: 3/4/5 correct keys; stable IDs/order and
    selections across tabs, save, refresh, feedback-pause and resume; progressive
    findings; no premature keys/feedback; 2/3, 3/4 and 4/5 points; completion and
    mapped-rationale history review.
  - Static SATA practice completion; Core-Safe, mock and readiness save/refresh/
    resume and canonical submission; legacy grouped SATA/MCQ completion.
  - Admin historical review of untouched numeric legacy, mapped static SATA and
    snapshot-based NGN records, with correct display labels and rationales.
  - Shared engine standalone/case-child 3/4/5-answer selections, previous/next,
    tab/refresh restoration, partial credit, completion and review.
  - Real no-JSON author component, pattern warning, randomized unpublished
    student preview, unchanged clinical key; missing scorer/stale helper blocking.

Only loopback `127.0.0.1:54321` was used for writes. Test sources never import
the simulator. Local gateway verification was disabled for CLI serving only;
the candidate itself still validated real Auth JWTs and ownership. Production
JWT verification must remain enabled.

The full admin bank loader encountered expected missing-column errors in the
minimal local fixture schema; no production schema change is proposed. The
actual author component was therefore exercised in the synthetic browser
fixture, while real authenticated admin assessment review was exercised on the
actual shared-progress page. Unrelated dashboard tables missing locally also
produced read errors; the targeted historical-review paths completed.

## Exact release-relative file inventory

Relative to verified `2464dcf`, not relative to the original held commits:

- Documentation: this handoff; `ngn-cat-simulation.md`; `sata-presentation.md`.
- Runtime frontend:
  `assessment-persistence.js`, `assessment-persistence-sata.js`,
  `bianca-nur215.html`, `diagnostic.html`, `exam-adapters.js`, `exam-ui-ngn.js`,
  `exam-ui-sata.js`, `exam-ui.css`, `madison-diagnostic.html`,
  `ngn-author-ngn.js`, `ngn-scoring.js`, `option-presentation.js`,
  `question-bank-review.html`, `question-bank-selection.js`,
  `shared-progress.html`, `supplemental-practice.html`.
- Runtime server:
  `supabase/functions/diagnostic-assessment/index.ts`;
  `_shared/diagnostic-assessment-engine.mjs`, `_shared/diagnostic-ngn.mjs`,
  `_shared/sata-presentation.mjs`.
  `_shared/diagnostic-assessment-history.mjs` is deliberately removed from this
  release to match actual hosted selection, as already approved in Phase 2.
  The enhancement remains preserved on its separate hold branch.
- Tests:
  `_shared/diagnostic-assessment.test.mjs`, `_shared/diagnostic-ngn.test.mjs`;
  `tests/combined-browser.html`, `tests/combined-ngn-local.integration.mjs`,
  `tests/diagnostic-cat-ui.test.cjs`, `tests/diagnostic-hosted-baseline.test.mjs`,
  `tests/diagnostic-ngn-endpoint.test.mjs`,
  `tests/diagnostic-question-counter.test.cjs`, `tests/ngn-interactions.test.cjs`,
  `tests/sata-browser-schema.sql`, `tests/sata-browser-server.mjs`,
  `tests/sata-browser.html`, `tests/sata-local.integration.mjs`,
  `tests/sata-ngn-compatibility.mjs`, `tests/sata-presentation.test.mjs`,
  `tests/shared-ui-reconciliation.test.mjs`;
  the two source-only files under `tests/fixtures/cat-hosted-baseline/`.

The test SQL is disposable-fixture scaffolding, **not a production migration**.
No production SQL/schema/RPC migration, seed, question backfill or regrade is
required. The independent previously applied save-RPC correction stays installed.
Do not run the unrelated weekly-plan migration inherited from current `main`
as part of this release.

## Proposed server-first release sequence - separate approval required

1. Recheck remote `main`, exact hosted server/permissions, explicit admission
   switch false, and no overlapping releases. Recompare any drift rather than
   overwrite it. Confirm reviewed inventory read-only; do not activate it.
2. Archive the installed sources and this complete compatible candidate outside
   the web root. Check the deployment bundle contains the handler, engine,
   diagnostic-NGN helper, SATA helper and imported root scorer/presentation
   modules. Do not include simulator, test fixtures, SQL operations or secrets.
3. Deploy **only the combined server**, with admission switch false and JWT
   verification retained. Proposed CLI:
   `supabase functions deploy diagnostic-assessment --project-ref pmjwwktwlsqpetwfvolb --use-api`.
   No historical SQL/function replacement or other configuration change is part
   of this command. If additional configuration is required, stop for approval.
4. Read back hosted source/version/auth settings and compare exact hashes to
   the candidate. Verify cached/legacy compatibility via non-persistent
   authenticated resume/completed-review checks and logs. Do not create a
   production assessment or submission without explicit additional authorization.
5. Only after the server checkpoint passes, push this isolated release branch,
   open the combined PR, inspect its current-main diff and run all required
   protected checks/reviews. Merge/deploy frontend through normal GitHub Pages
   `main`/root workflow only after approval. Never bypass protections.
6. Verify Pages deployment commit and matching frontend asset hashes, module
   ordering/protocols, sign-in/access, eligible active+approved NGN inventory,
   legacy resume/review and compatible NGN snapshot review where available.
   Production NGN content tests requiring starts/submissions need separate
   permission; local evidence does not authorize production test records.
7. Monitor existing save/conflict/auth/module errors. Keep NGN starts disabled.
   Report production checkpoints before requesting separate NGN activation.

## Rollback and remaining decisions

- Admissions false stops **new NGN-model starts only**. It neither disables new
  SATA identities nor cancels existing NGN/SATA attempts.
- Before any new-format attempt exists, a fully verified old-server rollback
  may be possible. After any mapped SATA or NGN attempt exists, do **not** restore
  the old server/frontend wholesale. Retain compatible server and frontend
  resume/review assets; use an admissions-off compatible hotfix instead.
- Never delete/convert mappings, reset active progress, overwrite snapshots,
  regrade old attempts or automatically undo the known-ambiguity RPC correction.
- Traditional shared practice remains tab-local until result saving; refresh in
  that tab is supported, not guaranteed cross-device unfinished-session sync.
- Static bank SATA additions require updating the tested canonical count
  registry. Reviewed dynamic NGN questions use snapshot lengths instead.
- A pre-existing practice-only display limitation surfaced in the browser
  fixture: resuming a five-question attempt while the setup screen shows ten
  can label it "Question 1 of 10"; the saved attempt still finishes after five
  and the results correctly report five. The same `baseProfile` count selection
  exists in current published `main`. Submitted-question counter advancement,
  scoring and persistence remain correct. This unrelated total-label issue was
  not changed; flag it for separate triage rather than silently expanding scope.
- No known combined runtime/scoring blocker remains. Protected GitHub checks,
  deployed bundle verification, live monitoring and production inventory/clinical
  review remain future release checkpoints. New NGN starts require separate
  owner approval after deployment verification. No paid service or AI call added.

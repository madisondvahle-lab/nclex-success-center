# Isolated SATA presentation correction

The original isolated implementation remains preserved at `88ce6cc`.
For the reconciled combined candidate and the only proposed deployment
sequence, see [the combined release handoff](ngn-sata-combined-release.md).
The standalone evidence below does not by itself approve a combined deployment.

## Scope and status

Local-only implementation on `fix/sata-presentation`, based on deployed frontend
`10518df`. No push, merge, deployment, production function/configuration change,
question activation, clinical-key edit, backfill, or historical regrade is authorized.
The separate NGN Phase 2 worktree remains unchanged at `5c42a56`.
Question 901's approved, unapplied correction draft was not edited or applied.

The earlier read-only audit found 53 of 62 master-bank SATA questions with
consecutive correct choices first, including 34 first-four keys. Correct counts
already vary: 11 three-correct, 39 four-correct, 12 five-correct.
Stored/imported canonical ordering, combined with fixed rendering, causes the bias.
Separate CAT/remediation inventories overlap; do not add their counts to this total.

## Identity and compatibility contract

- Canonical option arrays, texts, correct combinations and rationale keys stay intact.
- `sata-order-v1` stores `order[displayPosition] = canonicalIndex` and
  `ids[canonicalIndex] = opaque UUID`. IDs are stable within the saved question/
  assessment, not new global question-bank identifiers.
- Crypto Fisher-Yates uses rejection sampling, not biased sort/modulo or AI calls.
  Retakes get fresh identities; a repeat permutation can occur legitimately.
- The shared engine retains canonical answers internally. Display controls carry
  opaque identities; selections map back before the original scoring functions run.
  Standalone and case-child SATA share this mechanism.
- New capable CAT attempts receive server-generated mappings in existing checkpoint
  JSON. The server accepts only their saved IDs, rejects foreign/duplicate IDs and
  client replacement maps, then passes canonical numeric answers to the unchanged
  scorer/save RPC. Checkpoint drafts and response rows remain canonical.
- CAT pause/resume uses its existing authenticated server persistence. New traditional
  practice snapshots are student/path-specific and **tab-local**: navigation,
  refresh and same-tab pause/resume retain order. They are not cross-device unfinished
  practice synchronization, and closing/clearing the tab may discard unfinished work.
  Completed practice saves its options, mappings and rationales in existing
  `answer_details` JSON for later review.
- Existing numeric attempts/history remain unmodified and unshuffled. Cached legacy
  clients can continue/start legacy attempts. They receive an explicit refresh-required
  conflict if they try to open an identity-based attempt. Consequently, cached legacy
  starts remain unrandomized until their frontend is refreshed; compulsory retirement
  of legacy starts would be a separate policy/behavior change.
- Versioned engine/persistence entrypoints leave original unversioned assets intact.
  Optional author warnings retain compatibility with older cached author pages.
- Practice grading remains its existing client-side grading; no new server practice
  scorer is introduced. Server-owned transport validation applies to server-scored CAT.

The CAT endpoint is reconciled to the captured **actual hosted** selection baseline,
not the repository-only prior-question-awareness enhancement. It does not query
history to change selection. The optional adaptive helper itself is unchanged;
its default empty history preference has the original behavior. Difficulty,
stopping, atomic persistence, correctness and completed-history rules are unchanged.

## Authoring/import behavior

Warnings flag prefix keys, first-choice saturation and uniform correct counts.
Malformed rows still receive the existing import validation errors rather than
crashing the warning pass. Warnings neither change keys nor mandate a number of
correct options. Existing no-JSON authoring previews use the same randomized
student renderer. No clinical content was rewritten.

## Validation

- Full Node regression suite: **217 passed**, zero failures.
- Deno type check and frontend classic-script compilation passed; React CAT pages
  were also executed in the browser. `git diff --check` passed.
- Original unversioned assets, canonical public CAT bank and adaptive engine are
  unchanged. Shared scoring/answer-completion source is identical to the original.
- **272,160** comparisons against the separate, read-only held NGN scorer: all 720
  permutations of six options, all 63 nonempty answer subsets, three/four/five
  correct choices, plus-minus and all-or-nothing rules. All passed. This is scoring
  compatibility evidence, not a combined Phase 2 deployment test.
- **10 authenticated disposable Supabase workflows**: legacy and capable clients
  each completed practice (12 answers), core CAT (30), mock (85), readiness (85),
  and grouped remediation (2). Tests cover checkpoint/resume, opaque-ID validation,
  scoring/ability, original eligible selection shortlist, stopping, revision/replay
  conflicts, completed review and cached-client rejection for new mapped attempts.
- Final exact-candidate API run preserved **128 prior synthetic attempts and 7,750
  prior response rows byte-for-byte**, while adding only that run's synthetic tests.
- Actual CAT frontend browser tests used loopback-proxied local Auth/API and synthetic
  public-bank fixtures: practice, core CAT, mock, readiness and grouped remediation;
  refresh/save-exit preserved selected choices and order. Practice/grouped cases
  completed successfully; after-feedback pause resumed at the next question.
- Actual traditional-practice page with a synthetic set and authenticated local
  student: three/four/five-correct items, refresh restoration, completion, original
  numeric selections, saved mappings and choice rationales verified through local
  Supabase. Test content was injected; this did not audit the full course catalog.
- Shared NGN browser fixture: standalone plus two case children, chart-tab changes,
  backward navigation, refresh, final scores `[1,1,1]`, and rationale association.
- Existing author editor: prefix warning, unchanged four-answer key and randomized
  student preview verified without publishing. Historical canonical and new mapped
  review labels/choice rationales are also covered by automated renderer tests.

Local test-only schema scaffolding restores existing practice prerequisites missing
from the minimal retained CAT test database. It is **not a production migration**.
The local Edge worker reached its lifetime CPU limit during accumulated testing;
restarting the disposable function runtime restored service. A synthetic case fixture
was corrected to use the hosted string-rationale format before successful case tests.
Neither required a production/application behavior change.

### Reproduction

```sh
node --test tests/*.test.cjs tests/*.test.mjs supabase/functions/_shared/*.test.mjs
deno check supabase/functions/diagnostic-assessment/index.ts
node tests/sata-ngn-compatibility.mjs /path/to/held-phase2/ngn-scoring.js
node tests/sata-local.integration.mjs /path/to/disposable/local-status.json
node tests/sata-browser-server.mjs /path/to/disposable/local-status.json
```

Both local helpers require the API to equal `http://127.0.0.1:54321`. The integration
fixture refuses to replace non-synthetic key inventory. Do not print or commit the
status file or credentials. Serve only this candidate's handler, adaptive helper,
SATA helper and root option helper in disposable Supabase. Bootstrap the browser
fixture only inside the dedicated disposable Docker database using
`tests/sata-browser-schema.sql` and the existing class-schedule and supplemental-
practice migrations. The proxy binds loopback port 54330; `/test-login?mode=...`
creates only dedicated synthetic accounts. CSP confines application connections to
the local proxy. Never run these fixture/schema operations against production.

## Required release decisions / rollback

1. Review and approve this isolated change; do not deploy it automatically.
2. Before any combined NGN rollout, explicitly integrate this correction with the
   separately held Phase 2 candidate and rerun combined frontend/server tests.
   This work does not modify that candidate or enable NGN admissions.
3. Deploy the compatible SATA server before matching frontend assets. No new
   production schema migration, function/RPC replacement or question reorder is
   required; existing checkpoint and practice-detail JSON fields are used.
4. Keep the compatible server and versioned assets for rollback/resume/review once
   identity-based attempts exist. Do not restore an incompatible legacy server or
   strip saved mapping metadata. A frontend rollback must not strand new attempts.
5. If mandatory refresh for *all new* cached-client starts or cross-device unfinished
   traditional-practice synchronization is desired, obtain separate scope approval.

## Exact changed-file manifest

Core and server:
- `option-presentation.js` (new)
- `exam-ui-sata.js` (new versioned engine)
- `assessment-persistence-sata.js` (new versioned persistence wrapper)
- `supabase/functions/_shared/sata-presentation.mjs` (new)
- `supabase/functions/diagnostic-assessment/index.ts`
- `exam-adapters.js`
- `question-bank-selection.js`

Frontend and authoring:
- `diagnostic.html`
- `supplemental-practice.html`
- `shared-progress.html`
- `bianca-nur215.html`
- `madison-diagnostic.html`
- `question-bank-review.html`
- `ngn-author.js`

Tests and handoff:
- `tests/sata-presentation.test.mjs` (new)
- `tests/sata-local.integration.mjs` (new)
- `tests/sata-ngn-compatibility.mjs` (new)
- `tests/sata-browser.html` (new)
- `tests/sata-browser-server.mjs` (new)
- `tests/sata-browser-schema.sql` (new, disposable fixture only)
- `tests/diagnostic-question-counter.test.cjs`
- `.agents/tasks/sata-presentation.md` (this handoff)

# MCQ presentation correction

Isolated worktree: `fix/mcq-presentation`
Base: production `main` commit `ef05ba2879d961e710bdf4477c0c91bbb296bafd`
(`Merge pull request #246`, onboarding release).
Original candidate `fd094889b894f402278416b2ddf068cba3a899ce` is preserved on
`fix/mcq-presentation-original`. The current candidate includes the rebased
implementation plus the NUR 312 parallel-pathway work.

## Implemented locally

- The shared exam renderer preserves canonical option arrays, answer keys,
  selections, and option-specific rationales while presenting MCQs through
  stable per-run mappings. Fresh standalone runs receive fresh identities;
  saved snapshots retain their original mappings.
- Supplemental, weekly/assigned, consultation, tutor, and question-bank preview
  surfaces use the shared mapping renderer. Local answer review supports
  numeric and letter-keyed rationale maps.
- CAT checkpoints store MCQ mappings only for `mcq-order-v1` clients. The
  existing SATA capability remains independent, and the server decodes option
  identities before scoring. NGN case-stage MCQ mappings use the same
  capability and preserve existing NGN scoring and adaptive evidence logic.
- The CAT client rejects missing or mismatched mapping assets. Existing
  numeric legacy attempts and SATA-only cached clients remain on their prior
  behavior.
- EKG feedback compares the selected display option through its canonical
  mapping. EKG and the original NUR 312 quiz clearly disclose that their
  resumable progress is browser-tab-only and is not added to assessment history.
- The parallel NUR 312 Exam 2 RPC has additive `start-mcq-order-v1` and
  `answer-mcq-order-v1` actions. The original `start` and `answer` actions
  remain available to cached clients. New server-generated presentation orders
  and canonical-index responses are saved with the attempt checkpoint and
  restored on refresh/resume, including active-attempt recovery.

## Validation completed

- Full isolated repository regression suite after rebasing on current `main`:
  313 passed, 0 failed, with
  `node --test tests/*.test.cjs tests/*.test.mjs supabase/functions/_shared/*.test.mjs`.
- `deno check --no-lock supabase/functions/diagnostic-assessment/index.ts`
  passed.
- Before rebasing onto the onboarding-only `#246` release, the authenticated,
  synthetic-only local CAT matrix passed all 25
  combinations across practice, NCLEX, mock, readiness, and remediation modes
  with legacy, SATA-only, MCQ-only, NGN-compatible legacy, and combined client
  capabilities. It preserved 9 preexisting local attempts and 152 responses.
- Before rebasing onto the onboarding-only `#246` release, the authenticated
  local NUR 312 RPC integration passed for all 116 questions:
  115/116 scored correctly, mappings and canonical answers survived refresh
  and active-attempt resume, completed history restored, and legacy numeric
  answer compatibility passed.
- Focused MCQ/SATA/CAT/shared UI/parallel NUR 312 tests: 46 passed.
- Browser checks verified a randomized shared-exam MCQ retained its selection,
  order, and rationale after refresh; EKG feedback and randomized ordering were
  correct; and original and parallel NUR 312 pages showed accurate progress
  disclosures and restored the applicable state.
- `git diff --check` passed. No production data, assessment records, question
  content, deployed functions, or NGN admission settings were modified.

## Remaining compatibility boundary

The CAT integration matrix kept NGN admissions disabled and exercised NGN
client compatibility without creating NGN CAT attempts. NGN MCQ mapping and
scoring are covered by the unit tests, but the new-attempt NGN CAT endpoint
path was not enabled or exercised in the local authenticated integration.
Keep NGN admissions disabled pending separate approval and a dedicated
synthetic-only NGN endpoint test.

The parallel NUR 312 page requires the additive
`supabase-nur312-parallel-persistence.sql` migration before its new RPC actions
are available. The reviewed migration was applied to production before the
frontend publication and its function permissions, authenticated ownership and
assignment checks, legacy and versioned actions, and unchanged assessment
record counts were verified read-only afterward.

## Migration and rollback review

The NUR 312 script is transactional and only replaces the scoped
`save_nur312_parallel_practice` function. It does not alter table definitions,
RLS policies, assignments, or existing assessment rows. It retains legacy
`start` and `answer` actions, adds the versioned actions, validates the signed-in
student's profile and assignment, locks the student's attempt for response
writes, and calls the existing server-side response/finalization helpers.
`SECURITY DEFINER` uses a fixed `pg_catalog, public` search path with qualified
application objects. Execute is revoked from `PUBLIC` and `anon`, and granted
only to `authenticated`. The rollback-only SQL integration test checks
anonymous/foreign-account rejection, assignment checks, invalid items,
stale revisions, retries, completion, and that the diagnostic RPCs remain
closed.

There is no standalone down migration. The SQL transaction prevents a partial
function replacement, and the previous function definition is available in
the deployed predecessor. Before the new frontend is published, the prior
definition can be restored if the migration itself must be backed out. After
the versioned frontend has saved an identity-mapped response, restoring the
old function is unsafe: it interprets `p_answer` as canonical and cannot
translate displayed positions. At that point, keep the compatible function
installed and use a forward fix; only remove the new UI after confirming there
are no in-progress mapped attempts that need resuming. This is a forward-
recovery plan, not a tested post-launch database downgrade.

## Production release status

- PR #247 is merged. Production Pages commit:
  `d8f600759c75f76fde3e9429a672431082d64c8f`.
- Production CAT Edge Function is version 9, active, with JWT verification
  enabled.
- The additive NUR 312 RPC migration is installed. The function retains the
  legacy actions alongside the versioned mapping actions.
- Read-only production checks confirmed the MCQ protocol and shared assets
  were published, the parallel NUR 312 page loads the updated persistence
  helper, an unauthenticated CAT request is rejected with HTTP 401, and
  production counts remained at 4 attempts and 100 responses during final
  verification.
- NGN admissions remain explicitly disabled.

## Remaining production validation

Production Function Runtime logs were unavailable during release verification,
so no conclusion was made that CAT v9 has no runtime errors. Authenticated
production scoring, answer-mapping behavior, rationale association, and
assessment-history persistence have also not yet been verified end to end.

At the next real student assessment completion, perform a read-only review of
the completed attempt and available runtime logs. Verify the saved displayed
option identity maps to the expected canonical answer, the score and
answer-specific rationale correspond to that mapping, and the assessment
history is intact. Do not create a synthetic production assessment, submit
test answers, regrade history, or modify student data solely for this check.
If runtime logs remain unavailable, record that limitation separately; missing
logs are not evidence of successful execution.

## Recovery and release state

The published frontend and production RPC may persist identity-mapped
responses. Never roll back to an older scorer or RPC that treats displayed
positions as canonical answers. Preserve all mappings and assessment history;
use a forward-compatible repair if an issue is found. Keep CAT v9 and the
versioned NUR 312 RPC installed.

The original candidate commit `fd094889b894f402278416b2ddf068cba3a899ce`
remains preserved on `fix/mcq-presentation-original`. The production release
is complete; only the real-student read-only scoring/history review and
runtime-log verification remain outstanding. Do not enable NGN admissions
without separate approval and the required dedicated validation.

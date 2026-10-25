# Bulk correction-draft review: Phase 1

## Release status and boundaries

Implemented for a dedicated PR; not deployed. The migration has only been
executed against a disposable local PostgreSQL database with synthetic data.
No production questions, correction drafts, approvals, student records, or
assessment scoring have been changed.

This extends **Question Bank Review > Review & Flags**. It reuses
`question_revision_drafts`, `question_audits`, the existing correction editor,
and the individual approval/application workflow. It does not create another
question bank or revision lifecycle.

## Using the workflow

1. Filter saved correction drafts by type, topic, source/import batch,
   lifecycle status, audit classification/status, unresolved flags, or text.
   Pending review is the default. Selections are capped at 25.
2. Select drafts and save an audit batch. The default processing size is 10;
   smaller exception batches are permitted, up to the existing maximum of 25.
   If the selection is larger than the size setting, only its first N members
   are captured. The confirmation states the exact count.
3. Run/resume the saved batch. Each item snapshots the saved original,
   proposal, version, SHA-256 content fingerprints, and source. Auditing
   never edits those drafts. The server saves each completed item transactionally.
4. Pause after the current item, close the browser, or load a saved run later.
   Processing resumes explicitly; completed items are not processed again,
   including simultaneous calls from two tabs. Network failures stop the
   client, while server-reported failures are saved and stop the queue.
   Stale drafts need a newly selected audit, not an overwrite of an old report.
5. Inspect the consolidated report or export its full CSV/JSON. Exports include
   snapshots, differences, evidence labels, suggestions, errors, and fingerprints.
   CSV cells are protected against spreadsheet formula injection.
6. Filter **Ready for Approval**, select a batch, and explicitly approve.
   The server rechecks every member before updating any lifecycle status.
   One invalid member means zero approvals. Unexpected update failures roll
   back the transaction as well.
7. Inspect the durable approval/rejection receipt. If the response was lost,
   retry the exact locally saved request. The server returns the original
   receipt without repeating decisions. Changing the payload under the same
   request identifier is rejected. Receipts remain available from the database
   even if browser storage is cleared.
8. Use the existing comparison/editor for individual corrections. Applying
   an approved revision remains a separate existing, individual action.

The previous AI audit panel's non-atomic batch approval loop has been removed.
It must not provide an alternative batch route around these safeguards.

## Checks, classifications, and evidence

The draft audit is entirely deterministic and costs **$0.00**. It checks both
saved versions and their differences for:

- MCQ/SATA answer positions, duplicate/empty/non-text options, and MCQ
  visible-option versus interaction/scoring-data consistency.
- Required stem, main rationale, difficulty, and individual rationale mappings.
- Answer-length signals: keyed length greater than 1.35 times mean distractor
  length **and** greater by more than 15 characters (MCQ).
- Generic/absolute option wording as a review signal, not a clinical conclusion.
- Case/spacing-normalized exact wording matches against other bank questions,
  recorded as overlap candidates, not confirmed redundant clinical concepts.
- Stale originals, edited proposals, unsupported interaction types, and
  unresolved flags.

These checks do **not** establish clinical answer accuracy, semantic rationale
consistency, medical claim support, distractor plausibility, or NCLEX educational
quality. Broader wording/concept candidates remain available in **Possible
duplicates**; an educator must distinguish redundancy from useful reinforcement.

Findings contain severity (`major`, `minor`, `informational`), evidence
(`deterministic`, `screening_signal`, `not_verified`), affected fields, details,
and suggested review actions. Phase 1 does not assign "critical clinical defect"
on the basis of an unverified automated clinical judgment.

Classifications are audit results, not lifecycle statuses:

- **Ready for Approval:** actual single-line spacing-only changes in MCQ/SATA
  stems or visible choices; valid structure and complete rationale mappings;
  no screening findings, wording-overlap candidates, or unresolved flags.
- **Minor Corrections:** no-op proposals, missing option rationales, or advisory
  quality signals/wording overlaps, with no higher-priority block.
- **Major Corrections:** structural defects without a meaning-changing revision.
- **Needs Clinical Review:** any change outside the narrow spacing allowlist,
  any rationale/key/scoring/metadata change, unsupported types, markup-sensitive
  differences, or unresolved flags. This classification overrides the others.

Ready means only that the proposed *change* meets a mechanical approval policy;
it is not a clinical certification of the original question.

Paid AI review of existing saved drafts is deliberately not enabled in Phase 1.
The existing question-only AI audit remains optional and still skips open drafts.
It now requires explicit paid authorization on every run/resume, shows typical
cost estimates and request/session budget limits, and labels AI agreement as
not clinical verification. No new AI provider or credentials are introduced.

## Persistence and approval safety

New supporting tables:

- `question_draft_audit_runs`: immutable selection/filter provenance.
- `question_draft_audit_items`: exact snapshots, resumable per-item state, report,
  and link to the existing `question_audits` record.
- `question_revision_events`: append-only snapshots of draft creation/edits and
  lifecycle decisions, audit successes/failures, and batch approval/rejection
  receipts. It deliberately has no cascading draft foreign key.

Existing drafts receive a baseline history event at migration time; edits from
before installation cannot be reconstructed. Reapplying the migration does not
duplicate baseline events or alter proposals.

Admin-only RPCs create runs, process one item, and approve a batch. Application
roles have read-only RLS-protected access to the new tables and no direct writes.
The latest-audit view uses invoker security (PostgreSQL 15+).

Batch approval checks permissions, a successful current-policy report, exact
draft timestamp and both full JSON snapshots, SHA-256 fingerprints, pending
status, original-question consistency, and unresolved flags. It recomputes the
spacing/structural policy on the server, independent of browser eligibility
labels and AI findings. Draft/question locks and a short flag-write lock protect
the validation-to-update window. Lock waits time out after three seconds rather
than leaving a long-lived approval blocking other operations.

Approval and rejection receipts are transactionally persisted and bound to the
request UUID, actor, and exact input list. Post-response list-refresh failures
are distinguished from failure to approve. Clearing local storage can lose the
shortcut to an interrupted request, not the server's receipt.

The new path never updates `questions`, applies revisions, regrades answers,
changes CAT checkpoints, or changes student history. It does not claim to fix
all historical version-pinning limitations of the existing individual apply
workflow. Bulk application and broader CAT/history guarantees are out of scope.

## Required manual migration and release

Only after explicit deployment/database authorization:

1. Confirm existing review, item-type, bulk-import, revision-edit, question-audit,
   and question-flags migrations are already installed. Do not blindly rerun
   historical schema files against production.
2. Apply `supabase-question-draft-audit.sql` once as database owner. It adds
   draft-version/fingerprint fields to `question_audits`, the three supporting
   tables, RLS policies, view, append-only trigger, and three admin RPCs.
   It inserts baseline history events, but does not update existing draft or
   question records or approve anything.
3. Deploy the updated review page, existing audit panel, new draft panel,
   and its shared module together. No Edge Function deployment is required.
4. Perform an authorized staging smoke test before production use.

Without the migration, the new panel explicitly reports unavailable tools;
existing individual editor/review remains usable. Roll back the frontend first
if needed; retain database history/receipts rather than dropping audit records.

## Local validation

Run:

```sh
node --test tests/question-draft-audit.test.cjs tests/question-audit-panel.test.cjs \
  tests/question-audit-wiring.test.cjs tests/question-revision-edit.test.cjs \
  tests/existing-question-author.test.cjs tests/question-safe-delete.test.cjs \
  supabase/functions/_shared/question-audit.test.mjs
bash tests/question-draft-audit-local.sh
```

The SQL script starts and removes its own named Docker PostgreSQL 17 container.
It uses real existing migrations plus synthetic auth/question/student fixtures,
tests migration reapplication, preservation, stale versions, permissions/RLS,
clinical/rationale/scoring gates, interrupted runs, late-update rollback,
concurrent item processing, and concurrent approval retries. Never run the
fixtures against Supabase.

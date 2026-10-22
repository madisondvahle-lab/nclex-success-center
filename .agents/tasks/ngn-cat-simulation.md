# NGN-style full-length CAT simulation

## Goal

Build the existing student-facing NCLEX readiness/CAT into a full-length,
exam-like NGN simulation. This remains an educational tool, not the official
NCLEX or a guaranteed pass predictor. Prefer extending the current CAT and
question-bank architecture; do not create a competing assessment system.

## Confirmed direction

- Prioritize a full-length exam simulation over short adaptive practice.
- Aim to resemble the NGN NCLEX experience as closely as the platform and
  reviewed content allow.
- Show the timer and question count by default, with the ability for students
  to hide either display.
- Use a five-hour default exam time. Support 1.5x and 2x time accommodations
  (7.5 and 10 hours), selectable by the student at exam start, while keeping
  timer visibility independently hideable.
- Clinical wording, keys, and rationales remain locked. The owner subsequently
  authorized the versioned Phase 2 scoring model below for new attempts only;
  historical attempts must retain their original scoring.

## Original implementation baseline

These findings describe the earlier baseline. See **Phase 2 implementation**
below for the locally implemented integration and remaining release gates.

- `diagnostic.html` contains the student-facing readiness/CAT and full mock
  flow. The full mock uses an 85-item minimum and 150-item maximum, blueprint
  and core-safety coverage constraints, and stops based on a modeled ability
  estimate and confidence interval.
- Adaptive selection currently uses three hand-assigned difficulty levels
  (`ITEM_DIFFICULTIES`), a logistic probability curve, and binary correct /
  incorrect updates. These are not empirically calibrated item parameters.
- The full-mock category ranges and minimums are derived from
  `diagnostic-core-blueprint.js`; category targets and exam-plan alignment
  should be checked against the current authoritative NCSBN test plan before
  revising them.
- The diagnostic question bank includes MCQ, SATA, bowtie, and case-study
  structures. Separately, `exam-ui.js` supports additional NGN interactions
  (including matrix, cloze, highlight, and fill) and partial-credit scoring.
  The two assessment render/scoring paths are not yet a single integrated
  student CAT experience.
- Existing Supabase assessment persistence records item responses and ability
  estimates. Preserve authenticated access, RLS, and existing student-history
  behavior in any future changes.
- `.agents/STATUS.md` describes this as an educational readiness assessment,
  not the official NCLEX CAT.

## Verified blueprint and inventory (2026-10-13)

Primary sources:

- [2026 NCLEX-RN Test Plan](https://www.ncsbn.org/publications/2026-nclex-rn-test-plan),
  especially plan pp. 4–5 and 15.
- [NCSBN NCLEX timing FAQ](https://ncsbn.zendesk.com/hc/en-us/articles/15247056118935-How-long-is-the-NCLEX).

The 2026 plan lists eight Client Needs ranges on p. 5, illustrates a target
distribution of 18%, 13%, 9%, 9%, 9%, 16%, 12%, and 14%, and allows individual
adaptive exams to differ by up to three percentage points in each category.
At the minimum 85 items, p. 15 specifies 52 Client Needs items, 18 clinical
judgment items across three six-item cases, and 15 unscored pretest items.
Each case shares an unfolding client presentation and aligns its six items to
the six NCJMM steps (p. 4). The timing FAQ confirms 85–150 items in five hours,
including breaks.

Assessment-bank findings:

- The full mock uses `QUESTION_BANK`: inline standalone items plus
  `IN_HOUSE_ITEM_BANK` and `DIAGNOSTIC_EXPANSION`. The latter two factories
  create MCQ/SATA items; there are no matrix, cloze, highlight, fill, or trend
  entries in these active-bank files.
- The active bank has two case studies, each with three subitems (six total
  case items). Four additional three-item case records are in
  `REMEDIATION_BANK`, which the full mock does not use. No six-step cases are
  currently available to the mock.
- `CaseStudyQuestion` renders every subitem on one screen and submits them as
  one group. It does not reveal one item at a time or advance case information
  by clinical-judgment step. Case subitems carry no explicit NCJMM-step field.
- Case responses are scored and fed to the ability estimate as binary
  correct/incorrect outcomes. A case inherits one parent Client Needs category
  for all subitems; the official plan counts case items separately from the
  eight content-area items and permits cases to span content areas.
- The separate `ExamUI` supports MCQ, SATA, fill, matrix, cloze, highlight,
  bowtie, and sequential case presentation with partial-credit helpers. It is
  not wired into the student CAT's scoring, answer persistence, or results
  flow; it also exposes previous-item navigation, unlike the NCLEX rule that
  a submitted item cannot be revisited.
- The current full mock has no unscored pretest-item state: all delivered items
  contribute to its readiness estimate.

These are architecture/readiness gaps, not authorization to add or revise
clinical items, answers, rationales, scoring facts, or identifiers.

## Proposed sequence

1. **Specify and verify requirements.** Confirm the intended exam flow,
   student-visible results, accessibility needs, and which current NGN/NCLEX
   behaviors are essential. Verify blueprint and format requirements against
   the applicable NCSBN materials; record sources and date. Do not infer
   official equivalence from the interface.
2. **Inventory the assessment and bank.** Map the current student flow,
   selection, scoring, stopping, case handling, persistence/resume, and results.
   Identify coverage and quality gaps without changing clinical content.
3. **Review item readiness.** Establish required metadata, NGN format and
   case dependencies, clinical-review status, and how difficulty / scoring
   parameters will be sourced. Do not present hand-assigned difficulty as
   psychometric calibration.
4. **Design the unified exam behavior.** Define blueprint-constrained adaptive
   selection, NGN scoring, case sequencing, exposure controls, stopping
   criteria, timing, pause/resume, and transparent readiness reporting. Have
   the tutor review clinical scoring and content before use.
5. **Implement incrementally.** Reuse the current CAT, question bank,
   `ExamUI` capabilities, and persistence where feasible. Add focused automated
   tests for selection constraints, case integrity, scoring, stopping, and
   saved/resumed sessions.
6. **Pilot before relying on results.** Run a limited, non-consequential pilot;
   review item behavior, coverage, scoring consistency, and student usability.
   Do not describe readiness results as predictive until evidence supports the
   claim.

## Initial product specification

### Exam experience

- Offer a full-length simulation with an 85-item minimum and 150-item maximum,
  subject to adaptive stopping and reviewed blueprint constraints.
- Default allotted time is five hours. At exam start, the student can choose
  standard time, 1.5x (7.5 hours), or 2x (10 hours).
- When the countdown reaches zero, allow the student to continue the exam and
  mark the completed attempt as over time rather than automatically ending it.
- Timer and question count are visible by default and have independent
  show/hide controls. Hiding display elements must not change exam timing,
  item selection, or scoring.
- After the exam, show a readiness summary, category breakdown, and
  item-by-item rationales.
- Include a pre-exam instruction screen, active assessment, completion/timeout
  handling, and post-exam readiness/remediation report.
- Use exam mode: no correctness feedback or rationales during the attempt;
  show the agreed readiness summary, category breakdown, and item-by-item
  rationales after completion.
- Keep learner-facing language clear that this is a Success Center educational
  simulation, not the official NCLEX and not an official pass prediction.

### NGN/CAT behavior targets

- Use the existing student CAT and question-bank architecture, converging on
  one exam renderer/scoring contract rather than building a parallel system.
- Preserve sequential six-item case studies with shared evolving client
  information; the item sequence should assess the six clinical-judgment
  functions, with formats supported by the reviewed bank.
- Include applicable NGN response formats represented in the reviewed bank
  (for example, multiple response, matrix, cloze/drop-down, highlight, and
  bow-tie). Do not manufacture an item-format quota without checking the
  current test plan and available quality-reviewed inventory.
- Constrain adaptive selection by the verified test blueprint, required safety
  coverage, prior exposure, and case integrity. Select informative items only
  from those eligible constraints.
- Do not treat current hand-assigned difficulty levels as calibrated
  psychometric parameters. Until empirical calibration and defensible
  validation exist, label the outcome a practice/readiness estimate and do not
  present the stopping result as equivalent to NCSBN pass/fail classification.
- Handle timeout, session save/resume, and completed-attempt persistence
  consistently. Persist the selected time multiplier and actual attempt state;
  do not label an attempt with a disability or accommodation status.

### Acceptance checks before implementation is called complete

- Students can select each of the three time allotments at exam start; the
  correct deadline survives reload/resume.
- Reaching zero changes the attempt to untimed continuation and sets a
  persistent over-time indicator; it does not auto-submit or stop item delivery.
- Timer and question count are independently hideable, shown by default, and
  hiding either does not alter exam behavior.
- Timed-out attempts have a defined, tested submission/result path.
- No answer/rationale appears in the rendered exam UI before completion; saved
  and completed attempts continue using authenticated Supabase access and
  current RLS.
- The item bank supplies complete, reviewed case sequences and blueprint
  coverage at each permitted stopping point; selection never breaks a case or
  exceeds the 150-item cap.
- Scoring and stop-rule tests cover MCQ and each supported NGN interaction,
  partial credit, minimum/maximum length, coverage constraints, and ambiguous
  readiness boundaries.
- Existing CAT/practice flows and student history do not regress.

### Current authoritative references to verify during specification

- NCSBN, *2026 NCLEX-RN Test Plan* (effective April 2026):
  https://www.ncsbn.org/publications/2026-nclex-rn-test-plan
- NCSBN, NCLEX timing FAQ:
  https://ncsbn.zendesk.com/hc/en-us/articles/15247056118935-How-long-is-the-NCLEX
- NCSBN NGN resources:
  https://www.ncsbn.org/resources.page?topic=next-generation-nclex-ngn

Verified against the official 2026 plan and NCSBN timing FAQ on 2026-10-13:

- The 2026 plan's Client Needs ranges are 15–21% Management of Care, 10–16%
  Safety and Infection Prevention and Control, 6–12% Health Promotion and
  Maintenance, 6–12% Psychosocial Integrity, 6–12% Basic Care and Comfort,
  13–19% Pharmacological and Parenteral Therapies, 9–15% Reduction of Risk
  Potential, and 11–17% Physiological Adaptation (plan p. 5).
- Its illustrated distribution is 18%, 13%, 9%, 9%, 9%, 16%, 12%, and 14%,
  respectively. The plan says individual adaptive exams may differ up to
  ±3 percentage points in each category (p. 5).
- The minimum 85-item official exam includes 52 items from the eight Client
  Needs areas, 18 clinical-judgment items in three six-item case studies, and
  15 unscored pretest items. The maximum is 150 items in five hours, including
  breaks (p. 15). The time FAQ confirms the 85–150/five-hour limits.
- Each six-item case shares an unfolding client presentation and corresponds
  to the six NCJMM steps (plan p. 4). Stand-alone clinical-judgment items also
  appear; the plan says approximately 10%, varying with exam length (p. 5).
- The current category-range numbers in `diagnostic-core-blueprint.js` match
  the plan, but its category key abbreviates the official Safety category
  name. Its current target counts form a weighted 85-item mix from the plan's
  illustrated distribution.
- Current mock coverage floors are calculated once from an 85-item exam and
  ceilings from 150 items. Because a CAT can stop at any length in between,
  the current stop check does not verify category proportions against the
  actual completed length. Review this constraint during CAT selection design;
  do not claim official blueprint compliance from category labels alone.

The plan confirms exam length and content distribution but does not establish
that this platform's uncalibrated adaptive estimate is equivalent to the
official CAT decision. Keep this as an educational simulation.

## Guardrails and open decisions

- Keep existing assessment behavior stable until a reviewed specification and
  regression tests are in place.
- Read `.agents/CLINICAL-STANDARDS.md` before any clinical-content or
  clinically meaningful scoring changes.
- Never weaken Supabase authentication, RLS, or private student-data controls.
- The user has selected full-length simulation first; timer and question count
  should be visible by default but independently hideable. The default time is
  five hours, with 1.5x and 2x accommodation options selectable by the student
  at exam start. The timer pauses when the student saves and exits and remains
  paused until they resume. At zero, allow untimed continuation and mark the
  attempt over time. After completion, students should see a readiness summary,
  category breakdown, and item-by-item rationales.
- The timer behavior on explicit save-and-exit/resume is settled: pause while
  away, resume on return. Tutors can review completed mock CATs in the Student
  workspace as SWM-CAT, with Client Needs and blueprint-area breakdowns plus
  item review. Tutors do not launch a CAT on a student's behalf.
- A true psychometric CAT depends on validated/calibrated item parameters and
  defensible stopping rules. Do not claim official NCLEX equivalence or
  predictive accuracy without supporting validation.

## Handoff status

The timer/results increment is implemented. The answer-key protection work is
implemented in the repository but is **not deployed or live-tested**. Apply the
private SQL migration and deploy the Edge Function before relying on the new
flow. Integration of sequential six-item NGN case delivery and additional
response formats into the server-scored CAT remains required Phase 2 work.
See the October 21 Phase 1 implementation below. No clinical-content changes
have been made.

## Implementation progress

- `diagnostic.html` full mock mode now offers 5-hour, 1.5x (7.5-hour), and 2x
  (10-hour) time allotments.
- Timer and question-count displays default to visible and can be hidden
  independently from the exam header.
- The countdown pauses on Save & Exit and resumes from the saved remaining
  time. If the allotted time expires, the mock continues untimed and marks the
  attempt over time on screen and in the existing JSON checkpoint.
- Timer settings and overtime state use the existing attempt checkpoint JSON;
  no database migration was needed. CAT question selection, scoring, and
  clinical content remain unchanged.
- The full mock now withholds visual correctness/rationales until completion;
  the post-exam results show an eight-category Client Needs breakdown and a
  question review that resolves existing bank entries to show the correct
  response plus the unchanged rationale.
- Validation: inline JSX parsed with esbuild; timer formatting checks passed;
  post-exam rationale mapping checks passed; browser preview confirmed
  independent controls and no in-attempt correctness feedback. Authenticated
  Supabase save/resume remains unverified.
- The student-facing diagnostic bank is now in `diagnostic-question-bank.js`
  with question text/options only. The generated inventory contains 174 active
  items and 52 remediation items; a focused test checks that answer/rationale
  fields are absent.
- `.agents/private/supabase-diagnostic-item-keys-migration.sql` seeds 244
  private answer-key rows, enables RLS, removes student direct access to
  attempt scores and item responses, and revokes legacy client-callable
  scoring/lifecycle RPCs. Run it after
  `supabase-in-house-item-analytics-migration.sql`,
  `supabase-in-house-assessment-history-extension.sql`, and
  `supabase-in-house-assessment-pause-resume-migration.sql`.
- `supabase/functions/diagnostic-assessment/` validates the bearer session and
  linked student, then handles start, resume, checkpoint, answer, abandon, and
  review operations. Answer checking, ability updates, and next-item selection
  run server-side; response persistence and attempt advancement are atomic.
  The student page uses this function for all diagnostic-bank modes.
- Tutor question review now uses the admin-authorized `review` action. Existing
  admin-only summary queries may continue reading attempt rows through the
  retained admin RLS policy; students no longer have a row policy for them.
- Completed mock attempts are labeled SWM-CAT in the tutor workspace and
  admin activity feed. Expanding the attempt review shows Client Needs and
  blueprint-area percentages before the item-by-item review. Existing mock
  attempts are identified by their saved `mode`; new ones also save
  `assessment_title` as SWM-CAT. The tutor CAT/readiness trend includes
  completed SWM-CAT, Core-Safe CAT, readiness-assessment, and outside-platform
  scores in chronological order by default, with platform filters available.
  Practice results remain a separate series. Cross-platform changes are
  directional because platform scoring and difficulty may differ.
- Focused verification: `node --test supabase/functions/_shared/diagnostic-assessment.test.mjs`,
  JavaScript/Edge syntax checks, assessment JSX parsing, and `git diff --check`.
  Supabase SQL application, Edge deployment, and authenticated browser
  behavior remain unverified.
- Timer limitation: the Edge Function currently accepts the client's timer
  snapshot and does not enforce elapsed time authoritatively. Do not claim
  server-enforced timer integrity until that is implemented and tested.
- Deployment sequence: apply the private migration in Supabase SQL Editor after
  its prerequisite migrations, then deploy
  `supabase/functions/diagnostic-assessment/` with the Supabase CLI. Do not
  commit answer keys into a published asset or infer successful deployment
  from local validation.

## Interactive NGN: required two-phase delivery

The owner confirmed on October 21, 2026 that CAT integration is an essential
part of the project, not an optional enhancement. Phase 1 extends the shared
exam engine and existing question-bank authoring only. Phase 2 must integrate
the same interactions into the protected, server-scored CAT. Do not change CAT
behavior or student records as part of Phase 1.

### Phase 1 implementation

- `exam-ui.js` / `exam-ui.css`: structured clinical record tabs for every
  supported response type, chronological entries, per-entry case-stage
  disclosure, and clickable chart findings linked to highlight responses.
  Switching tabs replaces only the chart pane, leaving answer controls,
  responses, and question progress intact. Earlier records remain available
  at later case stages; future records are hidden at earlier stages.
- Existing highlight notes, matrix, cloze, bow-tie, MCQ/SATA, numeric response,
  and sequential case support are reused. Matrix questions can optionally
  enforce one selection per row. Highlight findings are native buttons with
  visible selection state and keyboard support; ordinary text selection is
  not an answer. Checked responses are locked while chart tabs remain usable.
- `ngn-author.js` / `ngn-author.css` extend the existing private
  `question-bank-review.html` editor, not a separate administration system.
  Interaction data, chart entries, selectable cells, keys, scoring choice,
  references, and rationales use forms. Preview uses the actual shared engine,
  with correctness and rationales appearing only after Check answer.
- New items save as inactive drafts under the existing import-review workflow.
  Existing published/numbered questions still use correction drafts and
  separate approval/application. No automatic publication.
- Legacy HTML charts and existing answer shapes remain supported. Existing
  partial-credit calculations remain the default. Authors may explicitly
  choose whole-item all-or-nothing scoring; no existing key or scoring setting
  is automatically changed. Set-based responses are deduplicated before
  scoring, and an empty answer key raises an error instead of producing NaN.
- There are no new AI calls, services, dependencies, migrations, CAT edits,
  or assessment-history updates. Student practice adapters that currently
  accept only MCQ/SATA have not been expanded into a new NGN delivery path.
  Phase 1 enables the shared renderer and author/student preview; it does not
  make newly authored NGN items appear in the CAT.

### Authoring workflow

1. Open Question Bank Review, then Intake & Legacy, then **Create an interactive
   question**. Choose its type. Existing questions use their existing Edit
   button, including the correction-draft safeguards.
2. Add chart tabs and headings, then timestamped entries. Each entry needs one
   cell per heading. Use a full date/time and an **Available from item** number.
   Standalone questions use item 1; case numbers refer to the child sequence.
3. For chart highlighting, assign an ID with **Assign selectable finding ID**
   on each eligible cell. In the highlight question, enable chart selection,
   use **Choose a selectable chart cell**, and tick the correct findings.
   Students only see cells linked to that particular question as selectable.
   Both correct and incorrect eligible findings must be included; correctness
   is never styled before the answer is checked. Separate highlight notes
   use finding segments, with blank IDs for nonselectable text.
4. Set answer keys and rationales. Matrix keys use a checkbox answer grid;
   refresh it after editing row/column wording. Cloze uses numbered sentence
   markers such as `{{0}}`, with ordinary form fields for choices. Bow-tie
   keys use one-based choice numbers for two actions, one condition, and two
   monitoring parameters. No JSON entry is required.
5. Preview as student, select answers, switch tabs, advance case questions,
   and check scoring/rationales. Then save the inactive draft. Review,
   approval/application, and publication remain explicit existing actions.

### Shared data contract for Phase 2 reuse

Use the current `item_data` structures, not a second chart/question schema.
Newly authored entries carry `schemaVersion: 1` and `textFormat: 'plain'`.
Versionless legacy entries retain their existing rendering and meaning.

- A standalone item has its existing `id`, `type`, `stem`, response-specific
  fields and optional `tabs`. A case keeps `kind: 'case'`, its existing parent
  `id`, `scenario`, shared `tabs`, and ordered `items` with stable child IDs.
- A structured tab has `id`, `label`, optional `fromItem`, `columns: string[]`,
  and `entries: [{ at, fromItem?, cells: [{ t, id? }] }]`. `at` is an ISO local
  date/time for the fictional clinical record, not the student's clock.
  `fromItem` is one-based and defaults to 1. Entries are shown chronologically
  only when both tab and entry release stages are available. Legacy
  `{ id, label, html, fromItem? }` tabs are preserved without conversion.
- A highlight item keeps `segments: [{ id?, t, correct?, rationale? }]`.
  `chartSelections: true` links segment IDs to chart-cell IDs instead of
  rendering a second copy in the answer pane. IDs must be unique and match
  available cell text at that stage. Unlinked cells are read-only.
- Answers remain: MCQ index; SATA index array; matrix `"row:column"` array
  (zero-based); cloze choice-index array with nulls; highlight finding-ID
  array; bow-tie five-slot index/null array; numeric entry string.
- Matrix `responseMode: 'single'` is optional; omission preserves multiple
  selections. Optional `scoring: 'zero-one'` requests whole-item all-or-nothing;
  omission preserves the existing type-specific partial-credit behavior.
  This is an educational scoring contract, not a claim of official NCLEX
  scoring equivalence. Clinically meaningful scoring/key changes require review.

### Phase 2 requirements (required; not implemented in Phase 1)

1. **Private bank and eligibility:** make reviewed NGN items available to the
   existing server selection engine through its protected item/key inventory.
   Respect active/review status, Client Needs/blueprint coverage, difficulty,
   exposure history, and current-attempt duplicate prevention. Keep cases
   whole, preserve parent/child IDs and order, and reserve their required item
   counts. Do not generate or silently rewrite clinical content to fill gaps.
2. **Sequential disclosure:** deliver only the current case item and records
   released through its authorized stage. Do not send future entries in the
   student payload and merely hide them with CSS. The server owns stage
   advancement; submitted CAT answers cannot be revisited or changed.
   Reuse the chart/answer renderer with a CAT navigation policy, not the
   shared practice engine's Previous/Navigator/instant-feedback behavior.
3. **Server scoring:** extract/reuse deterministic type-specific scoring in a
   browser/server-compatible module; do not trust client correctness or
   credit. Validate type, answer IDs/indexes, cardinality, duplicates, row
   limits and allowed values against the private versioned item. Review which
   official-style zero/one, plus/minus, and rationale/dependency rules each
   approved format actually requires; current educational partial credit is
   not automatic authorization for a new CAT scoring model.
4. **Adaptive difficulty:** define how earned/max credit, case dependence,
   and item difficulty update the existing ability estimate, stopping rules,
   and category reporting. Preserve current binary-item behavior through
   regression tests. Do not treat six dependent case questions as calibrated,
   independent items or imply official CAT equivalence. Document any new
   model and obtain approval before changing assessment behavior.
5. **Responses and resume:** use the existing authenticated answer/checkpoint
   endpoint and atomic persistence. Save original response shape, stable item
   and case identifiers, content/scoring version, authorized stage, and
   earned/max credit without replacing original response data. Resume must
   restore incomplete responses, disclosure stage, timer/accommodation state
   and applicable tab state without exposing future records or answer keys.
   Reject stale/replayed submissions and invalid case advancement.
6. **History and review:** add compatible item-format/partial-credit rendering
   to completed student and tutor reviews and existing assessment summaries.
   Preserve historical scores, attempts, assignments, UUIDs, and answer keys.
   Define reporting denominators and case counts explicitly. No backfills,
   historical recalculation, or schema changes without separate approval.
7. **Safety and release gates:** preserve Auth/RLS/private key storage and
   withhold correct answers, rationales, abnormality cues and future entries
   until authorized review. Do not send author-only metadata in active CAT
   payloads. Add shared scoring fixtures, malicious/invalid answer tests,
   selection/blueprint/case-boundary tests, resume/replay tests, and
   authenticated student/tutor end-to-end tests. Verify legacy attempts
   unchanged. Pilot reviewed content before broad availability; deployment
   and clinical publishing require separate authorization.

Phase 1 validation includes focused Node tests for scoring, disclosure,
legacy compatibility, form mounting/validation and existing correction drafts.
Local browser checks cover tab/answer preservation, chronological unfolding,
keyboard highlight selection, checked feedback, narrow-screen navigation, and
the real author/editor preview and inactive-draft save using a mock database.
No authenticated Supabase write, clinical publication, or deployment was
performed; live authoring and database permissions remain deployment checks.

### Phase 2 implementation (local; not deployed)

Phase 1 was committed locally as `3e2df02`. Phase 2 now integrates the shared
interactions into the existing CAT, rather than introducing another engine.
Following owner review, Phase 2 was committed locally as `e025f82`. Nothing
has been pushed or deployed.

#### Delivery, selection, and private state

- `diagnostic.html` embeds the existing `ExamUI.Exam` for server-provided NGN
  items. MCQ, unrestricted SATA, highlight notes/chart cells, single- and
  multiple-response matrices, independent drop-down cloze, five-target
  bow-tie, numeric responses, and sequential cases use the shared renderer.
  Submitted answers lock; clinical tabs remain available without changing
  answers. No practice navigation, immediate feedback, automatic abnormality
  markers, or AI calls are added to CAT delivery.
- `supabase/functions/_shared/diagnostic-ngn.mjs` validates and loads active
  `qbank-bulk-*` questions with schema version 1, existing approved/published
  review status, recognized category/difficulty, and explicit
  `scoringVersion: 'ngn-v1'` on every delivered item. Existing published
  versionless content is not silently converted. Eligibility does not publish
  an item or approve a scoring change.
- Stable server aliases use `qbank:<existing UUID>` and
  `qbank:<existing UUID>:<existing child ID>`. Stored UUIDs and child IDs are
  unchanged. Existing blueprint, difficulty, exposure, and current-attempt
  duplicate rules still apply. Case selection reserves room for all children;
  CAT cannot stop midway through a selected case.
- Private checkpoint schema 4 stores the current immutable case snapshot,
  stage, each individual answer/score, scoring version, and SHA-256 content
  version. Current cases and completed NGN review retain their original keys
  and content despite subsequent author edits or unpublishing.
- Only display/response fields and records released through the current stage
  reach the student. Future entries, keys, rationales, scoring metadata, and
  private snapshots are withheld during active adaptive attempts. The server,
  not the browser, controls stage advancement.
- Existing authenticated endpoints, RLS, protected tables, revision checks,
  and `commit_in_house_diagnostic_answer` persist each answer and checkpoint
  atomically. No schema migration, table, new RPC, data backfill, or historical
  recalculation is introduced. Incomplete answers, tabs, timers, version
  metadata, and response history survive save/exit and resume. Invalid answers,
  replayed IDs, ownership violations, and concurrent writes are rejected.

#### Versioned scoring and authoring

`ngn-scoring.js` is the common browser/server scorer; all pages using the shared
renderer load it first. The Edge Function imports the same implementation.
`ngn-author.js` exposes legacy/versioned scoring and matrix scoring groups
through ordinary forms; preview uses this same scorer.

| Interaction | New `ngn-v1` rule |
| --- | --- |
| MCQ / numeric | One point for a correct response, otherwise zero |
| Unrestricted SATA / highlight | Correct selections minus incorrect selections, floored at zero |
| Matrix single response | Independent zero/one per row |
| Matrix multiple response | Plus/minus independently per column, with each negative column floored at zero; explicit `scoringAxis: 'row'` uses independent row grouping instead |
| Independent cloze | Zero/one per drop-down |
| Bow-tie | Zero/one for each of five targets; action and monitoring order within their pairs does not matter |

For matrices, omitted `scoringAxis` means column grouping only under the new
version. Legacy matrices retain their original whole-set formula. Duplicate
selections, invalid coordinates/IDs, multiple single-row selections, repeated
bow-tie tokens, incomplete required slots, and invalid numeric input are
rejected. Authors can explicitly opt into educational whole-item
`scoring: 'zero-one'`; this is exact all-or-nothing, not a substitute for a
native rationale-scored format.

The [NCSBN scoring-model FAQ](https://ncsbn.zendesk.com/hc/en-us/articles/14690447982359-What-are-the-current-scoring-models)
was read directly to verify the zero/one, plus/minus, independent matrix
column/row floors, and rationale-model distinctions. This implementation does
not claim support for every official NGN subtype: Select N, linked
rationale pairs/triads, and drop-down tables have no dedicated authoring/scoring
variant here. In particular, dependent rationale blanks must not be authored
as ordinary independently scored cloze; the authoring form warns about this.
Clinical/scoring review and explicit publication remain required.

#### Adaptive evidence and historical compatibility

- New `nclex`, `mock`, and readiness `assessment` attempts use
  `in-house-ngn-v1`; existing attempts retain `in-house-core-v1`, including
  binary scoring, grouped legacy-case submission, and original stopping rules.
  Legacy resume does not depend on loading the new question-bank registry.
  Practice/remediation remain on their existing model.
- Earned/max points and rule identifiers are stored separately from ability.
  A standalone normalized score updates ability once. A completed dependent
  case updates ability once using the mean of its individual normalized scores
  (equal question weighting, not total-point weighting). Every child response,
  score, rationale, position, and version remains individually reviewable.
- Partial-credit responses affect the educational ability estimate but add
  **no early-stop confidence**. A case is at most one independent evidence
  unit; incomplete, fractional, or mixed-credit groups supply no confidence
  units. Only wholly correct or wholly zero-credit completed groups qualify.
  A partial response or mixed case cannot itself trigger an early stop, even
  if earlier responses already meet the independent-evidence minimum.
- Early stopping requires at least 30 independent eligible units in the short
  CAT or 85 in the full mock, plus existing coverage constraints and a modeled
  confidence boundary. At an item limit or exhausted pool without that
  evidence, the new model returns no classification. The UI shows
  **INCONCLUSIVE**, never a percentage-derived PASS/FAIL fallback. Completion
  reason is saved for traceability.
- This deliberately conservative educational model is not psychometrically
  calibrated to official NCLEX outcomes. It may produce more inconclusive
  attempts, especially with many cases or partial responses; no official
  passing prediction is claimed. The existing difficulty/ability scale is
  retained rather than presented as empirically calibrated.
- Student and tutor completed review use immutable NGN snapshots and show
  individual earned/max points, rule, scoring/content version, and rationale.
  Category percentages explicitly count fully correct questions, not earned
  points. Group counts for adaptive evidence are distinct from question counts.

#### Validation and remaining release gates

Automated regression command:

```sh
node --test tests/diagnostic-cat-ui.test.cjs tests/diagnostic-ngn-endpoint.test.mjs tests/ngn-interactions.test.cjs tests/question-revision-edit.test.cjs tests/question-audit-wiring.test.cjs tests/parallel-practice.test.cjs tests/weekly-plan.test.cjs supabase/functions/_shared/diagnostic-ngn.test.mjs supabase/functions/_shared/diagnostic-assessment.test.mjs
npm exec --yes --package=deno -- deno check supabase/functions/diagnostic-assessment/index.ts
git diff --check
```

The final run passed **83 tests**, with no failures; Deno type-check and
whitespace validation passed. Endpoint tests execute the actual handler against
an in-memory service, covering authentication/ownership, all response formats,
sequential disclosure, immutable keys, legacy start/resume/scoring, replay,
failed commits, and concurrent writes. Additional regressions cover independent
matrix floors, grouped confidence, partial-trigger stopping prevention,
new-child exposure mapping, pause-version preservation, authoring, and existing
course/question-review workflows. These are synthetic integration tests, not
live authenticated Supabase tests.

Local browser checks used actual React CAT components, persistence helpers,
and shared renderer with a synthetic service stub: chart/tab preservation,
highlight and cloze answers, progressive timestamps, locked submitted answers
with usable tabs, save/exit/resume, matrix submission, completed review/points,
and inconclusive display. The final updated JSX compiled in-browser; the
scoring/version fixes were checked there, and no browser errors were recorded.

Live authenticated validation remains **pending**. The live sign-in page had
no stored signed-in session. The linked Supabase CLI project is not an
authenticated student session; Docker/Podman were unavailable for a local
Supabase instance. The new function cannot be tested against the live endpoint
without deploying it, which is not authorized. No live student records were
read or modified for this implementation.

Before release: owner reviews the implementation/results and scoring policy;
obtain explicit authorization for an appropriate staging/pilot deployment,
then validate real student/tutor authentication, existing private checkpoint/RPC
behavior, case completion/resume, historical review, and content eligibility
against that environment. Clinical review/publication and production
deployment require separate authorization. No new question has been approved
or published, no live database record has been changed, and nothing has been
pushed or deployed.

### Final predeployment validation (October 21, 2026)

The owner authorized a local Phase 2 commit and further validation, not
deployment, publication, production changes, or database migrations.
Additional regression tests extend the existing endpoint test file; no runtime
or clinical-content changes were needed during this validation pass.

#### Verified locally

- **Full mixed CAT:** the actual Edge Function handler completed a synthetic
  150-response mock containing 45 traditional MCQ/SATA questions, 45 standalone
  NGN questions, and ten six-question NGN cases. Fixtures span all eight Client
  Needs categories and all three difficulty levels. All clinical text is
  synthetic, not new or revised clinical content.
- **Every supported response shape:** MCQ, SATA, note/chart highlighting,
  single-response matrix, multiple-response matrix with independent column
  floors and explicit row grouping, independent cloze, bow-tie, and numeric
  answers were scored and saved with exact expected points and answer shapes.
  Completed student and tutor review returned those same answers, points,
  rationale snapshots, and scoring/content versions.
- **Case sequencing:** six children stayed contiguous and in authored order.
  Each stage exposed the intended records and no future records. Earlier
  findings remained available. Each of the ten cases was paused/resumed after
  its first response, preserving the draft answer, selected tab, version,
  submitted response history, and timer/accommodation settings.
- **Adaptive changes:** exact expected ability values were asserted after each
  of the 150 responses, with no change inside incomplete cases and one
  mean-credit update at case completion. A separate test verified that correct
  traditional answers select a harder NGN item, incorrect traditional answers
  select an easier NGN item, and subsequent partial credit uses the bounded
  update rather than binary correctness.
- **Confidence and stopping:** the full mixed test had only 55 eligible
  independent evidence units despite 150 saved responses; partial cases added
  none. It reached the limit with a null classification, not PASS/FAIL.
  Existing tests also verify that even wholly correct dependent cases count
  once, and partial/mixed responses cannot trigger a stop after the independent
  evidence minimum. Additional mixed 45-question CAT and 85-question readiness
  runs completed all case children within their limits and returned no invented
  readiness classification. Exhausted small traditional-only banks in all
  three new-attempt modes also remained unclassified.
- **Historical behavior:** historical MCQ, SATA, bow-tie, and legacy grouped
  cases retain binary scoring, the original ability updates, original response
  shapes, and `in-house-core-v1`, even with the new registry unavailable.
  Synthetic unrelated student/history rows remained byte-for-byte unchanged.
- **Actual UI:** a local browser run used current React CAT components,
  persistence helpers, and shared chart controls with a synthetic service
  stub. It completed a traditional MCQ followed by a three-question case
  (highlight, cloze, single-response matrix). It verified selected findings,
  tab/answer preservation, save/exit/resume, progressive chart timestamps,
  locked responses with usable tabs, completed INCONCLUSIVE display, traditional
  rationale review, and all three NGN answer/rationale reviews. Partial-credit
  results were 1/2, 1/2, and 1/1, totaling 3/5. No browser errors were recorded.
  The visible matrix label was used for pointer interaction; its visually
  hidden native radio is not the pointer target.

The combined regression command above now passes **88 tests, zero failures**.
The Edge Function Deno type-check and `git diff --check` pass. The VS Code test
discovery tool does not recognize these Node test files, so the repository's
existing `node --test` runner was used. Endpoint authentication in these tests
is mocked: this is not a real JWT/Supabase/RLS validation.

#### Authenticated Supabase blocker and exact unverified scope

Read-only environment checks found:

- `supabase status` could not inspect a local stack because neither Docker nor
  Podman is installed/available on PATH.
- No standard local container socket was available.
- No isolated Supabase/database/staging test configuration variable names or
  repository Supabase config file were present.
- The CLI-linked project is the existing NCLEX Success Center project, **not
  proof of an isolated test project or student authentication**. It was not
  used to read/write student data. A PostgreSQL client alone cannot validate
  Supabase Auth, PostgREST, RLS, and Edge Function behavior.

No isolated stack was created, migrations initiated, remote Edge Function
invoked, test accounts created remotely, or production data accessed/changed.
Do not interpret successful in-memory tests as confirmation of deployed grants,
schema versions, SQL locking behavior, real JWT authorization, or deployment
packaging.

| Still unverified | Required isolated environment/access |
| --- | --- |
| Real student/admin JWTs, expired-token handling, `students.auth_user_id` linkage, and `is_app_admin` roles | Dedicated test student, second test student, and tutor/admin identities in a confirmed nonproduction Supabase project/stack |
| Real query/filter behavior for reviewed NGN inventory, active/review gates, and all response types | Test-only bank fixtures and the existing production-equivalent schema/RLS/grants, without production student data |
| SQL atomic commit, actual PostgreSQL row locks/concurrent requests, JSON response/checkpoint durability, and revision conflicts | Existing `commit_in_house_diagnostic_answer` and protected assessment tables in that isolated database |
| Private checkpoint/key access and student/tutor cross-account review restrictions through real API grants/RLS | Test JWTs plus server-only test-project configuration, provided through secure environment settings, never committed |
| Edge Function packaging/runtime imports, JWT gateway, CORS, and real client-to-function transport | Current function running locally or at an explicitly approved staging endpoint; compatible frontend origin/proxy configuration |
| Browser reload/new-session resume, persisted completion/history, and student/tutor review backed by real storage | Isolated frontend connected only to the test project, with approved synthetic test writes and repeatable test fixture cleanup |
| Exact installed database schema/RPC compatibility | Read-only inspection of the isolated schema/grants, followed by the mixed workflow; no assumptions from migration files alone |

Ways to unblock (require owner approval before any provisioning/deployment or
migrations): provide access to an already prepared isolated Supabase staging
project with the current function and existing schema installed; or authorize
preparing a disposable local Supabase stack after Docker/Podman is available.
Provisioning a stack, applying existing migrations, installing/deploying a
function, and creating test fixtures are separate operations, not covered by
this validation authorization. Do not request production service credentials
or real student records as a substitute.

**Release decision:** local regression checks pass, but authenticated isolated
integration remains a release blocker. Leave production deployment and clinical
publishing on hold pending the owner's review and explicit next authorization.

### Clean Phase 2 release branch preparation (October 22, 2026)

Phase 1 is now deployed via PR #237 at `b062d2c`. Its authenticated production
admin unsaved-preview and nonadmin redirect checks passed without question or
assessment writes. Earlier deployment/login blockers above are historical.

`release/ngn-cat-phase2` starts at that exact deployed revision and reuses
validated implementation `e025f82` plus expanded endpoint regressions
`73f85cd`. Its runtime/test files match that validated snapshot; the handoff
adds this current release status. No implementation was regenerated.

Excluded: simulator commit `5422517`, database correction `ec4d1c2`,
question-counter correction `598fd42`, and unrelated changes. The separate
production-based counter branch is `release/cat-question-counter`; when its
release is approved, carry that correction forward into the Phase 2 candidate
without reintroducing the old counter.

The isolated Phase 2 branch is a preparation artifact, not an independently
deployable release approval. Production still has the ambiguous locking SELECT
in `commit_in_house_diagnostic_answer`; the narrow function correction must be
separately approved and applied before Phase 2 server release. Do not execute
the historical private migration or its question seeds. No new schema, seed,
backfill, regrading, content publication, or student-data conversion is included.

Previously completed real local Supabase validation covered all response types,
case sequencing, pause/resume, complete saved responses, concurrency, legacy
history, and mixed 45/85/150-response runs, after applying the SQL correction
only in the disposable environment. That result does not establish production
RPC readiness or frontend/server mixed-version deployment compatibility.

Before any Phase 2 deployment: revalidate the final candidate with the counter
fix and corrected local RPC; check hosted function packaging and coordinated
frontend/server compatibility; define rollback/resume handling for new-model
attempts; obtain separate production authorization. Existing historical
attempts retain their original model. New attempts deliberately use the
versioned NGN model and insufficient-evidence safeguards documented above.
No branch has been pushed, no PR opened, and no production data/function
change or deployment is part of this preparation.

Fresh validation of this isolated extraction: **88 tests passed, zero failed**,
the CAT Edge Function Deno type-check passed, and whitespace checks passed.
All runtime/test files were compared against `73f85cd` with no differences;
the database SQL remains identical to deployed `b062d2c`. The test count
excludes the deliberately omitted simulator and separately held corrections.
### Production-based question-counter release preparation (October 22, 2026)

Phase 1 is deployed through PR #237 at `b062d2c`. Authenticated production
verification subsequently confirmed admin access to an unsaved authoring
preview and a nonadmin redirect to the student dashboard; no question or
assessment writes were performed. Earlier pending Phase 1 checks above are
historical.

The owner authorized preparing and committing the counter correction, not
pushing or deploying it. `release/cat-question-counter` starts at the deployed
`b062d2c` revision and adapts the validated `598fd42` display-only change.
The displayed item number now subtracts the still-displayed submitted response
count (one standalone item or every child in a legacy grouped case), then
advances when navigation changes the item. Final feedback retains the final
item number/range rather than displaying a nonexistent next question.

Only the counter expression/order in `diagnostic.html`, a dedicated regression
test, and this handoff change. Server scoring, selection, stopping, response
saves, timers, completion, clinical content, and assessment history are
unchanged. No Phase 2 integration, simulator, SQL correction, or migration is
included.

Validation: 54 Node tests pass, including five dedicated regressions for
traditional MCQ/SATA/bow-tie, grouped legacy cases, final feedback, the actual
submission handler retaining the current item while saving complete history,
and server-driven assessment completion. Existing selection, coverage,
ability, history, chart/authoring, and course-persistence regressions also pass.
Command:

```sh
node --test tests/diagnostic-question-counter.test.cjs tests/ngn-interactions.test.cjs tests/question-revision-edit.test.cjs tests/question-audit-wiring.test.cjs tests/parallel-practice.test.cjs supabase/functions/_shared/diagnostic-assessment.test.mjs
```

The test discovery tool did not recognize these Node tests, so the existing
Node runner was used. No live CAT submission was performed. This branch remains
local pending review and separate release authorization.

### Counter carry-forward into held Phase 2 candidate

PR #238 merged the isolated counter fix as `10518df`. The Phase 2 branch now
merges that deployed ancestor rather than copying or reverting the production
page. Only this handoff had an append conflict; both relevant sections were
retained. The CAT source merged the counter expression cleanly, and the same
dedicated counter regressions now run against the integrated implementation.
The database correction and simulator remain excluded. This merge is local;
Phase 2 deployment remains unauthorized.

Validation after carry-forward: **93 tests passed**, including the same five
counter/handler regressions against the integrated CAT source. Deno type-check
and whitespace checks passed. The private database SQL still matches deployed
production, and the simulator remains absent. PR #238's production Pages build
succeeded at `10518df`; its published CAT source exactly matches the counter
release. All five dedicated regressions also passed using that fetched live
source with synthetic in-memory state, including submitted/final feedback,
legacy case ranges, navigation, response saving, and completion. Browser
execution of the published counter expression independently confirmed 1 on
first feedback, 2 after navigation, 5 for case items 5-7, and 150 on final
feedback. No production attempt or data write was made.

### Narrow production RPC correction verified; Phase 2 compatibility hold

On October 22, the owner separately approved the exact guarded RPC replacement
after its statement-terminator repair and disposable-local apply/rollback/
reapply validation. The original production definition and permissions matched
the approved capture immediately before installation. Quiet-window aggregate
checks found no active CAT submissions/transactions, no in-progress CATs,
no relevant locks, and no recent assessment activity in any mode.

The approved correction to `commit_in_house_diagnostic_answer` was applied
independently of Phase 2. Separate read-back confirmed the exact validated
corrected definition SHA-256
`53a7e5e58645c0bcb66eed412d58925e6635679a942bb2da08beac9024bfc386`,
unchanged signature, postgres ownership, SECURITY DEFINER/search path, and
service-role-only execution. Write counters for 94 observed tables did not
change across installation; no assessment RPC, test record, seed, historical
migration, regrading, or rollback was executed. Post-change aggregate checks
showed no CAT lock waiters or assessment writes. Database/Edge error-log
streams were not accessible through the available CLI; dashboard log review
and any authorized production functional submission remain distinct checks.

The held source SQL still predates the independently applied maintenance
correction; it must not be executed to provision production or mistaken for
the now-installed definition. No extra SQL operation is part of Phase 2.

Release-compatibility preparation identified these remaining gates:

- The old CAT frontend resolves selected/resumed items only from its static
  bank. It cannot render newly delivered `qbank:` items. The new server enables
  versioned NGN attempts for new CAT/readiness sessions and may select such
  items; deploying it first with old/cached clients is therefore not safe.
- The new frontend handles server-provided interactions but falls back to the
  static bank for legacy responses. This supports a frontend-first strategy
  in principle, not a completed compatibility certification. Test new-client/
  old-server start, resume, submission, completion, and review with the actual
  previous hosted function version in an isolated environment first.
- The new shared renderer requires `ngn-scoring.js` before `exam-ui.js`.
  Verify old/new cached asset combinations on every affected entry page.
  A hard refresh is not a reliable compatibility control for all students.
- Before switching the server, establish a reviewed way to handle cached old
  clients and existing sessions. The current candidate has no explicit
  negotiated client-capability gate; do not assume timing alone makes this
  safe. Any necessary compatibility implementation needs scoped review and
  regression validation before release approval.
- Once NGN attempts exist, reverting to the pre-NGN server would strand their
  snapshots/response shapes. Define a version-aware rollback/resume policy;
  never erase or regrade attempts to make a rollback work.
- Verify actual hosted packaging of the shared scorer import, legacy/new
  coexistence, and all supported interactions against isolated authenticated
  Supabase. Then obtain separate Phase 2 deployment approval. Keep simulator
  code excluded and retain the deployed counter correction.

Only preparation and documentation were performed after the approved narrow
RPC operation. No Phase 2 code or simulator was pushed or deployed.

### Phase 2 cached-client safeguards and isolated release validation (October 22, 2026)

The compatibility gates above are now implemented and tested on the isolated
`release/ngn-cat-phase2` branch. This reuses the validated Phase 2 implementation;
it does not add the simulator or change the scoring rules, adaptive formulas,
student exam lengths, clinical content, SQL, or deployed counter correction.

#### Compatibility contract

- The new CAT page declares `ngn-cat-v1` in its metadata. Persistence advertises
  that protocol only when the page declares it and the loaded renderer and
  scorer match `ngn-cat-v1` and `ngn-v1`. The page also checks the persistence
  version before loading assessment history. Missing/mismatched modules show
  an error and prevent starting/resuming rather than falling back to a different
  scoring implementation.
- New NGN-model attempts require **both** this explicit client capability and
  server setting `NGN_CAT_NEW_ATTEMPTS_ENABLED=true` (exact lowercase value).
  Absent/false settings disable new NGN admissions. Cached/older clients and
  unknown protocols start only traditional `in-house-core-v1` attempts from
  the existing private static-bank inventory. Legacy scoring/stopping remains
  unchanged. The server accepts the legacy `profile.mode` request shape when
  top-level `mode` is absent.
- Existing attempts retain their stored model irrespective of the admission
  setting. A client without the supported protocol cannot restart/resume,
  checkpoint, answer, abandon, or review an NGN attempt. It receives HTTP 409
  with a refresh/resume explanation before any write or interaction delivery.
  Progress is never silently reset or downgraded. Current persistence preserves
  that server explanation through Supabase HTTP errors; a fully cached older
  helper may still show its older generic error and need a page refresh.
- Tutor review advertises capability only with matching modules and shows an
  explicit module-load error instead of an incomplete NGN review.
- Upgraded pages use `exam-ui-ngn.js` and `ngn-author-ngn.js`, with matching
  `?v=ngn-cat-v1` dependency URLs. The unversioned `exam-ui.js` and `ngn-author.js`
  are byte-identical to production `10518df`, so cached Phase 1 HTML cannot
  accidentally load the scorer-dependent upgraded engine/author. This is
  deliberate legacy-asset retention, not a second scoring implementation:
  upgraded assets reuse the existing Phase 2 source and shared scorer. Keep
  this release's versioned asset contract stable; a later incompatible release
  needs a new capability/asset version and corresponding compatibility tests.
- All six shared-engine entry pages are wired consistently: diagnostic,
  shared progress, question-bank review, supplemental practice, Bianca NUR215,
  and Madison diagnostic. Shared CSS additions are scoped to embedded exams.

#### Final isolated validation

- **244 Node tests passed, zero failures**, using
  `node --test tests/*.test.cjs tests/*.test.mjs supabase/functions/_shared/*.test.mjs`.
  The Edge Function Deno type-check and whitespace checks passed. Tests include
  missing/mismatched modules, preserved legacy asset hashes, old-client/new-
  server requests, disabled/default admissions, no-write rejection of
  incompatible clients, case completion/review during rollback, unchanged
  idempotent legacy abandon behavior, and the deployed counter regressions.
- Real authenticated disposable local Supabase tests passed for the final
  capability/review contract: mixed 16-response coverage of every interaction
  type, six-stage progressive disclosure, exact persisted answers/points,
  case-grouped adaptation, real re-sign-in/pause/resume with draft/tab/timer,
  SQL concurrency (one success and one revision conflict), replay protection,
  JWT/RLS/ownership/admin restrictions, and completed student/tutor review.
  Mixed 150/45/85-response workflows and legacy binary scoring also passed;
  insufficient evidence remained unclassified rather than producing PASS/FAIL.
- New-client requests were authenticated against the **actual deployed
  `10518df` handler and adaptive engine**, installed only in the disposable
  environment: traditional start, checkpoint, resume, answer, completion and
  review all passed with the additional protocol field.
- The final version-aware server was restarted locally with new admissions
  disabled. A saved partially answered case resumed after a fresh sign-in and
  completed sequentially with its exact partial points, answers, rationales and
  INCONCLUSIVE result. Incompatible completed-review requests were rejected.
  New capable-client starts used the traditional model. Paginated snapshots
  verified **23 prior completed synthetic attempts and 940 prior response rows**
  unchanged. Earlier tests also verified incompatible requests left both the
  current attempt and response rows identical.
- Actual candidate browser assets loaded with the expected versions. A local
  traditional MCQ plus a six-child case exercised highlight, cloze, both matrix
  modes, bow-tie and SATA. Tab navigation and save/exit/resume retained the
  selected finding. The final-feedback counter stayed at question 7; completed
  review displayed all seven responses/rationales, each interaction's rule, and
  **10/15 points across six NGN responses**, with an INCONCLUSIVE classification.
  Omitting scorer, renderer or persistence separately produced a clear error,
  disabled Start, and made **zero assessment requests**.
- Browser Supabase traffic was proxied exclusively to `127.0.0.1:54321`, with
  `connect-src 'self'` and zero production database requests. All API harnesses
  asserted that same local origin. Only synthetic local accounts, fixtures,
  attempts and responses were written. No production function/table/content
  operation, migration, inactive-question activation, push or deployment occurred.
  Existing browser warnings about in-browser Babel/multiple SDK clients remain;
  no new functional blocker was observed.

#### Guarded release and rollback sequence (approval still required)

1. Review the isolated candidate against deployed `10518df`, retaining the
   counter fix and excluding simulator/SQL operations. No database migration,
   seed, backfill, conversion or regrading is required.
2. Deploy the version-aware Edge Function with new NGN admissions **disabled**
   (setting absent or false). Legacy clients remain supported. Verify hosted
   packaging includes the shared scorer and helpers; local runtime packaging
   passed, but hosted publication cannot be verified before an approved deploy.
3. Publish the compatible static pages and new asset paths through the normal
   protected GitHub workflow. Verify published commit/asset bytes, module
   readiness, access restrictions and safe unsaved previews. Preserve the
   unversioned legacy assets.
4. Before enabling new NGN admissions, confirm existing eligible inventory
   read-only and obtain approval for activation of the setting. Do not activate
   inactive questions as part of release. Only active, reviewed, supported
   versioned content is eligible; an insufficient pool stays INCONCLUSIVE.
   A production functional test that creates an attempt needs explicit test-
   record authorization; isolated tests do not grant permission to write there.
5. Enable `NGN_CAT_NEW_ATTEMPTS_ENABLED=true` only for the approved rollout.
   Monitor hosted Edge/Postgres error logs and assessment availability.
   Dashboard log review is still required; those production log streams were
   not available through the CLI in the prior database review.
6. Operational rollback is **admissions off, compatibility retained**: set the
   flag false, keep this version-aware server and the NGN-capable assessment/
   review pages and assets available. New starts use traditional scoring while
   existing NGN cases finish/review with their original model. Never revert
   wholesale to the pre-NGN backend or remove the NGN client assets once
   NGN attempts exist. If a frontend defect requires intervention, retain/fix
   the compatible resume/review path rather than downgrading saved attempts.
   Keep the independent production RPC ambiguity correction installed.

**Readiness:** no remaining local compatibility blocker was found. The
candidate is ready for owner review and separate deployment/activation
approval, not already deployed. Production-hosted verification/monitoring
remains part of the approved rollout. Simulator and clinical publishing
remain on hold; no production student data or historical scoring was changed.

### Actual-hosted baseline reconciliation (October 22, 2026)

This section supersedes the prior claim that testing repository `10518df`
established compatibility with the installed server. The staged deployment
was stopped at preflight before any function-code deployment, branch push,
PR, merge or frontend publication.

#### Actual baseline and revised scope

- Downloaded the installed `diagnostic-assessment` source again via the
  Management API. It exactly matches the earlier archived hosted download,
  not the repository's server source. Hosted metadata: version **7**, JWT
  verification enabled, bundle SHA-256
  `7e08c8527da4704d5e73253ca223f9fbe0e29fcb69c8913bc7261c9e61f1cc90`.
  The metadata version increased during the previously authorized admission-
  secret update; the hosted source bundle did not change.
- Exact source snapshots are retained in `tests/fixtures/cat-hosted-baseline/`
  for reproducible differential tests, not runtime deployment. Handler SHA-256:
  `90d01bf586b909e0979e2f1843239fc214e6958838139babddb2f7e31b532da0`;
  adaptive engine SHA-256:
  `25f80bc6f0938d701187a6efc9934573cdd1bc3e9b5d7ecc91792bb0f1969c8d`.
  Fixtures contain server source only, no student data, clinical question bank,
  credentials, or production connection settings.
- Removed the cross-attempt history query/import and the history-based
  shortlist preference from the Phase 2 runtime, including NGN-model starts.
  Selection now uses the hosted server's original best-score tolerance and
  three-item random shortlist. Current-attempt repeat prevention remains
  unchanged; deferring cross-attempt preference does not remove that safeguard.
- The history-awareness implementation and its 15 dedicated tests are
  preserved on local `hold/cat-prior-question-awareness` at `bd24976`.
  A checked, four-file `deferred-history-enhancement.patch` in the session's
  `files/ngn-phase2-reconciliation/` package isolates only the helper, its
  call sites, shortlist change and original tests. Patch SHA-256:
  `3671b9b94eb298df74c0a3e6df80f7d8f6ff7d196848c86afb0807e4ef3a1206`.
  `git apply --check` passes against the reconciled source. Do not merge the
  entire held snapshot or apply this patch as part of Phase 2. A future release
  needs separate behavioral review/approval and must update baseline-parity
  tests explicitly rather than weaken them silently.
- Relative to `bd24976`, no frontend, scorer, NGN snapshot/progression,
  adaptive-safety or question-counter code changed. The reconciliation changes
  only the deferred history implementation, associated tests, new hosted-
  baseline regression fixtures/tests and this handoff. Simulator and all SQL
  operations remain excluded.

#### Complete server-difference classification

The downloaded handler/engine were compared in full against the candidate.
No additional unrelated selection/scoring/persistence difference was found.
Do not describe their wire responses or all error statuses as byte-identical:
the following previously approved NGN/compatibility differences are intentional.

| Area | Remaining difference / legacy guarantee |
| --- | --- |
| Selection | Original shortlist, difficulty ranking, safety/category/blueprint priority and current-attempt repeat rules match hosted legacy behavior; no prior-attempt lookup or preference |
| NGN inventory and model | Reviewed interaction inventory and versioned model only for supported clients with admissions enabled; existing attempts always retain their stored model |
| Adaptive scoring and stopping | NGN-only partial credit, grouped evidence and insufficient-evidence rules remain; legacy binary updates, thresholds, cap/exhaustion results and readiness fixed length match hosted behavior |
| Case sizing | Additional remaining-length check applies only to the NGN model; hosted traditional mock/readiness case-fit logic unchanged |
| Persistence | Same atomic RPC arguments and row/checkpoint contents for legacy workflows; NGN snapshots/drafts/credit are confined to the new model |
| Public responses | Additive model metadata and null interaction/completion fields for legacy clients; original fields and reveal behavior remain unchanged |
| Compatibility errors | Explicit protocol checks protect existing NGN attempts and reviews; missing top-level mode accepts legacy `profile.mode`; no silent downgrade or progress reset |
| Concurrency errors | The approved safeguard maps the RPC conflict to HTTP 409 and rejects an empty commit result rather than implying success; no failed save mutates progress/history |
| Authentication/access | Same bearer validation, student linkage, admin checks, CORS, ownership checks, and completed-review restriction |
| Technical-only changes | Inferred service-client type, private snapshot sanitization, model-gated registry reads, pre-abandon read to enforce capability, and existing/new-attempt inventory ordering; no schema or permissions change |

#### Reconciled validation results

- **234 tests passed, zero failures**, with the full existing Node runner;
  Edge Function Deno type-check and whitespace checks passed. Count changed
  from 244 because 15 history-enhancement tests were held separately and five
  actual-hosted regression tests were added. Existing NGN/client/counter tests
  remain, not replaced by a smaller proxy suite.
- Engine differential regression performs **11,328 exact comparisons** against
  the downloaded engine: multiple random choices, abilities and difficulties;
  lengths 0/1/29/30/44/45/84/85/149/150; core coverage present/missing; all five
  modes and case-size limits. Legacy ability, stopping and selection match.
- Handler differential regression runs correct/incorrect/mixed workflows in
  traditional CAT, mock, readiness, practice and remediation modes against
  the actual hosted handler. Both cached and capable clients match all
  original response fields and **exact saved tables**, including seeded prior
  histories, pause/checkpoint/resume, replay rejection, completion and review.
  A separate grouped-case/abandon comparison also matches. Additive NGN
  metadata/null interaction fields are asserted before normalization. A test
  rejects any deferred cross-attempt history query.
- Authenticated real local Supabase runs of the revised candidate passed the
  complete mixed 16/45/85/150-response NGN suite: all types and exact partial
  scores, progressive six-stage cases, grouped ability/confidence, SQL
  concurrency/replay protection, draft/tab/timer persistence, fresh sign-in,
  ownership/RLS/admin controls and completed student/tutor reviews.
- Real local compatibility tests passed: cached clients start only the old
  model; incompatible clients cannot mutate NGN progress; admissions-off
  restart resumes a partial case through completion and exact score/rationale
  review; new attempts remain traditional. Paginated snapshots confirmed
  **31 prior completed synthetic attempts and 1,247 response rows** unchanged.
- Additional authenticated contract tests ran both the actual downloaded
  handler and the revised candidate on the disposable stack. For cached and
  capable clients, traditional CAT stopped at 30, mock at 85, and readiness at
  its fixed 85 in these synthetic mixed-answer runs, exactly as the actual
  hosted engine calculated. Every selected item belonged to the hosted
  shortlist; every binary score, difficulty/ability update, stop decision,
  checkpoint/resume, replay response, persisted completion and rationale
  review matched. Each run preserved its prior 155-response synthetic history.
  The revised candidate additionally passed a real grouped legacy case with
  preserved child arrays, binary keys and original per-child adaptive updates.
- The **actual downloaded production source**, not repository `10518df`, was
  served locally for authenticated new-client start/checkpoint/resume/answer/
  completion/review compatibility. That passed and retained the historical
  snapshots above. Frontend assets are unchanged from the browser-validated
  `bd24976`; dependency/version and missing-module protections remain covered.

Only loopback Supabase was used for authenticated writes; synthetic inventory
was reset only there. Local helpers and the disposable stack are stopped at
completion. Production source/metadata and secret-digest checks were read-only;
the admission switch remains explicitly **false**. No production test attempt,
submission, question activation/publication, student/history change, function
deployment, SQL operation, configuration change, Git push or merge occurred.

#### Next release gate

No remaining local legacy-baseline or NGN compatibility blocker was found.
The revised candidate needs owner review/approval before restarting rollout.
Do not deploy the superseded `bd24976` as-is. At the next approved rollout,
recheck the actual hosted bundle and admission-secret digest before server
deployment, then follow the admissions-off server-first sequence above and
the normal protected frontend workflow. Hosted packaging/live verification,
read-only eligible inventory review, production error-log monitoring and any
separately authorized production functional test remain rollout checks.
New NGN starts require separate activation approval. Rollback remains
admissions-off with compatible NGN resume/review retained, never a wholesale
revert to the legacy server once versioned attempts exist.

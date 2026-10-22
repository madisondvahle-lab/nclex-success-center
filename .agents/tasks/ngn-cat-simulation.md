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
- No clinical question, answer, rationale, or scoring changes have been
  authorized yet.

## Current implementation findings

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

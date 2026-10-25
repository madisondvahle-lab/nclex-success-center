# Bianca Edwards NUR 235 Test 2 — Final Focused Review

**Status:** Unpublished candidate; quality review complete, pending instructor
approval before any publication or student use.

**Scope:** Final presentation-scope and answer-choice review of
`bianca-nur235-test2-candidate-bank.json`. The original bank, published exam,
live assignments, and production records were not changed.

## Final disposition

The candidate retains 100 sequential question IDs, 70 single-select questions,
and 30 SATA questions, with 20 questions in each of the five course sections.
Q047 retains its corrected `A/B/C` key. No unresolved instructor-scope concern
was identified among the flagged items. Q073, Q074, and Q077 assess nearby
concepts expressly represented in the presentations; their original versions
remain available in the source bank for comparison.

The candidate is ready for instructor consideration, but this review does not
authorize publication. It must remain isolated until Bianca's instructor
explicitly approves it.

## Presentation-scope resolutions

| Question | Final focus | Presentation support |
|---|---|---|
| Q015 | Pupillary constriction and convergence with near focus | Eyes, slides 14 and 20 |
| Q023 | Temporomandibular-joint movement | Head/Face, slide 4 |
| Q027 | Focused headache history: onset, location/description, associated symptoms, and relieving/aggravating context | Head/Face, slides 5 and 10 |
| Q028 | Focused assessment of new temporal headache and tenderness without assigning a diagnosis | Head/Face, slides 4–6 and 10 |
| Q031 | Head/scalp inspection and palpation, facial observation, and focused history | Head/Face, slides 4–6 and 9–10 |
| Q033 | Objective description and baseline comparison of limited facial movement | Head/Face, slides 5, 9–10, and 14 |
| Q035 | Gentle temporal-artery assessment and objective documentation | Head/Face, slides 4 and 6 |
| Q047 | Observation of visible carotid and jugular findings; documentation and communication | Neck, slides 3 and 5 |
| Q050 | Basic thyroid inspection and observation during swallowing; advanced palpation/auscultation excluded | Neck, slides 5–6; slide 12 labels palpation and auscultation advanced |
| Q057 | Expected thyroid-region movement with swallowing; no diagnosis inferred from movement alone | Neck, slides 5–6 |
| Q073 | Nasal symmetry/patency and sinus tenderness assessment | ENMT, slide 14 |
| Q074 | Objective documentation of oral white patches without diagnosing by color alone | ENMT, slides 16–17 |
| Q075 | Foundational terminology: tonsillitis | ENMT, slides 16–17 |
| Q077 | Foundational terminology: dysphagia | ENMT, slide 22 |

All listed items were resolved using supported assessment concepts. The
replacements narrow unsupported content rather than introduce new lecture
coverage. No instructor confirmation is required for these items.

## Final focused edits and answer-choice findings

- Q027's SATA key is `A/B/C/D`: each keyed choice represents a relevant
  headache-history detail; the remaining choice directs the nurse to assume a
  familiar headache has the same cause and skip current assessment.
- Q035 now names gentle temporal-artery palpation and side-specific
  documentation. Q028 and Q031 source references were aligned to the
  presentations. Q050 and Q057 cite the basic thyroid-inspection slides, not
  the advanced-skills slide.
- Q048's distractors were rewritten as competing assessment or reporting
  actions. They no longer rely on obviously unsafe manipulation or unrelated
  actions to distinguish the correct option.
- After revising the underlying item construction, option order was calibrated
  for SATA answer-position balance in Q004, Q010, Q020, Q053, and Q084. Choice
  wording and clinical meaning were preserved; option rationales and keys were
  remapped with the choices. The final keys for these items are respectively
  `B/C/E`, `B/C/D/E`, `C/D/E`, `B/C/D/E`, and `B/C/D/E`.
- Q047 was not included in this position calibration; its corrected `A/B/C`
  key and observation/documentation meaning remain intact.
- The reviewed high-wording-overlap pairs (Q031/Q050, Q064/Q080, Q064/Q090,
  Q064/Q099, Q080/Q090, and Q090/Q099) use similar assessment-question
  templates but assess distinct concepts. Q074's documentation task and Q076's
  systematic oral/throat examination are also distinct; no additional
  duplicate-concept replacement was warranted.

## Answer-position and length measures

| Measure | Final result |
|---|---:|
| MCQ keyed positions | A 21, B 18, C 15, D 16 (70 items) |
| SATA keyed-option totals | A 22, B 22, C 21, D 22, E 23 (110 keyed selections) |
| SATA correct-set size | 10 items with 3 correct; 20 items with 4 correct |
| Correct option longer than every distractor | 37/70 |
| Correct option tied with the longest distractor | 2/70 |
| Correct option shorter than the longest distractor | 31/70 |
| Correct option more than 1.25 times the longest distractor | 0/70 |
| Mean keyed-option length vs. mean longest-distractor length | 88.43 vs. 88.01 characters |

MCQ keyed positions and SATA keyed-option totals are now balanced without
making the answer distribution identical across formats. SATA questions retain
both 3-answer and 4-answer sets. The mean answer/distractor lengths are nearly
equal, with no extreme keyed-option length outlier; a correct choice is still
the longest option in 37 items, so the residual longest-option count should be
monitored in any later empirical item analysis.

## Validation and preservation

- Candidate JSON parses and contains exactly 100 unique sequential IDs.
- Candidate structure retains the 70/30 single-select/SATA split and all five
  20-question categories.
- Every answer key maps to shown options; every option has a nonempty rationale;
  required stems/rationales/strategies are populated; source IDs are valid.
- Candidate-specific structural validation reported zero errors.
- `node --test tests/bianca-nur235-test2.test.cjs`: **5/5 passed**. This
  existing suite is a source-bank regression check; it reads the root bank,
  not the isolated candidate. Candidate validation above was run separately.
- A strict comparison to the source bank finds 97 candidate question records
  that differ and 3 exact copies: Q003, Q006, and Q008. This file-level
  comparison supersedes the earlier informal 89/11 estimate.
- No publish, merge, deployment, live-bank change, or student-assignment
  change was performed.

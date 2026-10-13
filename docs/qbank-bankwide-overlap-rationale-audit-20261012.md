# Bank-wide rationale and conceptual overlap audit
Read-only Supabase SQL analysis, 2026-10-12. Editorial analysis, not an automatic merge/deletion instruction.

## Measured coverage
- 363 total questions; 349 active; 88 course-specific.
- 0 stems exactly identical after stripping punctuation/spacing and normalizing case.
- 13 rationales under 80 characters; none under 40.
- Only 8 rationales matched selected textual option-explanation markers. This is a LOW-RECALL heuristic, **not** a reliable measure of actual option-specific explanation coverage.
- These counts are based on all rows, including inactive.

## Priority overlap clusters requiring editorial comparison
| Cluster | Question numbers | Observation | Recommendation |
|---|---|---|---|
| Neonatal respiratory distress | 10, 24, 53, 59, 119, 120, 125, 131, 307 | Many share grunting, retractions, flaring, tachypnea, and/or low saturation; some differ in whether they test recognition, urgency, or intervention. | Compare full stems and correct keys; retain distinct decisions; convert repeated recognition questions to response-to-intervention, escalation, or differential cases. |
| Umbilical stump care | 39, 91, 349 | Repeated dry-cord teaching. | Retain strongest teaching item, use remaining slots for signs of omphalitis and caregiver escalation if clinically justified. |
| Rh immune prophylaxis | 48, 62 | Nearly same 72-hour postpartum timing recall; 45 and 109 assess distinct Rh concepts. | Retain one timing item and develop an eligibility/treatment application item. |
| Prolapsed cord | 99, 143 | Near-identical first-action priorities. | Diversify second case into ongoing compression/emergency-team response. |
| Variable FHR decelerations | 43, 101, 162, 306 | Overlap in repositioning and often overly routine O2 language. | Consolidate generic response items, retain one nuanced tracing scenario with normal maternal SpO2; clinical review of every rationale. |
| Neonatal respiratory recognition | 119, 131 | Previously noted as overlapping (also included in larger cluster above). | Avoid double-counting as separate duplicate pairs. |

## Short rationales requiring targeted evaluation
290 dosage calculation (53 chars); 271 dosage calculation (58); 181 nephrotic syndrome (59); 196 skin prevention (69); 151 bulging fontanel (72); 62 Rh prophylaxis (73); 221 postpartum lochia (75); 224 amiodarone (75); 37 fundal landmarks (76); 216 dehydration (76); 253 osteoporosis (77); 152 falls prevention (78); 244 stroke response (79).
Length alone does not prove low quality: dosage calculations can be concise yet sufficient. Prioritize items with clinical reasoning/triage or plausible wrong options, not a blanket minimum word count.

## Next quality-control batch
1. Inspect full stems/options/keys for the respiratory-distress, cord-care, and variable FHR clusters.
2. Label each question by **clinical decision being assessed** (recognize / interpret / immediate action / reassess / escalate).
3. Compare rationales for internal contradiction; especially oxygen use in fetal monitoring.
4. Rank conceptual overlap as high/medium/low and retain any genuinely distinct learning objectives.
5. Only retire questions after human editorial signoff and history/assignment impact analysis.

## Read-only queries
- Counts of all rows, short rationales and text-pattern markers.
- Normalized stem equality groups.
- Top topic counts and targeted topic/stem listing.
No production data changed.

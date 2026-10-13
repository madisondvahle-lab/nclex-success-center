# NCLEX QBank — Clinical remediation queue
**Audit date:** 2026-10-12 · **Status:** Editorial review, NOT deployed · **Source:** Read-only Supabase audit
**Scope:** 93 distinct questions inspected in four rounds (75 + 18). Seven attempted records in round 4 were NOT retrieved; do not count them as reviewed. Total bank last observed: 363.

## Status rules
- **P0 / Unsafe:** current content may teach an unsafe intervention or a materially wrong diagnostic rule.
- **P1 / Substantive:** answer may be defensible but scenario or rationale teaches a misleading simplification.
- **P2 / Improve:** distractors, specificity, option-level explanations or duplication need work.
- **Retain:** no significant problem found in this audit; NOT proof of full clinical validation.
- **Workflow:** proposed -> clinical peer review -> approved -> versioned DB update -> regression check. Never update a keyed answer without reviewing question text and all options together.

## P0: Correct before reuse
| # | Disposition | Fault | Next action |
|---|---|---|---|
| 33 | REWRITE | DKA asks for potassium before insulin without reporting potassium; decision is conditional. | Replace with K=3.0 mEq/L case and ask which order to question. |
| 85 | REWRITE | APGAR 5 + HR 90/min keyed to stimulation and oxygen; persistent HR <100 after initial steps requires assisted ventilation. | Replace with scenario specifying initial steps completed and key PPV. |
| 38 | REWRITE | APGAR total incorrectly used to drive resuscitation actions. | Test Apgar interpretation separately from physiologic resuscitation algorithm. |
| 101 | REWRITE | Treats routine maternal O2 as part of default response to variable FHR decelerations. | Prioritize repositioning; explicitly state maternal SpO2 normal and add escalation indications. |
| 306 | RATIONALE FIX | Correct repositioning key; rationale incorrectly calls O2 the next universal step. | Remove routine O2 rule; individualize per maternal oxygenation. |

## P1: Important clinical precision
| # | Disposition | Fault | Next action |
|---|---|---|---|
| 29 | RATIONALE FIX | Proteinuria presented as mandatory for preeclampsia. | Explain hypertension with proteinuria OR qualifying end-organ features. |
| 103 | RATIONALE FIX | Preeclampsia diagnostic discussion over-emphasizes proteinuria and dipstick. | Include severe symptoms and end-organ criteria; don't equate dipstick alone with definitive diagnosis. |
| 55 | REWRITE | Says up to 10% newborn loss physiologically normal, without evaluation threshold/context. | Add day of life, feeds, output, and concerning loss; prompt assessment. |
| 227 | REWRITE | Confused SIADH patient: seizure precautions alone insufficient framing of symptomatic hyponatremia. | Include sodium, symptom trajectory, escalation; don't oversimplify hypertonic saline protocol. |
| 111 | REWRITE | Parkland formula presented as automatic adjustment rather than starting estimate. | Titrate burn resuscitation to urine output/perfusion per protocol. |
| 178 | REWRITE | Adrenal crisis only highlights fluids, omits urgent IV hydrocortisone. | Test combined immediate intervention. |
| 22 | RATIONALE FIX | Implies one universal therapeutic aPTT range for IV UFH. | Specify local protocol/assay. |
| 14 | RATIONALE FIX | Wet diapers on postpartum day 2 treated as independently sufficient to confirm intake. | Integrate weight, latch, feeding effectiveness, hydration. |
| 6 | RATIONALE FIX | Bleeding color described as diagnostic for previa/abruption. | Label as characteristic patterns rather than absolute. |
| 197 | IMPROVE | Firm uterus with heavy bleeding suggests trauma but initial hemorrhage response underdeveloped. | Highlight simultaneous assessment and escalation. |
| 123 | RATIONALE FIX | 'Use acetaminophen instead' is overly broad in warfarin teaching. | Add consult/prescriber and high/repeated dose INR interaction caveat. |
| 264 | RATIONALE FIX | Food described as ulcer prevention for NSAIDs. | Distinguish dyspepsia reduction from serious bleed risk. |
| 309 | RATIONALE FIX | Vaccine list lacks pregnancy-specific indications and timing. | Recheck current CDC recommendations at approval time. |
| 333 | RATIONALE FIX | Two-step GDM screening presented as universal. | Specify this clinic uses two-step method; note alternate one-step programs. |

## P2: Pedagogical value and duplicates
| # | Disposition | Fault | Next action |
|---|---|---|---|
| 48 / 62 | DEDUPE | Same Rh(D) postpartum 72-hour recall item. | Retain one; convert the other to application of prophylaxis eligibility. |
| 99 / 143 | DEDUPE | Near-identical cord prolapse intervention. | Retain emergency-action item; make companion an escalation scenario. |
| 119 / 131 | DEDUPE | Similar newborn respiratory distress identification. | Convert one to change-in-status response. |
| 126 | IMPROVE | Parking/insurance distractors implausible. | Build realistic time-out omission options. |
| 215 | IMPROVE | Acetylcysteine pure antidote recall. | Add timing, drug level/clinical cues for application. |
| 275 | IMPROVE | Distractors include unrelated pelvic condition. | Use credible breast differential. |
| 263 | RATIONALE FIX | Claims bradycardia not reported in stem. | Describe it as possible, not observed. |
| 154 | IMPROVE | Sudden PE-related hypotension asks only oxygen without emergency escalation. | Integrate rapid response/hemodynamic management. |
| 327 | IMPROVE | Eclampsia response choice contains multiple actions and trivial distractors. | Separate immediate nursing action from ongoing seizure management. |
| 159 / 185 / 253 | IMPROVE | Distractors overly obvious. | Increase plausible competing choices. |

## Provisional retain exemplars
73 (magnesium toxicity), 176 (culturally responsive education), 213 (capacity), 239 (ischemic-appearing stoma), 295 (late FHR decelerations). Retain decisions remain subject to clinical editorial validation.

## Source references
- ADA et al. 2024 hyperglycemic crises consensus: https://doi.org/10.2337/dci24-0032
- 2025 AHA/AAP Neonatal Resuscitation: https://publications.aap.org/pediatrics/article/157/1/e2025074352/205237/Part-5-Neonatal-Resuscitation-2025-American-Heart
- ACOG preeclampsia criteria: https://www.acog.org/community/districts-and-sections/district-iv/whats-new/countdown-to-intern-year-week-3-hypertensive-disorders
- ACOG Apgar limits: https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/10/the-apgar-score

## Unreviewed / tracking note
The source-of-truth question ID in Supabase is UUID. `question_no` is used here for editorial lookup only. Before any DB update, fetch the UUID and original revision, and verify no concurrent changes. This file is a versioned editorial tracker, not a Supabase schema migration.

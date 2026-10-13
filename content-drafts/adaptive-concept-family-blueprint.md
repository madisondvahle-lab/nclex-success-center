# NCLEX question families and adaptive remediation design

Status: editorial blueprint, not a deployed CAT algorithm.

## Principles
- Keep 50 questions per batch aligned with 2026 NCLEX-RN entry-level clinical judgment and client-needs proportions.
- Approximately 40–44 distinct nursing decisions and 6–10 *intentional* concept reassessments per batch (flexible; avoid arbitrary quotas).
- Similar core concept is acceptable only if **stem, scenario, answer options and cognitive task differ**. Do not reword a question with the same decision and distractors.
- Record `concept_family`, `decision_skill` (recognize/assess/prioritize/intervene/evaluate/teach/delegate), `variant_role` (new/retention_check/transfer), `difficulty_review`, and `source references` for each item.
- Example insulin family: recognize low glucose; treat conscious patient; respond to altered swallowing; prevent mealtime mismatch; identify recurrence; teach home management.
- Do not serve near-identical variants within one CAT sitting. Use later spaced remediation sessions or a different decision context, and track retention by concept.
- Psychometric CAT depends on empirically estimated item properties, exposure controls and validity checks; concept-based adaptive remediation is a separate earlier feature.
- Avoid misleading high difficulty driven by obscure diseases, advanced prescribing, or physician decisions. Challenge through plausible alternatives and nursing priority.
- Initial batch clinical reference review and independent publication approval remain required.

## Copilot implementation request
Persist concept and decision identifiers for questions, record per-attempt accuracy and timing, create related-item exposure limits, and support spaced concept-level remediation. Do not automatically publish or reimport existing questions. Backfill concept tags only with reviewable migration. Do not treat manually assigned difficulty as calibrated IRT difficulty.

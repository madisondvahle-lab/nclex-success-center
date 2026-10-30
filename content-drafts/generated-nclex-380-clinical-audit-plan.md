# Clinical audit queue — generated NCLEX questions

**Status: QUARANTINED / INACTIVE — NOT APPROVED FOR PUBLICATION**

Recorded 2026-10-12. Query scope: `public.questions.source_key ~ '^NEW-20261012-[0-9]{3}$'`.

## Verified baseline
- Database total: **743**
- Student-visible active questions: **363**
- Generated draft population: **380**, now **all inactive** (370 previously active were switched off; 10 already inactive)
- **275 / 380** generated records lack a structured reference list; the others' references are *not yet independently confirmed*.
- **0 / 380** generated records missing A–D rationale fields, but the rationales remain **clinically unverified**.
- **50 / 380** missing NCLEX category.
- **280 / 380** missing clinical judgment skill in the production schema.
- Do not interpret a complete rationale or supplied URL as approval.

## Review sequence
1. **Safety-critical first:** pharmacology, anticoagulants, insulin, IV medications, oxygenation, shock, stroke, obstetric hemorrhage, delegation and prioritization.
2. Check each stem for clinical correctness, sufficient assessment findings, a single defensible answer, new-graduate RN scope, clinical guidelines and appropriateness of all distractors.
3. Correct each **individual option-specific** rationale and attach direct reputable reference URLs with title, access date and relevant supporting guidance. A generic home page alone is inadequate.
4. Flag ambiguous/incorrect items for rewrite or retirement; verify that purposeful concept overlap tests a *new skill/context*, not disguised duplicate stems.
5. Complete a separate, human-confirmable sign-off before setting `active=true`. Approval should record reviewer, date, reference list, and content version.
6. Examine other non-generated questions in the 363 currently active items in a separate legacy audit; their current active status was not modified here.

## Audit ledger
Use one record per question keyed on `source_key`. Suggested columns:
`source_key,question_no,clinical_status,priority,concept_family,decision_skill,reference_verified,option_rationales_verified,scope_verified,overlap_disposition,reviewer,reviewed_at,notes`.
Clinical statuses: `not_reviewed`, `needs_revision`, `clinically_verified`, `approved_for_publish`, `retired`.

**Default status of all 380 items is `not_reviewed`.** Do not set `clinically_verified` solely based on heuristic checks or preexisting draft rationales.

## Immediate developer safeguard
The admin currently may allow publication based on older or incomplete review gates. Add a hard gate that requires `approved_for_publish` plus audit record/permissions for generated questions, with a visible badge. Do **not** use an unchecked editor-only browser variable as sole enforcement. Restrict the underlying database write policy or provide a trusted server-side publishing action with audit trails.

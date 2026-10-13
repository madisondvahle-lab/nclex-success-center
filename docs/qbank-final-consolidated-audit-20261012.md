# FINAL CONSOLIDATED QBank screen — 2026-10-12
**Status:** bank-wide automated/heuristic audit completed; clinical signoff NOT implied. **No production modifications.**

## Scope and measured checks
- Read all 363 current questions from public.questions in 5 read-only SQL batches.
- 0 invalid single-letter keys; 0 missing A/B/C/D choices; 0 identical options within an item.
- 56 rationales with fewer than 100 characters. This is an editorial triage signal, not automatic failure.
- 32 stem-similarity pair candidates with token-set Jaccard >=0.52 and >=4 matching non-stopwords; compared only within general NCLEX or within course pool. These are **candidates** not confirmed duplicate count.
- Existing exact punctuation-insensitive stem equality scan: 0. Similarity and option logic flags do not validate the correctness of answer keys.
- Previous focused clinical review: 93 distinct questions inspected manually; existing detailed clinical corrections and drafts are already in this PR.

## High-confidence redundant pairs confirmed by closer source comparison
- **#83 / #148:** effectively identical newborn vitamin K question; both key B. Retain the more complete rationale (#148), repurpose #83.
- **#35 / #144:** same day-5 breastfed newborn, 4 wet diapers; both key B. Retain one, create application to weight trajectory/feeding safety.
- **#16 / #45:** same Rh-negative pregnancy / positive antibody screen scenario; both teach overgeneralized 'positive screen = immune anti-D'. Rewrite together to distinguish antibody specificity and passive anti-D.
- **#39 / #91:** essentially duplicated stump-care discharge teaching, previously reviewed.
- **#48 / #62:** duplicated postpartum RhIg 72-hour timing, previously reviewed.
- **#11 / #17:** essentially identical early-deceleration interpretation.
- **#41 / #72:** essentially identical acrocyanosis versus central cyanosis teaching.
- **#90 / #145:** nearly identical ductus venosus recognition.
- **#119 / #120:** nearly identical neonatal respiratory distress interpretation.
- **#27 / #89:** nearly identical late-deceleration presentation; both rationales recommend routine maternal O2 even without maternal hypoxia status; PRIORITY correction.
- **#79 / #146** superficially similar triage stems but DIFFERENT urgent conditions/keys; do NOT auto-dedupe.
- **#157 / #250** similar pancreatitis pain stems but different answer keys and tasks. Clinical editorial comparison required; do NOT auto-dedupe.

## Prioritized issues prior to expansion
P0: #33 DKA potassium unknown; #38 and #85 APGAR/resuscitation; #43, #101, #27, #89 maternal oxygen overgeneralization; #16/#45 positive antibody screen specificity.
P1: #22 UFH aPTT local assay, #55 weight loss, #103 and #29 proteinuria preeclampsia, #111 burns fluids, #178 adrenal crisis, #227 SIADH, #306 FHR oxygen rationale, #109 Rh incompatibility.
P2: short rationales and overlap clusters; medication monitoring nuance (#71, #263 digoxin target versus toxicity and patient symptoms, #133 magnesium treatment sequence, #123 warfarin/NSAID), plus duplicates above.
These statuses are provisional editorial categories, not adjudicated medical-device validations.

## Rollout recommendation: Audit gate is COMPLETE
The whole bank has now been structurally screened. Existing known P0 issues should be handled before treating affected questions as clinically approved. **Do not hold expansion hostage to checking every other item.** Develop new NCLEX questions in controlled 25–50 item batches with independent answer/rationale review and duplication checks against original 363 plus new inventory.

## Next workflow
1. Update the correction queue using identified P0 issues #16, #27, #89.
2. Have clinician review high-risk drafts before any production content write.
3. Distinct NCLEX general vs nur321 course assignments, student history and UUID retained.
4. Start first 50 NEW items after resolving any active safety-critical corrections or excluding flagged items from student delivery.
5. Every new batch passes the structural checks above, topic/objective overlap check, four-option rationales, current reference and single-key review.

**Important:** A 363-row structural and similarity screen is not the same as individual clinical verification of all 363. No claim that the unreviewed 270 items are medically validated.

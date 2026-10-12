# Neonatal respiratory-distress overlap: nine-item comparative audit
Date: 2026-10-12. Source: current Supabase question rows fetched read-only. Proposed changes are editorial only.

## Exact findings
| # | Pool | Decision currently tested | Disposition |
|---|---|---|---|
| 10 | General NCLEX | Initial airway assessment and urgent help for hypoxemic newborn | Retain provisionally, compare with #59 |
| 24 | General NCLEX | Initial respiratory assessment/support with SpO2 86% | Retain provisionally; strongest immediate-action phrasing |
| 53 | General NCLEX, labelled case study | Identify most threatening observation (central cyanosis + SpO2 86%) | Keep pending companion-case context review; distractors somewhat obvious |
| 59 | General NCLEX | Same urgent response, nearly same stem and options as #10 | High-confidence near-duplicate: repurpose or retire after checking practice history |
| 119 | General NCLEX | Interpret grunting/flaring/retractions as respiratory distress | Retain one recognition item, compare #120 |
| 120 | General NCLEX | Almost the same stem/options/key as #119 | High-confidence near-duplicate: repurpose |
| 125 | General NCLEX | Persistent grunting/flaring warrants urgent assessment | Overlapping priority; rewrite toward reassessment/evolving status |
| 131 | General NCLEX | Identify increased work of breathing (intercostal retractions) | Foundational item; retain provisionally |
| 307 | Course-specific (nur321) | Interpret same neonatal distress triad | Keep course pool separate; rationale incorrectly equates grunting specifically with low surfactant |

No automatic retirement: these questions could be attached to assignments or attempt history. Distinguish course-specific practice objectives from general NCLEX duplicate detection.

## Draft A: replace general NCLEX #59 with response-to-intervention assessment
**Stem:** A 2-hour-old newborn has grunting, retractions and oxygen saturation of 86% on room air. The nurse initiates indicated respiratory support while the neonatal team arrives. Five minutes later the infant is less responsive, has intermittent apnea and a heart rate of 88/min. What is the nurse's priority?
A. Continue observation because oxygen saturation was initially low.
B. Begin or assist positive-pressure ventilation according to neonatal resuscitation protocol and summon immediate neonatal support.
C. Offer a feeding to stimulate the infant.
D. Wait for an arterial blood gas before intervening.
**Key B.**
**Options:** A delays support despite deterioration. B addresses ineffective ventilation/apnea and HR <100/min. C creates aspiration risk and does not address respiratory failure. D delays time-critical ventilation. **Clinical judgment target:** recognize deterioration and escalate to effective ventilation; do not equate supplemental oxygen with ventilation.

## Draft B: replace general NCLEX #120 with respiratory status reassessment
**Stem:** A newborn with previously mild tachypnea is now grunting persistently, has nasal flaring, subcostal retractions, and an oxygen saturation of 89% on room air at 3 hours of age. Which new finding most strongly indicates worsening respiratory compromise?
A. The newborn has brief sneezing without distress.
B. Intercostal retractions have become more pronounced and the infant has pauses in breathing.
C. The newborn has acrocyanosis limited to the feet.
D. The newborn passes meconium.
**Key B.**
**Options:** A is nonspecific; B shows increasing work of breathing plus ineffective breathing; C peripheral color change can occur normally; D gastrointestinal elimination is unrelated. **Clinical judgment target:** interpret trend and neurologic/respiratory deterioration, rather than merely recognize the neonatal distress triad.

## Draft C: replace general NCLEX #125 with feeding safety
**Stem:** A 12-hour-old newborn is persistently tachypneic at 76/min with grunting and nasal flaring. The parent asks to breastfeed now. What should the nurse do first?
A. Encourage feeding immediately because crying increases oxygen demand.
B. Assess and escalate the respiratory distress, defer oral feeding until the infant is clinically stable and feeding safety is evaluated.
C. Offer a larger-volume bottle feed to reduce feeding time.
D. Place the newborn supine and leave to rest until the next assessment.
**Key B.**
**Options:** A and C risk unsafe oral feeding in an infant with significant distress; B prioritizes oxygenation and clinical assessment while supporting parent involvement; D delays escalation. **Clinical judgment target:** apply respiratory assessment to feeding safety.

## Rationale-only correction: course-specific #307
Retain key B provisionally. Replace the claim "grunting = ... = low surfactant" with: "Grunting, flaring, tachypnea and retractions indicate increased work of breathing and possible respiratory compromise. Expiratory grunting helps generate end-expiratory pressure to maintain lung volume; it is not diagnostic of surfactant deficiency. RR 74/min is above the usual resting newborn range, so promptly assess oxygenation and seek neonatal evaluation."

## Implementation checks before approval
- Verify latest neonatal resuscitation guidance for ventilation indications and first-minutes context. Distinguish newborn resuscitation following delivery from subsequent nursery deterioration and local emergency protocols.
- Confirm option sets contain a single best answer and avoid giving away the key via implausible alternatives.
- Check overlap of the three drafts against the full 363-item bank before approval.
- Review whether #53 is part of a case set with a linked introduction.
- Preserve `nur321` course bank isolation.
- Preserve historical student responses and UUIDs; no automatic delete, deactivate, or answer-key overwrite.

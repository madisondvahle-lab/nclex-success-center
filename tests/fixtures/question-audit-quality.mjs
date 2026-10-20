// Exact saved Q-0024 wording used only as a regression fixture, never as a new correction.
export const q0024 = {
  stem: 'A 2-hour-old newborn has grunting, nasal flaring, retractions, and oxygen saturation of 86% on room air. What is the nurse\u2019s priority action?',
  option_a: 'Call the parents before beginning assessment',
  option_b: 'Document and reassess at the next routine vital-sign check',
  option_c: 'Assess and support airway and breathing immediately while calling for neonatal assistance',
  option_d: 'Delay respiratory care until a blood glucose result is available',
  correct_answer: 'c', difficulty: 'hard', item_type: 'mcq', item_data: null,
  nclex_category: 'Physiological Adaptation', topic: 'Respiratory Distress', module_key: 'm1',
  rationale: 'Grunting, flaring, retractions, and low oxygen saturation indicate respiratory compromise requiring immediate airway and breathing assessment, appropriate support, and neonatal escalation. Documentation, notification of family, and glucose testing do not take precedence over stabilizing breathing.',
  option_rationales: {},
};

export const q0024PoorProposal = {
  ...q0024,
  option_a: 'Begin immediate assessment and provide respiratory support while summoning neonatal assistance',
  option_b: 'Notify the parents before starting any interventions',
  option_c: 'Wait for a blood glucose result before intervening',
  option_d: 'Record findings and check vital signs again in 30 minutes',
  correct_answer: 'a', difficulty: 'medium',
};

// Synthetic reports test gate behavior; they are not clinical endorsements.
export const goodQuality = (rating = 'easy', count = 4) => ({
  acceptable: true,
  options: Array.from({ length: count }, (_, i) => ({
    option: i + 1, plausible: true, reason: `Synthetic assessment of clinical decision ${i + 1}, its appeal and relative priority.`,
  })),
  cueing: { only_one_addresses_problem: false, correct_more_comprehensive: false, answer_apparent_without_knowledge: false, rationale_in_options: false },
  difficulty: { rating, reason: 'Synthetic difficulty assessment based on reasoning required.', multiple_cues_required: rating === 'hard', competing_priorities: rating !== 'easy' },
});

export const goodVerdict = (rating = 'medium', count = 4) => ({
  answer: [1], multiple_defensible: false, clinical_accuracy_concern: false,
  sufficient_information: true, entry_level_appropriate: true,
  implausible_distractors: [], answer_clues: [], concerns: [], quality: goodQuality(rating, count),
});

export const goodImprovement = (codes = ['distractors'], mode = 'targeted') => ({
  materially_improved: true, cosmetic_only: false, same_category: true, mode,
  replacement_reason: mode === 'replacement' ? 'Original concept could not support realistic competing alternatives.' : '',
  weaknesses: codes.map(code => ({ code, resolved: true, evidence: `Synthetic original-versus-proposed evidence for ${code}.` })),
});

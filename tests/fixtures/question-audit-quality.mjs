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
export const goodQuality = (rating = 'easy', count = 4, correct = [0]) => ({
  acceptable: true,
  objective: {
    concept: 'Clinical concept under assessment',
    clinical_decision: 'Choose the most appropriate response in context',
    knowledge_required: 'Apply relevant entry-level nursing principles',
    minimum_data: 'Stem supplies relevant findings and priority context',
  },
  options: Array.from({ length: count }, (_, i) => {
    const keyed = correct.includes(i);
    return {
      option: i + 1,
      category: keyed ? (correct.length > 1 ? 'keyed_correct' : 'best_answer') : 'appropriate_lower_priority',
      clinical_reasoning: keyed ? `Option ${i + 1} best addresses the stated decision.` : `Option ${i + 1} can be appropriate at another point but is lower priority in this scenario.`,
      why_student_might_choose: keyed ? '' : 'A student may choose this reasonable nursing action.',
      distinguishing_knowledge: keyed ? '' : 'The stem supports that another action takes priority now.',
      stem_supports_exclusion: true,
    };
  }),
  cueing: { only_one_addresses_problem: false, correct_more_comprehensive: false, answer_apparent_without_knowledge: false, rationale_in_options: false },
  difficulty: { rating, reason: 'Synthetic difficulty assessment based on reasoning required.', multiple_cues_required: rating === 'hard', competing_priorities: rating !== 'easy' },
});

export const goodVerdict = (rating = 'medium', count = 4, correct = [0]) => ({
  answer: [1], multiple_defensible: false, clinical_accuracy_concern: false,
  sufficient_information: true, entry_level_appropriate: true,
  implausible_distractors: [], answer_clues: [], concerns: [], quality: goodQuality(rating, count, correct),
});

export const goodImprovement = (codes = ['distractors'], mode = 'targeted') => ({
  materially_improved: true, cosmetic_only: false, same_category: true, mode,
  replacement_reason: mode === 'replacement' ? 'Original concept could not support realistic competing alternatives.' : '',
  learning_objective_preserved: true,
  objective_change_reason: 'none',
  objective_evidence: 'The same clinical decision and knowledge are assessed.',
  rationale_accuracy: { accurate: true, issues: [] },
  nclex_relevance: { relevant: true, evidence: 'Entry-level RN practice.' },
  weaknesses: codes.map(code => ({ code, resolved: true, evidence: `Synthetic original-versus-proposed evidence for ${code}.` })),
});

export const q0024LowerPriorityReview = {
  acceptable: false,
  objective: {
    concept: 'Recognition of neonatal respiratory compromise',
    clinical_decision: 'Select the immediate nursing priority',
    knowledge_required: 'Recognize respiratory distress and prioritize stabilization',
    minimum_data: 'Signs of distress and low oxygen saturation',
  },
  options: [
    { option: 1, category: 'clinically_implausible', clinical_reasoning: 'Parent notification cannot precede immediate assessment and stabilization in this acute presentation.', why_student_might_choose: 'Family communication is important.', distinguishing_knowledge: 'Immediate stabilization takes precedence.', stem_supports_exclusion: true },
    { option: 2, category: 'clinically_implausible', clinical_reasoning: 'A routine recheck delays response to current respiratory compromise.', why_student_might_choose: 'Reassessment is part of nursing care.', distinguishing_knowledge: 'The findings already require immediate action.', stem_supports_exclusion: true },
    { option: 3, category: 'best_answer', clinical_reasoning: 'Directly addresses the respiratory emergency.', why_student_might_choose: '', distinguishing_knowledge: '', stem_supports_exclusion: true },
    { option: 4, category: 'clinically_implausible', clinical_reasoning: 'An unrelated glucose result should not delay respiratory support.', why_student_might_choose: 'Glucose assessment is part of newborn care.', distinguishing_knowledge: 'The acute airway/breathing problem takes precedence.', stem_supports_exclusion: true },
  ],
  cueing: { only_one_addresses_problem: true, correct_more_comprehensive: true, answer_apparent_without_knowledge: true, rationale_in_options: false },
  difficulty: { rating: 'easy', reason: 'Recognize an obvious acute respiratory emergency.', multiple_cues_required: false, competing_priorities: false },
};

export const q0024PoorDesign = {
  concept: 'Recognition of neonatal respiratory compromise',
  clinical_decision: 'Select the immediate nursing priority',
  knowledge_required: 'Recognize respiratory distress and prioritize stabilization',
  minimum_data: 'Signs of distress and low oxygen saturation',
  distractors: [
    { option: 2, category: 'clinically_implausible', why_student_might_choose: 'A student might overvalue routine documentation.', distinguishing_knowledge: 'Immediate response is required.', stem_supports_exclusion: true },
    { option: 3, category: 'clinically_implausible', why_student_might_choose: 'A student might mistake unrelated testing as a prerequisite.', distinguishing_knowledge: 'Do not delay stabilization.', stem_supports_exclusion: true },
    { option: 4, category: 'clinically_implausible', why_student_might_choose: 'A student might prioritize family notification.', distinguishing_knowledge: 'Stabilize first.', stem_supports_exclusion: true },
  ],
};

export const buildDesignPlan = (options, correct, objective = {}) => {
  const keys = new Set(correct.map(position => Number(position) - 1));
  return {
    concept: objective.concept || 'Clinical concept under assessment',
    clinical_decision: objective.clinical_decision || 'Choose the best action in context',
    knowledge_required: objective.knowledge_required || 'Apply entry-level nursing principles',
    minimum_data: objective.minimum_data || 'Use the case facts supplied',
    distractors: options.flatMap((_, i) => keys.has(i) ? [] : [{
      option: i + 1, category: 'appropriate_lower_priority',
      why_student_might_choose: 'A student may choose this relevant clinical action.',
      distinguishing_knowledge: 'Another action has priority based on the case findings.',
      stem_supports_exclusion: true,
    }]),
  };
};

export const q0024GoodDifficultyRepair = {
  ...q0024,
  options: [
    { option: 1, category: 'best_answer', clinical_reasoning: 'Responds to immediate respiratory distress.', why_student_might_choose: '', distinguishing_knowledge: '', stem_supports_exclusion: true },
    { option: 2, category: 'appropriate_lower_priority', clinical_reasoning: 'Assessment is appropriate but must accompany immediate stabilization.', why_student_might_choose: 'Focused assessment is a core nursing action.', distinguishing_knowledge: 'Findings already establish respiratory compromise requiring concurrent support.', stem_supports_exclusion: true },
    { option: 3, category: 'appropriate_lower_priority', clinical_reasoning: 'Escalation is appropriate but should not delay immediate stabilization.', why_student_might_choose: 'Additional help is needed.', distinguishing_knowledge: 'The nurse can initiate stabilization while summoning help.', stem_supports_exclusion: true },
    { option: 4, category: 'plausible_misconception', clinical_reasoning: 'A learner may assume a diagnostic result should precede treatment.', why_student_might_choose: 'Glucose testing can be relevant in newborn care.', distinguishing_knowledge: 'It does not explain or treat the immediate respiratory findings.', stem_supports_exclusion: true },
  ],
  cueing: { only_one_addresses_problem: false, correct_more_comprehensive: false, answer_apparent_without_knowledge: false, rationale_in_options: false },
  difficulty: { rating: 'easy', reason: 'Recognize and respond to an acute emergency.', multiple_cues_required: false, competing_priorities: false },
};

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  autoFixContent, assessItemQuality, compareVerification, contentHash, objectiveAssessmentProblems, optionQualityProblems, prioritize, revisionDesignProblems, revisionImprovementProblems, screenDeterministic,
  snapshotContent, syncScoring, validateContent,
} from '../shared/question-audit-core.mjs';
import { goodQuality, goodVerdict, goodImprovement, q0024, q0024PoorProposal, q0024LowerPriorityReview } from '../../../tests/fixtures/question-audit-quality.mjs';

const mcq = (overrides = {}) => snapshotContent({
  stem: 'A client receiving heparin has new epistaxis and bruising. Which action should the nurse take first?',
  option_a: 'Review the most recent aPTT result',
  option_b: 'Apply ice to the forehead',
  option_c: 'Increase the infusion rate',
  option_d: 'Encourage fluids',
  correct_answer: 'a',
  rationale: 'Bleeding on heparin requires checking coagulation status before the next dose or rate decision is made.',
  difficulty: 'medium', topic: 'Anticoagulants', nclex_category: 'Pharmacological Therapies', clinical_judgment_skill: 'Analyze cues',
  option_rationales: { a: 'a', b: 'b', c: 'c', d: 'd' }, reference_list: [], item_type: 'mcq',
  ...overrides,
});
const sata = (overrides = {}) => snapshotContent({
  stem: 'Which findings indicate a complication? Select all that apply.', rationale: 'Because.', difficulty: 'hard', topic: 'T', nclex_category: 'C',
  clinical_judgment_skill: 'x', item_type: 'sata', is_ngn: true,
  item_data: { correct: [0, 2], options: ['One', 'Two', 'Three', 'Four', 'Five'] },
  option_rationales: { 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' }, reference_list: [],
  ...overrides,
});
const errors = content => validateContent(content).filter(issue => issue.severity === 'error');

test('snapshot matches the keys compared by apply_question_revision', () => {
  assert.deepEqual(Object.keys(mcq()).sort(), [
    'clinical_judgment_skill', 'correct_answer', 'difficulty', 'is_ngn', 'item_data', 'item_type', 'module_key', 'nclex_category',
    'nclex_sub', 'option_a', 'option_b', 'option_c', 'option_d', 'option_rationales', 'rationale', 'reference_list', 'stem', 'topic',
  ]);
});

test('content hash is stable, key-order independent, and changes with content', () => {
  const a = mcq();
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(contentHash(a), contentHash(reordered));
  assert.notEqual(contentHash(a), contentHash(mcq({ option_b: 'Apply ice' })));
});

test('valid MCQ and SATA items have no structural errors', () => {
  assert.deepEqual(errors(mcq()), []);
  assert.deepEqual(errors(sata()), []);
});

test('MCQ validation reports field-specific errors', () => {
  assert.equal(errors(mcq({ correct_answer: 'e' }))[0].field, 'correct_answer');
  assert.equal(errors(mcq({ option_c: '  ' }))[0].field, 'option_c');
  assert.ok(errors(mcq({ option_d: 'review the most recent aPTT result' })).some(issue => issue.field === 'option_d'));
  assert.ok(errors(mcq({ option_rationales: { a: 'x', e: 'y' } })).some(issue => issue.field === 'option_rationales.e'));
  assert.ok(errors(mcq({ option_rationales: [] })).some(issue => issue.field === 'option_rationales'));
});

test('options that differ only by a symbol are not duplicates', () => {
  const rh = mcq({ option_a: 'Rh+ mother / Rh\u2013 baby', option_b: 'Rh\u2013 mother / Rh+ baby', option_c: 'Rh+ mother / Rh+ baby', option_d: 'Rh\u2013 mother / Rh\u2013 baby' });
  assert.deepEqual(errors(rh), []);
  assert.ok(errors(mcq({ option_d: 'Review the most recent aPTT result.' })).length === 0);
});

test('SATA validation catches stale or invalid scoring metadata', () => {
  assert.ok(errors(sata({ item_data: { correct: [0, 9], options: ['a', 'b', 'c', 'd', 'e'] } })).some(issue => issue.field === 'item_data.correct'));
  assert.ok(errors(sata({ item_data: { correct: [], options: ['a', 'b', 'c', 'd'] } })).some(issue => issue.field === 'item_data.correct'));
  assert.ok(errors(sata({ item_data: { correct: [1, 1], options: ['a', 'b', 'c', 'd'] } })).some(issue => issue.message.includes('duplicates')));
  assert.ok(errors(sata({ item_data: { correct: [0], options: ['a', 'b', 'c'] } })).some(issue => issue.field === 'item_data.options'));
  assert.ok(errors(sata({ item_data: null })).some(issue => issue.field === 'item_data'));
  assert.ok(errors(sata({ option_rationales: { 0: 'a', 7: 'b' } })).some(issue => issue.field === 'option_rationales.7'));
});

test('missing rationales are advisory for originals and blocking for revisions', () => {
  const content = mcq({ option_rationales: {} });
  assert.deepEqual(errors(content), []);
  assert.equal(validateContent(content, { requireRationales: true }).filter(issue => issue.severity === 'error').length, 4);
});

test('legacy bare-URL references warn instead of blocking', () => {
  const issues = validateContent(mcq({ reference_list: ['https://example.org/x'] }));
  assert.equal(issues.find(issue => issue.field === 'reference_list').severity, 'warning');
  assert.equal(validateContent(mcq({ reference_list: [{ title: '', url: 'nope' }] })).find(issue => issue.field === 'reference_list').severity, 'error');
});

test('syncScoring realigns SATA metadata without inventing a key', () => {
  const next = syncScoring(sata({ item_data: { correct: [2, 0, 2], options: [' One ', 'Two', 'Three', 'Four'] } }));
  assert.deepEqual(next.item_data, { correct: [0, 2], options: ['One', 'Two', 'Three', 'Four'] });
});

test('syncScoring leaves MCQ item_data null and rebuilds it when present', () => {
  assert.equal(syncScoring(mcq()).item_data, null);
  const next = syncScoring(mcq({ item_data: { options: ['stale'], correct: [3] } }));
  assert.deepEqual(next.item_data.correct, [0]);
  assert.equal(next.item_data.options[0], 'Review the most recent aPTT result');
});

test('autoFix changes whitespace only', () => {
  const { content, changes } = autoFixContent(mcq({ stem: '  A  client  with   pain. ', option_a: 'Review\t ' }));
  assert.equal(content.stem, 'A client with pain.');
  assert.equal(content.option_a, 'Review');
  assert.deepEqual(changes.sort(), ['option_a', 'stem']);
  assert.deepEqual(autoFixContent(mcq()).changes, []);
});

test('deterministic screen flags answer-choice clues', () => {
  const weak = mcq({
    option_a: 'Immediately assess airway patency to prevent further deterioration of the client',
    option_b: 'Ignore it', option_c: 'Never reposition', option_d: 'Reassure the client',
  });
  const codes = screenDeterministic(weak).signals.map(signal => signal.code);
  for (const code of ['key_longer', 'coaching_phrase', 'generic_option', 'absolute_distractors', 'very_short_option']) assert.ok(codes.includes(code), code);
  assert.equal(screenDeterministic(sata({ item_type: 'matrix' })).supported, false);
});

test('prioritization follows the requested order', () => {
  const q = { active: true };
  assert.equal(prioritize({ question: q, openFlags: 1 }).priority, 1);
  assert.equal(prioritize({ question: q, anyFlags: 1 }).priority, 1);
  assert.equal(prioritize({ question: q, structuralErrors: 1 }).priority, 2);
  assert.equal(prioritize({ question: q, score: 5 }).priority, 3);
  assert.equal(prioritize({ question: q }).priority, 4);
  assert.equal(prioritize({ question: { active: false } }).priority, 5);
});

test('verification must match the key and raise no concerns', () => {
  const content = mcq();
  assert.equal(compareVerification(content, { ...goodVerdict(), answer: [0] }).agrees, true);
  assert.equal(compareVerification(content, { answer: [1] }).agrees, false);
  assert.equal(compareVerification(content, { answer: [0], multiple_defensible: true }).agrees, false);
  assert.equal(compareVerification(sata(), { ...goodVerdict(), answer: [2, 0] }).agrees, true);
  assert.equal(compareVerification(sata(), { answer: [0] }).agrees, false);
});

test('Q-0024 delay choices trigger contextual review, but AI quality categories decide whether they are acceptable', () => {
  for (const content of [q0024, q0024PoorProposal]) {
    assert.ok(screenDeterministic(content).signals.some(signal => signal.code === 'potential_delay_of_care'));
    assert.deepEqual(optionQualityProblems(content), [], 'delay language is a contextual warning, not a blanket hard rejection');
  }
  assert.ok(assessItemQuality(q0024, q0024LowerPriorityReview).some(issue => issue.code === 'distractors'));
  const proposalReview = {
    ...q0024LowerPriorityReview,
    options: q0024LowerPriorityReview.options.map(row => row.option === 3
      ? { ...row, option: 1, category: 'best_answer' }
      : { ...row, option: row.option === 1 ? 2 : row.option === 2 ? 3 : 4 }),
  };
  assert.ok(assessItemQuality(q0024PoorProposal, proposalReview).some(issue => issue.code === 'distractors'));
});

test('Q-0024-style hard label fails without multi-cue reasoning and competing priorities', () => {
  const report = goodQuality('hard');
  report.difficulty.multiple_cues_required = false;
  report.difficulty.competing_priorities = false;
  assert.ok(assessItemQuality(q0024, report).some(issue => issue.code === 'difficulty'));
  assert.ok(assessItemQuality(q0024, goodQuality('easy')).some(issue => issue.code === 'difficulty'));
});

test('each distractor needs a complete, individually justified plausibility decision', () => {
  for (const options of [
    goodQuality().options.slice(1),
    [...goodQuality().options.slice(1), goodQuality().options[1]],
    goodQuality().options.map(row => ({ ...row, clinical_reasoning: '' })),
  ]) assert.ok(assessItemQuality(mcq({ difficulty: 'easy' }), { ...goodQuality(), options }).some(issue => issue.code === 'quality_report'));
  const report = goodQuality();
  report.options[1].category = 'clinically_implausible';
  assert.ok(assessItemQuality(mcq({ difficulty: 'easy' }), report).some(issue => issue.code === 'distractors'));
});

test('each cueing dimension, difficulty mismatch, missing quality, and overall rejection blocks quality', () => {
  const content = mcq({ difficulty: 'easy' });
  assert.deepEqual(assessItemQuality(content, goodQuality()), []);
  for (const code of Object.keys(goodQuality().cueing)) {
    const report = goodQuality(); report.cueing[code] = true;
    assert.ok(assessItemQuality(content, report).some(issue => issue.code === code));
  }
  assert.ok(assessItemQuality(content, undefined).length);
  assert.ok(assessItemQuality(content, { ...goodQuality(), acceptable: false }).length);
  assert.ok(assessItemQuality(content, goodQuality('hard')).some(issue => issue.code === 'difficulty'));
});

test('correct answer agreement cannot clear implausible distractors, cues, clinical concerns, or incomplete flags', () => {
  for (const change of [
    { concerns: ['Unsafe item'] }, { clinical_accuracy_concern: true },
    { sufficient_information: undefined }, { answer: [0, 'invalid'] },
  ]) assert.equal(compareVerification(mcq(), { ...goodVerdict(), answer: [0], ...change }).agrees, false);
  const quality = goodQuality(); quality.options[1].category = 'clinically_implausible';
  assert.equal(compareVerification(mcq(), { ...goodVerdict(), answer: [0] }).agrees, true);
  assert.ok(assessItemQuality(mcq(), quality).some(issue => issue.code === 'distractors'), 'quality is an independent gate after key agreement');
});

test('permutation, rationale expansion, and cosmetic paraphrase cannot pass the improvement gate', () => {
  const original = snapshotContent(q0024);
  const swapped = { ...original, option_a: original.option_c, option_c: original.option_a, correct_answer: 'a', rationale: 'An expanded explanation.' };
  assert.ok(revisionImprovementProblems(original, swapped, ['distractors'], goodImprovement()).some(message => /order changed/.test(message)));
  assert.ok(revisionImprovementProblems(original, q0024PoorProposal, ['distractors'], { ...goodImprovement(), cosmetic_only: true }).length);
  assert.ok(revisionImprovementProblems(original, q0024PoorProposal, ['distractors', 'difficulty'], goodImprovement()).some(message => /difficulty/.test(message)));
  assert.ok(revisionImprovementProblems(original, q0024PoorProposal, ['distractors'], undefined).length);
});

test('rationale-only and difficulty-only repairs remain allowed when they are the sole weaknesses', () => {
  const original = mcq();
  assert.deepEqual(revisionImprovementProblems(original, { ...original, rationale: 'Improved explanation.' }, ['rationale'], goodImprovement(['rationale'])), []);
  assert.deepEqual(revisionImprovementProblems(original, { ...original, difficulty: 'easy' }, ['difficulty'], goodImprovement(['difficulty'])), []);
  assert.deepEqual(revisionImprovementProblems(original, { ...original, correct_answer: 'b' }, ['clinical_accuracy'], goodImprovement(['clinical_accuracy'])), [], 'a genuinely corrected clinical key is not mere option rearrangement');
  assert.ok(revisionImprovementProblems(original, original, ['difficulty'], goodImprovement(['difficulty'])).length);
});

test('replacement needs a genuinely new scenario, same category, and a documented reason', () => {
  const replacement = { ...q0024, stem: 'A different clinical scenario for a related objective.' };
  const report = goodImprovement(['distractors'], 'replacement');
  assert.deepEqual(revisionImprovementProblems(q0024, replacement, ['distractors'], report), []);
  assert.ok(revisionImprovementProblems(q0024, q0024, ['distractors'], report).length);
  assert.ok(revisionImprovementProblems(q0024, { ...replacement, nclex_category: 'Unrelated' }, ['distractors'], report).length);
  assert.ok(revisionImprovementProblems(q0024, replacement, ['distractors'], { ...report, replacement_reason: '' }).length);
  assert.ok(revisionImprovementProblems(q0024, replacement, ['distractors'], {
    ...report, learning_objective_preserved: false, objective_change_reason: 'unsuitable',
  }).some(message => /Changing the learning objective/.test(message)));
  assert.deepEqual(revisionImprovementProblems(q0024, replacement, ['distractors'], {
    ...report, learning_objective_preserved: false, objective_change_reason: 'unsuitable',
    objective_change_evidence: 'The original concept cannot support safe, defensible competing alternatives.',
  }), []);
  assert.ok(revisionImprovementProblems(q0024, replacement, ['distractors'], {
    ...report, rationale_accuracy: { accurate: false, issues: ['Key rationale conflicts with option B.'] },
  }).some(message => /rationale errors/.test(message)));
});

test('objective must be explicit, and revision design must explain each distractor before review', () => {
  const objective = goodQuality().objective;
  assert.deepEqual(objectiveAssessmentProblems(objective), []);
  assert.ok(objectiveAssessmentProblems({ concept: 'x' }).length);
  const content = mcq({ difficulty: 'easy' });
  const plan = {
    ...objective,
    distractors: [2, 3, 4].map(option => ({
      option, category: 'appropriate_lower_priority', why_student_might_choose: 'It is relevant.',
      distinguishing_knowledge: 'The stem establishes a more urgent need.', stem_supports_exclusion: true,
    })),
  };
  assert.deepEqual(revisionDesignProblems(content, plan, objective), []);
  assert.ok(revisionDesignProblems(content, { ...plan, distractors: plan.distractors.slice(1) }, objective).length);
  assert.ok(revisionDesignProblems(content, { ...plan, distractors: plan.distractors.map(row => ({ ...row, category: 'clinically_implausible' })) }, objective).length);
});

test('recorded Q-0943 RACE actions and Q-0371 nursing interventions can be lower-priority distractors', () => {
  const race = snapshotContent({
    stem: 'A nurse enters a room and finds smoke coming from a wastebasket. What is the nurse’s first action?',
    option_a: 'Remove the client from immediate danger', option_b: 'Activate the fire alarm',
    option_c: 'Close the room door', option_d: 'Attempt to extinguish the fire', correct_answer: 'a',
    difficulty: 'medium', item_type: 'mcq', nclex_category: 'Safety and Infection Control', topic: 'Safety and Priority',
  });
  const raceReview = goodQuality('medium');
  raceReview.options = raceReview.options.map((row, i) => i === 0 ? { ...row, category: 'best_answer' } : {
    ...row, category: 'appropriate_lower_priority',
    clinical_reasoning: 'This is a recognized fire-response action but follows removal of the person in immediate danger.',
    why_student_might_choose: 'The student correctly recognizes this as a required part of fire response.',
    distinguishing_knowledge: 'The stem states a client is in immediate danger, so rescue comes first.',
  });
  assert.deepEqual(assessItemQuality(race, raceReview), []);

  const q371 = snapshotContent({
    stem: 'A patient with pneumonia becomes restless and confused, with respiratory rate 32/min, oxygen saturation 83%, and increased work of breathing. Which action should the nurse take first?',
    option_a: 'Obtain an arterial blood gas sample to evaluate respiratory impairment.',
    option_b: 'Notify the healthcare provider of the declining respiratory status.',
    option_c: "Reposition the patient in high-Fowler's position and reassess oxygen saturation.",
    option_d: 'Apply a non-rebreather mask at 15 L/min, assess airway and breathing, and activate the rapid response team.',
    correct_answer: 'd', difficulty: 'hard', item_type: 'mcq', nclex_category: 'Physiological Adaptation', topic: 'Adult Acute Care',
  });
  const respiratoryReview = goodQuality('hard', 4, [3]);
  respiratoryReview.options.forEach((row, i) => {
    if (i < 3) Object.assign(row, {
      category: 'appropriate_lower_priority',
      clinical_reasoning: 'This is an appropriate assessment/escalation/support step, but does not precede immediate oxygenation and emergency response.',
      why_student_might_choose: 'It is a clinically indicated part of caring for deteriorating respiratory status.',
      distinguishing_knowledge: 'Severe hypoxemia requires immediate oxygen support and simultaneous escalation.',
    });
  });
  respiratoryReview.cueing.correct_more_comprehensive = true;
  const issues = assessItemQuality(q371, respiratoryReview);
  assert.equal(issues.filter(issue => issue.code === 'distractors').length, 0);
  assert.ok(issues.some(issue => issue.code === 'correct_more_comprehensive'), 'valid distractors do not excuse a bundled-answer cue');
});

test('Q-0059 recognizes warming as a legitimate lower-priority newborn intervention, not an absurd action', () => {
  const content = snapshotContent({
    stem: "A nurse assesses a 2-hour-old term newborn: respiratory rate 74 breaths/min, central cyanosis, intercostal retractions, and audible grunting. SpO₂ is 86% on room air. What is the nurse's priority action?",
    option_a: 'Document the findings thoroughly and reassess in 30 minutes',
    option_b: 'Ensure the airway is open, call for immediate assistance, and prepare supplemental oxygen',
    option_c: 'Warm the newborn under the radiant warmer to rule out cold stress first',
    option_d: 'Feed the newborn to provide glucose and stimulate respiratory effort',
    correct_answer: 'b', difficulty: 'medium', item_type: 'mcq', nclex_category: 'Physiological Adaptation', topic: 'Neonatal Respiratory Distress',
  });
  const quality = goodQuality('medium', 4, [1]);
  Object.assign(quality.options[0], { category: 'clinically_implausible', clinical_reasoning: 'A scheduled 30-minute delay is unsafe with the listed acute distress.' });
  Object.assign(quality.options[2], {
    category: 'appropriate_lower_priority',
    clinical_reasoning: 'Thermal support can be appropriate for newborns but does not precede stabilization of severe respiratory compromise.',
    why_student_might_choose: 'Cold stress is a recognized newborn concern and warming is within nursing care.',
    distinguishing_knowledge: 'The severe hypoxemia and work of breathing require immediate respiratory stabilization.',
  });
  Object.assign(quality.options[3], {
    category: 'plausible_misconception',
    clinical_reasoning: 'A learner may confuse low glucose management with respiratory support; feeding during marked distress is inappropriate.',
    why_student_might_choose: 'Glucose and feeding are common newborn-care concerns.',
    distinguishing_knowledge: 'Oral feeding does not treat hypoxemia and is unsafe during significant respiratory distress.',
  });
  quality.cueing.correct_more_comprehensive = true;
  const issues = assessItemQuality(content, quality);
  assert.equal(issues.filter(issue => issue.code === 'distractors').length, 1);
  assert.ok(issues.some(issue => issue.code === 'correct_more_comprehensive'));
});

test('recorded Q-0366 trends and Q-0863 leadership alternatives are plausible misconceptions, not implausible choices', () => {
  const q366 = snapshotContent({
    stem: 'After initial fluid resuscitation for sepsis, which finding is most concerning for continued tissue hypoperfusion?',
    option_a: 'Temperature decreases from 39.2°C to 38.3°C.', option_b: 'Heart rate decreases from 124/min to 106/min.',
    option_c: 'Serum lactate decreases from 4.1 to 3.4 mmol/L.', option_d: 'Urine output decreases from 45 to 12 mL/hr.',
    correct_answer: 'd', difficulty: 'medium', item_type: 'mcq', nclex_category: 'Physiological Adaptation', topic: 'Perfusion',
  });
  const trendReview = goodQuality('medium', 4, [3]);
  trendReview.options.slice(0, 3).forEach(row => Object.assign(row, {
    category: 'plausible_misconception',
    clinical_reasoning: 'These trends can suggest improvement, while the urine-output decline is a perfusion warning.',
    why_student_might_choose: 'The student must interpret trend direction and significance.',
    distinguishing_knowledge: 'Urine output falling to 12 mL/hr signals renal hypoperfusion despite other improving measures.',
  }));
  trendReview.cueing.only_one_addresses_problem = false;
  assert.deepEqual(assessItemQuality(q366, trendReview), []);

  const q863 = snapshotContent({
    stem: 'During a rapidly deteriorating situation, the charge nurse gives clear immediate directions and decides without group discussion. Which leadership style is most useful?',
    option_a: 'Democratic', option_b: 'Autocratic', option_c: 'Laissez-faire', option_d: 'Servant',
    correct_answer: 'b', difficulty: 'easy', item_type: 'mcq', nclex_category: 'Management of Care', topic: 'Leadership styles',
  });
  const leadership = goodQuality('easy', 4, [1]);
  for (const row of leadership.options.filter(row => row.option !== 2)) Object.assign(row, {
    category: 'plausible_misconception', clinical_reasoning: 'This is a recognized leadership approach but does not match immediate unilateral direction.',
    why_student_might_choose: 'The student recognizes a valid style but confuses its characteristics.',
    distinguishing_knowledge: 'The stated decisive action without group input identifies the style being assessed.',
  });
  assert.deepEqual(assessItemQuality(q863, leadership), []);
});

test('Q-0394 and Q-0396 lower-priority diagnostics and treatments stay plausible while unsafe flush is rejected', () => {
  const q394 = snapshotContent({
    stem: 'A patient with diabetes is admitted with an infected foot ulcer. Over an hour, temperature rises, blood pressure falls to 84/48 mm Hg, heart rate rises to 126/min, and the patient becomes newly confused. Which action should the nurse prioritize?',
    option_a: 'Obtain a wound culture and arrange the scheduled dressing change.',
    option_b: 'Administer the prescribed correctional insulin for glucose 248 mg/dL.',
    option_c: 'Request urgent foot imaging to assess for osteomyelitis.',
    option_d: 'Activate the sepsis/emergency response and initiate prescribed resuscitation and antimicrobial measures.',
    correct_answer: 'd', difficulty: 'medium', item_type: 'mcq', nclex_category: 'Physiological Adaptation', topic: 'Infected diabetic foot',
  });
  const q394Review = goodQuality('medium', 4, [3]);
  for (const row of q394Review.options.filter(row => row.option < 4)) Object.assign(row, {
    category: 'appropriate_lower_priority',
    clinical_reasoning: 'This is a reasonable infection-care task, but it follows immediate response to acute systemic deterioration.',
    why_student_might_choose: 'It addresses wound source, hyperglycemia, or diagnostic evaluation.',
    distinguishing_knowledge: 'The acute hypotension and new confusion require emergency escalation and stabilization first.',
  });
  q394Review.cueing.correct_more_comprehensive = true;
  const q394Issues = assessItemQuality(q394, q394Review);
  assert.equal(q394Issues.filter(issue => issue.code === 'distractors').length, 0);
  assert.ok(q394Issues.some(issue => issue.code === 'correct_more_comprehensive'));

  const q396 = snapshotContent({
    stem: 'During a central-line tubing change, a connection separates and the open lumen is briefly exposed to air. The patient suddenly develops dyspnea, chest pain, and hypotension. Which nursing action has the highest priority?',
    option_a: 'Obtain a portable chest radiograph to identify the cause of the symptoms.',
    option_b: 'Clamp the affected lumen, activate emergency assistance, and provide high-concentration oxygen.',
    option_c: 'Attach a saline syringe and flush the affected lumen to restore patency.',
    option_d: 'Place the patient in a head-down position before securing the open lumen.',
    correct_answer: 'b', difficulty: 'medium', item_type: 'mcq', nclex_category: 'Reduction of Risk Potential', topic: 'Central-line complication',
  });
  const q396Review = goodQuality('medium', 4, [1]);
  for (const row of q396Review.options.filter(row => [1, 4].includes(row.option))) Object.assign(row, {
    category: 'appropriate_lower_priority',
    clinical_reasoning: 'This is a recognized diagnostic or protocol-dependent action but should not precede stopping air entry and oxygen support.',
    why_student_might_choose: 'The action may be part of definitive evaluation or emergency protocol.',
    distinguishing_knowledge: 'The open lumen must first be secured and immediate stabilization started.',
  });
  q396Review.options[2].category = 'clinically_implausible';
  q396Review.options[2].clinical_reasoning = 'Flushing the exposed lumen may drive air into the circulation.';
  q396Review.cueing.correct_more_comprehensive = true;
  const q396Issues = assessItemQuality(q396, q396Review);
  assert.equal(q396Issues.filter(issue => issue.code === 'distractors').length, 1);
  assert.ok(q396Issues.some(issue => issue.code === 'correct_more_comprehensive'));
});

test('recorded Q-1008 irrelevant SATA distractor and Q-1125 unsafe medication choices are rejected', () => {
  const q1008 = snapshotContent({
    stem: 'An older adult develops a new tachyarrhythmia during an acute illness. Which potentially reversible contributors should the nurse assess for and report? Select all that apply.',
    item_type: 'sata', difficulty: 'medium', nclex_category: 'Reduction of Risk Potential', topic: 'Cardiovascular conditions and medications',
    item_data: { correct: [0, 1, 2, 3, 4], options: ['Hypoxia.', 'Potassium or magnesium abnormality.', 'New or changed medications, including stimulants or drugs that affect conduction or QT interval.', 'Thyroid dysfunction.', 'Acute infection, fever, pain, or volume disturbance.', 'Gradual presbyopia.'] },
  });
  const sataReview = goodQuality('medium', 6, [0, 1, 2, 3, 4]);
  sataReview.options[5] = {
    option: 6, category: 'clinically_implausible', clinical_reasoning: 'Gradual presbyopia does not contribute to a new tachyarrhythmia.',
    why_student_might_choose: 'The learner may overgeneralize an age-related change.', distinguishing_knowledge: 'Presbyopia is unrelated to cardiac rhythm.', stem_supports_exclusion: true,
  };
  assert.ok(assessItemQuality(q1008, sataReview).some(issue => issue.code === 'distractors'));

  const q1125 = snapshotContent({
    stem: 'Which actions support safe potassium chloride administration? Select all that apply.',
    item_type: 'sata', difficulty: 'medium', nclex_category: 'Pharmacological and Parenteral Therapies', topic: 'Concentrated electrolytes',
    item_data: { correct: [0, 1, 2], options: ['Verify current result, order, and route.', 'Use a pump and follow concentration/rate limits.', 'Confirm access and monitor as ordered.', 'Give concentrated potassium by IV push.', 'Use a prefilled mislabeled syringe if familiar.'] },
  });
  const medicationReview = goodQuality('medium', 5, [0, 1, 2]);
  for (const row of medicationReview.options.slice(3)) Object.assign(row, {
    category: 'clinically_implausible', clinical_reasoning: 'This action creates a preventable high-alert medication safety risk.',
    why_student_might_choose: 'A learner may incorrectly believe it is faster or recognize the product.',
    distinguishing_knowledge: 'Concentrated potassium is never given IV push, and unlabeled medication cannot be verified.',
    stem_supports_exclusion: true,
  });
  assert.equal(assessItemQuality(q1125, medicationReview).filter(issue => issue.code === 'distractors').length, 2);
});

test('explanations in answer choices fail for both MCQ and SATA without changing scoring', () => {
  for (const content of [
    mcq({ option_b: 'Apply oxygen to prevent hypoxemia' }),
    sata({ item_data: { correct: [0, 2], options: ['One', 'Act because the value is high', 'Three', 'Four'] } }),
  ]) {
    const before = structuredClone(content);
    assert.ok(optionQualityProblems(content).some(issue => issue.code === 'rationale_in_options'));
    assert.deepEqual(content, before);
  }
  assert.deepEqual(optionQualityProblems(mcq({ option_a: 'Assess breathing and call neonatal assistance' })), [], 'parallel actions alone are not explanations');
});

const CATEGORY_MAP = new Map([
  ['management of care', ['Management of Care', 'Safe & Effective Care Environment']],
  ['safety and infection prevention', ['Safety & Infection Prevention', 'Safe & Effective Care Environment']],
  ['safety and infection control', ['Safety & Infection Prevention', 'Safe & Effective Care Environment']],
  ['health promotion and maintenance', ['Health Promotion & Maintenance', 'Health Promotion & Maintenance']],
  ['psychosocial integrity', ['Psychosocial Integrity', 'Psychosocial Integrity']],
  ['basic care and comfort', ['Basic Care & Comfort', 'Physiological Integrity']],
  ['pharmacological and parenteral therapies', ['Pharmacological & Parenteral Therapies', 'Physiological Integrity']],
  ['reduction of risk potential', ['Reduction of Risk Potential', 'Physiological Integrity']],
  ['physiological adaptation', ['Physiological Adaptation', 'Physiological Integrity']],
]);
const normalizeCategory = value => String(value ?? '').toLowerCase().replace(/&/g, 'and')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

export function approvedQuestionKey(question) {
  const type = question?.item_type || 'mcq';
  const cognitiveDemand = question?.reviewed_cognitive_demand;
  const difficulty = String(question?.difficulty ?? '').toLowerCase();
  if (!question?.id || !question.active || !['mcq', 'sata'].includes(type) ||
      question.item_data?.schemaVersion != null ||
      !['application', 'analysis', 'clinical_judgment'].includes(cognitiveDemand) ||
      !nonEmpty(question.stem) ||
      !nonEmpty(question.rationale) || !DIFFICULTY[difficulty]) return null;
  const category = CATEGORY_MAP.get(normalizeCategory(question.nclex_category));
  if (!category) return null;

  let options;
  let correct;
  if (type === 'mcq') {
    options = ['a', 'b', 'c', 'd'].map(letter => question[`option_${letter}`]);
    const answer = String(question.correct_answer ?? '').trim().toLowerCase();
    if (!options.every(nonEmpty) || !['a', 'b', 'c', 'd'].includes(answer)) return null;
    correct = ['abcd'.indexOf(answer)];
  } else {
    options = question.item_data?.options;
    correct = question.item_data?.correct;
    if (!Array.isArray(options) || options.length < 2 || options.length > 12 ||
        !options.every(nonEmpty) || !Array.isArray(correct) || !correct.length ||
        new Set(correct).size !== correct.length ||
        correct.some(index => !Number.isInteger(index) || index < 0 || index >= options.length)) return null;
  }

  const id = `qbank:${question.id}`;
  return {
    bank_scope: 'diagnostic',
    item_id: id,
    item_source: 'main-question-bank-cat-approved',
    parent_item_id: null,
    selectable: true,
    item_type: type,
    difficulty: DIFFICULTY[difficulty],
    blueprint: category[1],
    category: category[0],
    nclex_category: category[0],
    topic: question.topic || null,
    cognitive_level: cognitiveDemand,
    core_tags: [],
    correct_response: type === 'mcq' ? [correct[0]] : [...correct].sort((a, b) => a - b),
    rationale: question.rationale,
    sequence_order: null,
    case_length: null,
    stem: question.stem,
    options: [...options],
    option_count: options.length,
  };
}

export function publicApprovedQuestion(key, presentations = {}) {
  if (!key || key.item_source !== 'main-question-bank-cat-approved') return null;
  return {
    id: key.item_id,
    stem: key.stem,
    type: key.item_type,
    options: [...key.options],
    category: key.category,
    nclex_category: key.nclex_category,
    topic: key.topic,
    difficulty: key.difficulty,
    ...(presentations[key.item_id] ? { presentation: presentations[key.item_id] } : {}),
  };
}

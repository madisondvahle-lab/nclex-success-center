// Deterministic (no-AI) question-bank audit helpers, shared by the dashboard and function
// and the question-audit Edge Function. Nothing here calls the network.

export const AUDIT_CRITERIA_VERSION = 'qa-2026-10-v2';
export const LETTERS = ['a', 'b', 'c', 'd'];

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const text = value => String(value ?? '');
const norm = value => text(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const wordsOf = value => norm(value).split(' ').filter(word => word.length >= 5);

// Mirrors v_current_content in apply_question_revision so drafts can be applied.
export function snapshotContent(q) {
  return {
    stem: q.stem ?? null,
    option_a: q.option_a ?? null,
    option_b: q.option_b ?? null,
    option_c: q.option_c ?? null,
    option_d: q.option_d ?? null,
    correct_answer: q.correct_answer ?? null,
    rationale: q.rationale ?? null,
    module_key: q.module_key ?? null,
    nclex_category: q.nclex_category ?? null,
    nclex_sub: q.nclex_sub ?? null,
    topic: q.topic ?? null,
    difficulty: q.difficulty ?? null,
    is_ngn: q.is_ngn ?? (q.item_type || 'mcq') !== 'mcq',
    item_type: q.item_type || 'mcq',
    item_data: q.item_data ?? null,
    clinical_judgment_skill: q.clinical_judgment_skill ?? null,
    option_rationales: q.option_rationales || {},
    reference_list: q.reference_list || [],
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Change detection only (not security): two independent 32-bit FNV-1a passes.
export function contentHash(content) {
  const input = stableStringify(content);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// Visible option list and keyed indexes for the two supported item types.
export function optionsOf(content) {
  if ((content.item_type || 'mcq') === 'sata') {
    const data = content.item_data || {};
    return { options: Array.isArray(data.options) ? data.options : [], correct: Array.isArray(data.correct) ? data.correct : [] };
  }
  return {
    options: LETTERS.map(letter => content[`option_${letter}`]),
    correct: LETTERS.includes(text(content.correct_answer).toLowerCase()) ? [LETTERS.indexOf(text(content.correct_answer).toLowerCase())] : [],
  };
}

// Brings stored scoring metadata back in line with the visible options.
// Returns a new object; never invents a key.
export function syncScoring(content) {
  const next = JSON.parse(JSON.stringify(content));
  const type = next.item_type || 'mcq';
  if (type === 'sata' && next.item_data && Array.isArray(next.item_data.options)) {
    next.item_data.options = next.item_data.options.map(option => text(option).trim());
    next.item_data.correct = [...new Set((next.item_data.correct || []).filter(Number.isInteger))].sort((x, y) => x - y);
  }
  if (type === 'mcq') {
    LETTERS.forEach(letter => { if (typeof next[`option_${letter}`] === 'string') next[`option_${letter}`] = next[`option_${letter}`].trim(); });
    if (next.correct_answer) next.correct_answer = text(next.correct_answer).toLowerCase();
    if (next.item_data && typeof next.item_data === 'object') {
      next.item_data.options = LETTERS.map(letter => next[`option_${letter}`]);
      next.item_data.correct = [LETTERS.indexOf(next.correct_answer)];
    }
  }
  return next;
}

const cleanString = value => (typeof value === 'string' ? value.replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '').replace(/[ \t]{2,}/g, ' ').trim() : value);

// Whitespace-only normalization; never changes wording.
export function autoFixContent(content) {
  const next = JSON.parse(JSON.stringify(content));
  const changes = [];
  const fix = (holder, key, label) => {
    if (typeof holder?.[key] !== 'string') return;
    const cleaned = cleanString(holder[key]);
    if (cleaned !== holder[key]) { holder[key] = cleaned; changes.push(label); }
  };
  ['stem', 'option_a', 'option_b', 'option_c', 'option_d', 'rationale'].forEach(key => fix(next, key, key));
  if (next.option_rationales && typeof next.option_rationales === 'object') {
    Object.keys(next.option_rationales).forEach(key => fix(next.option_rationales, key, `option_rationales.${key}`));
  }
  if (Array.isArray(next.item_data?.options)) next.item_data.options.forEach((_, i) => fix(next.item_data.options, i, `item_data.options[${i}]`));
  return { content: next, changes };
}

// Field-specific structural validation. severity 'error' blocks a draft; 'warning' is advisory.
export function validateContent(content, { requireRationales = false } = {}) {
  const issues = [];
  const add = (field, message, severity = 'error') => issues.push({ field, message, severity });
  const type = content.item_type || 'mcq';

  if (!text(content.stem).trim()) add('stem', 'The question stem is empty.');
  if (!text(content.rationale).trim()) add('rationale', 'The main rationale is empty.', requireRationales ? 'error' : 'warning');
  if (!DIFFICULTIES.has(content.difficulty)) add('difficulty', 'Difficulty must be easy, medium, or hard.');
  if (!text(content.topic).trim()) add('topic', 'Topic is empty.', 'warning');
  if (!text(content.nclex_category).trim()) add('nclex_category', 'NCLEX category is empty.', 'warning');
  if (!text(content.clinical_judgment_skill).trim()) add('clinical_judgment_skill', 'Clinical judgment skill is empty.', 'warning');

  if (content.option_rationales !== undefined && (content.option_rationales === null || typeof content.option_rationales !== 'object' || Array.isArray(content.option_rationales))) {
    add('option_rationales', 'Option rationales must be a JSON object.');
  }
  if (content.reference_list !== undefined) {
    const refs = content.reference_list;
    const isLegacyUrl = ref => typeof ref === 'string' && /^https?:\/\//i.test(ref);
    const isReference = ref => ref && typeof ref === 'object' && text(ref.title).trim() && /^https?:\/\//i.test(text(ref.url));
    if (!Array.isArray(refs) || refs.some(ref => !isReference(ref) && !isLegacyUrl(ref))) {
      add('reference_list', 'References must be an array of objects with a title and an http(s) URL.');
    } else if (refs.some(isLegacyUrl)) {
      add('reference_list', 'References are stored as bare URLs; the correction editor expects title and url.', 'warning');
    }
  }

  if (type !== 'mcq' && type !== 'sata') {
    add('item_type', `${type} items are scored as a unit and cannot be validated automatically.`, 'warning');
    return issues;
  }

  const { options, correct } = optionsOf(content);
  const expected = type === 'mcq' ? 4 : null;
  if (type === 'sata') {
    if (!content.item_data || typeof content.item_data !== 'object' || Array.isArray(content.item_data)) add('item_data', 'SATA items need an item_data object with options and correct.');
    else {
      if (!Array.isArray(content.item_data.options)) add('item_data.options', 'item_data.options must be an array.');
      if (!Array.isArray(content.item_data.correct)) add('item_data.correct', 'item_data.correct must be an array of option positions.');
    }
    if (options.length < 4 || options.length > 10) add('item_data.options', `SATA items need 4–10 options (found ${options.length}).`);
  } else if (options.length !== expected) {
    add('options', 'Multiple-choice items need exactly four options.');
  }

  options.forEach((option, i) => {
    if (!text(option).trim()) add(type === 'mcq' ? `option_${LETTERS[i]}` : `item_data.options[${i}]`, `Option ${i + 1} is empty.`);
  });
  const seen = new Map();
  // Keep symbols (Rh+ vs Rh–, < vs >) so options that differ only by a sign are not called duplicates.
  const exactKey = value => text(value).toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();
  options.forEach((option, i) => {
    const key = exactKey(option);
    if (!key) return;
    if (seen.has(key)) add(type === 'mcq' ? `option_${LETTERS[i]}` : `item_data.options[${i}]`, `Option ${i + 1} duplicates option ${seen.get(key) + 1}.`);
    else seen.set(key, i);
  });

  if (type === 'mcq') {
    if (!LETTERS.includes(text(content.correct_answer))) add('correct_answer', 'correct_answer must be a, b, c, or d.');
    if (content.item_data && typeof content.item_data === 'object') {
      const d = content.item_data;
      if (JSON.stringify(d.options) !== JSON.stringify(options) || JSON.stringify(d.correct) !== JSON.stringify(correct)) {
        add('item_data', 'item_data does not match the visible options and correct answer.');
      }
    }
  } else if (Array.isArray(content.item_data?.correct)) {
    const picks = content.item_data.correct;
    if (!picks.length) add('item_data.correct', 'Select at least one correct option.');
    if (picks.some(i => !Number.isInteger(i) || i < 0 || i >= options.length)) add('item_data.correct', 'A correct-answer position does not match any option.');
    if (new Set(picks).size !== picks.length) add('item_data.correct', 'The correct-answer list contains duplicates.');
    if (picks.length >= options.length) add('item_data.correct', 'Every option is keyed correct.', 'warning');
  }

  const rationales = content.option_rationales && typeof content.option_rationales === 'object' ? content.option_rationales : {};
  const validKeys = type === 'mcq' ? LETTERS : options.map((_, i) => String(i));
  Object.keys(rationales).forEach(key => {
    if (!validKeys.includes(key)) add(`option_rationales.${key}`, `Rationale key "${key}" does not match any option.`);
  });
  validKeys.forEach(key => {
    const present = text(rationales[key]).trim().length > 0;
    if (!present) add(`option_rationales.${key}`, `No rationale for option ${type === 'mcq' ? key.toUpperCase() : Number(key) + 1}.`, requireRationales ? 'error' : 'warning');
  });
  return issues;
}

const COACHING = [
  /\bto prevent (further )?[a-z]+/i,
  /\bas (perfusion|respiratory status|condition|oxygenation) (worsens|improves|declines)/i,
  /\buntil [a-z ]+ (improves|resolves|stabilizes)/i,
  /\bbecause of (the )?(increased|elevated|high) [a-z]+ risk/i,
  /\bimmediately\b/i,
];
const GENERIC = /\b(document and reassess|reassure the (client|patient)|continue to monitor|do nothing|ignore|wait and see|no action)\b/i;
const ABSOLUTE = /\b(always|never|only|all|none|completely|every|must not|cannot)\b/i;
const GENERIC_RATIONALE = /(this is not the best answer|is incorrect\.?$|the nurse should choose)/i;

// Cheap, explainable screening signals. Not a clinical judgment.
export function screenDeterministic(content) {
  const signals = [];
  const add = (code, message, weight = 1) => signals.push({ code, message, weight });
  const type = content.item_type || 'mcq';
  if (type !== 'mcq' && type !== 'sata') return { signals, score: 0, supported: false };

  const { options, correct } = optionsOf(content);
  const lengths = options.map(option => text(option).trim().length);
  const keyed = new Set(correct);
  const keyedLen = lengths.filter((_, i) => keyed.has(i));
  const otherLen = lengths.filter((_, i) => !keyed.has(i));
  if (keyedLen.length && otherLen.length) {
    const mean = otherLen.reduce((x, y) => x + y, 0) / otherLen.length;
    const keyedMean = keyedLen.reduce((x, y) => x + y, 0) / keyedLen.length;
    if (keyedMean > mean * 1.35 && keyedMean - mean > 15) add('key_longer', 'The keyed answer(s) are noticeably longer and more detailed than the distractors.', 2);
    if (type === 'mcq' && keyedLen[0] === Math.max(...lengths) && lengths.filter(l => l === keyedLen[0]).length === 1 && keyedMean > mean) add('key_longest', 'The keyed answer is the longest option.', 1);
  }

  const stemWords = new Set(wordsOf(content.stem));
  const overlap = i => wordsOf(options[i]).filter(word => stemWords.has(word)).length;
  if (type === 'mcq' && correct.length === 1) {
    const keyedOverlap = overlap(correct[0]);
    const maxOther = Math.max(0, ...options.map((_, i) => i).filter(i => i !== correct[0]).map(overlap));
    if (keyedOverlap >= 2 && keyedOverlap > maxOther) add('stem_echo', 'The keyed answer repeats distinctive wording from the stem more than any distractor.', 1);
  }

  const wrong = options.filter((_, i) => !keyed.has(i));
  const rightText = options.filter((_, i) => keyed.has(i));
  if (wrong.filter(o => ABSOLUTE.test(text(o))).length && !rightText.some(o => ABSOLUTE.test(text(o)))) add('absolute_distractors', 'Only distractors contain absolute wording (always, never, only, all, none).', 1);
  if (options.some(o => GENERIC.test(text(o)))) add('generic_option', 'An option uses generic wording such as "reassure the client" or "document and reassess".', 1);
  if (options.some(o => COACHING.some(rx => rx.test(text(o))))) add('coaching_phrase', 'An option contains wording that explains its own clinical reasoning.', 2);
  if (options.some((_, i) => lengths[i] < 10)) add('very_short_option', 'An option is extremely short and may be an implausible distractor.', 1);

  const rationale = text(content.rationale).trim();
  if (rationale.length < 60) add('thin_rationale', 'The main rationale is very brief.', 1);
  if (GENERIC_RATIONALE.test(text(Object.values(content.option_rationales || {}).join(' ')))) add('generic_option_rationale', 'Option rationales use generic wording instead of explaining the reasoning.', 1);
  if (!Object.keys(content.option_rationales || {}).length) add('no_option_rationales', 'No individual option rationales are stored.', 1);
  if (text(content.stem).trim().length < 60) add('short_stem', 'The stem is very short and may lack the clinical detail needed to reason through.', 1);

  return { signals, score: signals.reduce((sum, s) => sum + s.weight, 0), supported: true };
}

// Priority 1 = tutoring flags … 5 = inactive. Priorities 2–3 are inferred from deterministic findings.
export function prioritize({ question, openFlags = 0, anyFlags = 0, score = 0, structuralErrors = 0 }) {
  if (openFlags > 0) return { priority: 1, reason: 'Open tutoring flag' };
  if (anyFlags > 0) return { priority: 1, reason: 'Previously flagged during tutoring' };
  if (question.active && structuralErrors > 0) return { priority: 2, reason: 'Published with a scoring/structure problem' };
  if (question.active && score >= 4) return { priority: 3, reason: 'Published with several quality signals' };
  if (question.active) return { priority: 4, reason: 'Published, not yet audited' };
  return { priority: 5, reason: 'Inactive, intended for future use' };
}

// Rough price table (USD per 1M tokens) used only to estimate spend.
export const PRICES = {
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
};
export function estimateCost(model, inputTokens, outputTokens) {
  const [inPrice, outPrice] = PRICES[model] || PRICES['gpt-4.1'];
  return (inputTokens * inPrice + outputTokens * outPrice) / 1e6;
}

// Compares the blind verifier's answer with the proposed key.
export function compareVerification(content, verdict) {
  const { correct } = optionsOf(content);
  const picked = Array.isArray(verdict?.answer) ? verdict.answer : [];
  const same = picked.length === correct.length && correct.every(i => picked.includes(i));
  const problems = [];
  if (picked.some(i => !Number.isInteger(i) || i < 0 || i >= optionsOf(content).options.length) || new Set(picked).size !== picked.length) problems.push('The independent reviewer returned invalid answer positions.');
  if (!same) problems.push('The independent reviewer chose a different answer than the proposed key.');
  if (verdict?.multiple_defensible) problems.push('The independent reviewer found more than one defensible option.');
  if (verdict?.clinical_accuracy_concern) problems.push('The independent reviewer raised a clinical accuracy concern.');
  if (verdict?.sufficient_information === false) problems.push('The independent reviewer found the stem lacks needed information.');
  if (verdict?.entry_level_appropriate === false) problems.push('The independent reviewer judged the item outside entry-level scope.');
  for (const [field, expected] of Object.entries({ multiple_defensible: false, clinical_accuracy_concern: false, sufficient_information: true, entry_level_appropriate: true })) {
    if (verdict?.[field] !== expected) problems.push(`Independent review did not explicitly clear ${field}.`);
  }
  if (!Array.isArray(verdict?.answer_clues) || verdict.answer_clues.length) problems.push('Independent review found answer clues or did not assess them.');
  if (!Array.isArray(verdict?.implausible_distractors) || verdict.implausible_distractors.length) problems.push('Independent review found implausible distractors or did not assess them.');
  if (!Array.isArray(verdict?.concerns) || verdict.concerns.length) problems.push('Independent review has unresolved concerns or did not assess them.');
  return { agrees: problems.length === 0, problems };
}

// Narrow red flags, not a substitute for clinical review. No key or rationale is needed.
export function optionQualityProblems(content) {
  const problems = [];
  const options = optionsOf(content).options;
  const add = (code, message) => problems.push({ code, message });
  const respiratoryCrisis = /\b(grunting|retractions|cyanosis|hypoxemia|respiratory distress)\b/i.test(text(content.stem));
  options.forEach((option, i) => {
    const value = text(option);
    if (/\b(because|in order to|so that|to prevent|to ensure|to avoid|which (prevents|reduces|improves))\b/i.test(value)) {
      add('rationale_in_options', `Option ${i + 1} includes an explanation; store it in the rationale fields instead.`);
    }
    if (respiratoryCrisis && (
      /\b(call|notify|contact)\b.*\bparents\b.*\bbefore\b/i.test(value) ||
      /\b(wait|delay|defer)\b.*\b(glucose|respiratory care)\b/i.test(value) ||
      /\b(document|record)\b.*\b(reassess|check|vital).*\b(routine|30 minutes|next)\b/i.test(value)
    )) add('obvious_neglect', `Option ${i + 1} uses a Q-0024-style delay of care rather than a plausible competing nursing action.`);
  });
  return problems;
}

// Screen and blind reviewer must supply the same complete, option-by-option quality report.
export function assessItemQuality(content, report) {
  const problems = [...optionQualityProblems(content)];
  const add = (code, message) => problems.push({ code, message });
  const { options, correct } = optionsOf(content);
  const rows = Array.isArray(report?.options) ? report.options : [];
  const explained = value => typeof value === 'string' && value.trim().length > 0;
  if (rows.length !== options.length || rows.some(row => !row || !Number.isInteger(row.option) || row.option < 1 || row.option > options.length) ||
      new Set(rows.map(row => row?.option)).size !== options.length) {
    add('quality_report', 'Quality review must evaluate every option exactly once using 1-based positions.');
  }
  rows.forEach(row => {
    if (!row || typeof row.plausible !== 'boolean' || !explained(row.reason)) add('quality_report', 'Each option needs an explicit plausibility decision and clinical reasoning.');
    else if (!row.plausible) add(correct.includes(row.option - 1) ? 'clinical_accuracy' : 'distractors', `Option ${row.option} is not a plausible nursing decision: ${row.reason}`);
  });
  for (const code of ['only_one_addresses_problem', 'correct_more_comprehensive', 'answer_apparent_without_knowledge', 'rationale_in_options']) {
    if (typeof report?.cueing?.[code] !== 'boolean') add('quality_report', `Quality review omitted cueing assessment: ${code}.`);
    else if (report.cueing[code]) add(code, `Quality review did not clear answer-choice cueing: ${code}.`);
  }
  const difficulty = report?.difficulty;
  if (!DIFFICULTIES.has(difficulty?.rating) || !explained(difficulty?.reason) ||
      typeof difficulty?.multiple_cues_required !== 'boolean' || typeof difficulty?.competing_priorities !== 'boolean') {
    add('quality_report', 'Difficulty requires a rating and an explanation of the reasoning and competing priorities.');
  } else {
    if (difficulty.rating !== content.difficulty) add('difficulty', `Stored difficulty ${content.difficulty} does not match independently assessed ${difficulty.rating}: ${difficulty.reason}`);
    if (content.difficulty === 'hard' && (!difficulty.multiple_cues_required || !difficulty.competing_priorities)) add('difficulty', 'Hard requires integration of multiple cues and genuinely competing priorities, not an obvious emergency among neglectful options.');
  }
  if (typeof report?.acceptable !== 'boolean') add('quality_report', 'Quality review must explicitly assess overall acceptability.');
  else if (!report.acceptable) add('item_quality', 'The reviewer did not judge overall item quality acceptable.');
  return problems;
}

export function revisionImprovementProblems(original, proposed, weaknesses, comparison) {
  const problems = [];
  const add = message => problems.push(message);
  const normalize = value => text(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const optionSet = content => optionsOf(content).options.map(normalize).sort().join('\n');
  const sameItem = normalize(original.stem) === normalize(proposed.stem) && optionSet(original) === optionSet(proposed);
  const keyText = content => {
    const { options, correct } = optionsOf(content);
    return correct.map(i => normalize(options[i])).sort().join('\n');
  };
  const reasoningWeakness = weaknesses.some(code => !['difficulty', 'rationale', 'scoring', 'quality_report'].includes(code) &&
    !(code === 'clinical_accuracy' && keyText(original) !== keyText(proposed)));
  if (sameItem && reasoningWeakness) add('Only rationales, metadata, or option order changed; the identified item-quality weaknesses remain.');
  if (contentHash(original) === contentHash(proposed)) add('The proposed content is unchanged.');
  if (weaknesses.includes('difficulty') && original.difficulty === proposed.difficulty) add('The identified difficulty mismatch was not corrected.');
  if (comparison?.materially_improved !== true || comparison?.cosmetic_only !== false) add('Independent comparison did not confirm a noncosmetic, material improvement.');
  if (comparison?.same_category !== true || original.nclex_category !== proposed.nclex_category) add('Replacement/revision must stay in the original NCLEX category.');
  if (!['targeted', 'replacement'].includes(comparison?.mode)) add('Comparison must identify targeted revision or replacement.');
  if (comparison?.mode === 'replacement' && (normalize(original.stem) === normalize(proposed.stem) || !text(comparison.replacement_reason).trim())) add('A replacement requires a new clinical scenario and a reason the original concept could not support plausible alternatives.');
  const resolved = Array.isArray(comparison?.weaknesses) ? comparison.weaknesses : [];
  for (const code of weaknesses) {
    const rows = resolved.filter(row => row?.code === code);
    if (rows.length !== 1 || rows[0].resolved !== true || !text(rows[0].evidence).trim()) add(`Independent comparison must explain how the revision resolves ${code}.`);
  }
  return problems;
}

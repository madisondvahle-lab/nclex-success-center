// Deterministic (no-AI) question-bank audit helpers, shared by the dashboard and function
// and the question-audit Edge Function. Nothing here calls the network.

export const AUDIT_CRITERIA_VERSION = 'qa-2026-10-v1';
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
  const picked = Array.isArray(verdict?.answer) ? verdict.answer.filter(Number.isInteger) : [];
  const same = picked.length === correct.length && correct.every(i => picked.includes(i));
  const problems = [];
  if (!same) problems.push('The independent reviewer chose a different answer than the proposed key.');
  if (verdict?.multiple_defensible) problems.push('The independent reviewer found more than one defensible option.');
  if (verdict?.clinical_accuracy_concern) problems.push('The independent reviewer raised a clinical accuracy concern.');
  if (verdict?.sufficient_information === false) problems.push('The independent reviewer found the stem lacks needed information.');
  if (verdict?.entry_level_appropriate === false) problems.push('The independent reviewer judged the item outside entry-level scope.');
  return { agrees: problems.length === 0, problems };
}

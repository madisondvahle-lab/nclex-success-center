// Server-side CAT logic; question content and answer keys are stored separately.
const ITEM_DIFFICULTIES = { 1: 0.28, 2: 0.5, 3: 0.72 };
const BLUEPRINT_MINIMUMS = {
  'Safe & Effective Care Environment': 8,
  'Health Promotion & Maintenance': 4,
  'Psychosocial Integrity': 4,
  'Physiological Integrity': 14
};
const CATEGORY_TARGETS = {
  'Management of Care': 15,
  'Safety & Infection Prevention': 11,
  'Health Promotion & Maintenance': 8,
  'Psychosocial Integrity': 8,
  'Basic Care & Comfort': 8,
  'Pharmacological & Parenteral Therapies': 14,
  'Reduction of Risk Potential': 10,
  'Physiological Adaptation': 11
};
const CATEGORY_RANGES = {
  'Management of Care': { min: 15, max: 21 },
  'Safety & Infection Prevention': { min: 10, max: 16 },
  'Health Promotion & Maintenance': { min: 6, max: 12 },
  'Psychosocial Integrity': { min: 6, max: 12 },
  'Basic Care & Comfort': { min: 6, max: 12 },
  'Pharmacological & Parenteral Therapies': { min: 13, max: 19 },
  'Reduction of Risk Potential': { min: 9, max: 15 },
  'Physiological Adaptation': { min: 11, max: 17 }
};
const MOCK_MINIMUMS = Object.fromEntries(
  Object.entries(CATEGORY_RANGES).map(([category, range]) => [category, Math.ceil(85 * range.min / 100)])
);
const MOCK_MAXIMUMS = Object.fromEntries(
  Object.entries(CATEGORY_RANGES).map(([category, range]) => [category, Math.floor(85 * range.max / 100)])
);
const PASS_THRESHOLD = 0.6;
const CONFIDENCE_Z = 1.96;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function categoryFor(item) {
  if (item.nclex_category || item.nclexCategory) return item.nclex_category || item.nclexCategory;
  if (item.blueprint === 'Safe & Effective Care Environment') {
    return item.category === 'Management of Care' ? 'Management of Care' : 'Safety & Infection Prevention';
  }
  if (item.blueprint === 'Health Promotion & Maintenance') return 'Health Promotion & Maintenance';
  if (item.blueprint === 'Psychosocial Integrity') return 'Psychosocial Integrity';
  return item.category;
}

function coreTags(item) {
  return item.core_tags || item.coreTags || [];
}

function itemProbability(ability, difficulty) {
  const itemDifficulty = ITEM_DIFFICULTIES[difficulty] ?? 0.5;
  return 1 / (1 + Math.exp(-(ability - itemDifficulty) * 6));
}

export function updateAbility(ability, correct, difficulty) {
  const expected = itemProbability(ability, difficulty);
  return clamp(ability + 0.18 * ((correct ? 1 : 0) - expected), 0.05, 0.95);
}

export function updateNGNAbility(ability, evidenceScore, difficulty) {
  if (!Number.isFinite(evidenceScore) || evidenceScore < 0 || evidenceScore > 1) throw new Error('Invalid adaptive evidence.');
  const expected = itemProbability(ability, difficulty);
  return clamp(ability + 0.18 * (evidenceScore - expected), 0.05, 0.95);
}

export function standardError(history, ability) {
  if (!history.length) return Infinity;
  const groups = new Set();
  const information = history.reduce((total, item) => {
    if (item.evidenceGroup) {
      if (groups.has(item.evidenceGroup) || item.evidenceComplete === false) return total;
      groups.add(item.evidenceGroup);
    }

    const probability = itemProbability(ability, item.difficulty);
    return total + 36 * probability * (1 - probability);
  }, 0);
  return information > 0 ? 1 / Math.sqrt(information) : Infinity;
}

export function ngnEvidence(history) {
  const groups = new Map();
  history.forEach(item => {
    const id = item.evidenceGroup || item.sourceId || item.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(item);
  });
  return [...groups.entries()].flatMap(([id, items]) => {
    if (items.some(it => it.evidenceComplete === false)) return [];
    const values = items.map(it => it.evidenceCredit ?? (it.correct ? 1 : 0));
    // Partial-credit rules have no calibrated information parameters. They
    // affect ability, but cannot manufacture confidence for an early stop.
    if (!(values.every(v => v === 0) || values.every(v => v === 1))) return [];
    return [{ ...items[0], id, evidenceGroup: id, evidenceComplete: true }];
  });
}

export function shouldStopNGN(history, ability, requirements, mode) {
  const evidence = ngnEvidence(history);
  const minimum = mode === 'mock' ? 85 : 30;
  if (evidence.length < minimum) return null;
  const latest = history.at(-1);
  const latestGroup = latest?.evidenceGroup || latest?.sourceId || latest?.id;
  if (!evidence.some(item => item.evidenceGroup === latestGroup)) return null;
  return mode === 'mock'
    ? shouldStopMock(history, ability, requirements, 85, Infinity, evidence)
    : shouldStop(history, ability, requirements, 30, Infinity, evidence);
}

function missingCoreRequirements(history, requirements) {
  const counts = history.reduce((totals, item) => {
    coreTags(item).forEach(tag => { totals[tag] = (totals[tag] || 0) + 1; });
    return totals;
  }, {});
  return requirements.filter(requirement => !(counts[requirement.key] || 0));
}

function hasBlueprintCoverage(history) {
  const counts = history.reduce((totals, item) => {
    totals[item.blueprint] = (totals[item.blueprint] || 0) + 1;
    return totals;
  }, {});
  return Object.entries(BLUEPRINT_MINIMUMS).every(([blueprint, minimum]) => (counts[blueprint] || 0) >= minimum);
}

export function shouldStop(history, ability, requirements, minimumQuestions = 30, maximumQuestions = 45, evidence = history) {
  if (history.length < minimumQuestions || !hasBlueprintCoverage(history) ||
      missingCoreRequirements(history, requirements).length) return null;
  const error = standardError(evidence, ability);
  if (ability - CONFIDENCE_Z * error > PASS_THRESHOLD) return 'PASS';
  if (ability + CONFIDENCE_Z * error < PASS_THRESHOLD) return 'FAIL';
  if (history.length >= maximumQuestions) return ability >= PASS_THRESHOLD ? 'PASS' : 'FAIL';
  return null;
}

function categoryCounts(history) {
  return history.reduce((totals, item) => {
    const category = categoryFor(item);
    totals[category] = (totals[category] || 0) + 1;
    return totals;
  }, {});
}

function mockCategoryCoverage(history) {
  const counts = categoryCounts(history);
  return Object.entries(MOCK_MINIMUMS).every(([category, minimum]) => (counts[category] || 0) >= minimum);
}

function categoryWeight(profile, category) {
  const weight = Number(profile?.externalCategoryWeights?.[category]);
  return Number.isFinite(weight) ? clamp(weight, 0.8, 1.65) : 1;
}

function mockPriorityCategory(counts, profile) {
  const categories = Object.keys(CATEGORY_TARGETS).filter(
    category => (counts[category] || 0) < MOCK_MAXIMUMS[category]
  );
  const pool = categories.length ? categories : Object.keys(CATEGORY_TARGETS);
  const belowMinimum = pool.filter(category => (counts[category] || 0) < MOCK_MINIMUMS[category]);
  const candidates = belowMinimum.length ? belowMinimum : pool;
  return candidates.map(category => {
    const count = counts[category] || 0;
    const target = CATEGORY_TARGETS[category];
    const weight = categoryWeight(profile, category);
    const coverage = belowMinimum.length ? count / MOCK_MINIMUMS[category] : count / (target * weight);
    return { category, coverage, count };
  }).sort((a, b) => a.coverage - b.coverage || a.count - b.count)[0]?.category || null;
}

export function shouldStopMock(history, ability, requirements, minimumQuestions = 85, maximumQuestions = 150, evidence = history) {
  if (history.length < minimumQuestions || missingCoreRequirements(history, requirements).length ||
      !mockCategoryCoverage(history)) return null;
  const error = standardError(evidence, ability);
  if (ability - CONFIDENCE_Z * error > PASS_THRESHOLD) return 'PASS';
  if (ability + CONFIDENCE_Z * error < PASS_THRESHOLD) return 'FAIL';
  if (history.length >= maximumQuestions) return ability >= PASS_THRESHOLD ? 'PASS' : 'FAIL';
  return null;
}

export function pickNextQuestion(bank, history, profile, ability, requirements, maximumMockQuestions = 150, previouslyAnsweredIds = new Set()) {
  const usedIds = new Set(history.map(item => item.sourceId || item.id));
  const isMock = profile?.mode === 'mock' || profile?.mode === 'assessment';
  const available = bank.filter(item => {
    if (usedIds.has(item.item_id || item.id)) return false;
    if ((isMock || profile?.scoringModel === 'in-house-ngn-v1') && item.item_type === 'casestudy' && history.length + (item.case_length || 0) > maximumMockQuestions) return false;
    return true;
  });
  if (!available.length) return null;

  const blueprintCounts = history.reduce((totals, item) => {
    totals[item.blueprint] = (totals[item.blueprint] || 0) + 1;
    return totals;
  }, {});
  const neededBlueprints = Object.entries(BLUEPRINT_MINIMUMS)
    .filter(([blueprint, minimum]) => (blueprintCounts[blueprint] || 0) < minimum)
    .sort(([blueprintA, minimumA], [blueprintB, minimumB]) =>
      ((blueprintCounts[blueprintA] || 0) / minimumA) - ((blueprintCounts[blueprintB] || 0) / minimumB)
    );
  const coreNeeded = missingCoreRequirements(history, requirements);
  const counts = categoryCounts(history);
  let candidates = available;
  const priorityBlueprint = neededBlueprints[0]?.[0];
  const priorityCategory = isMock ? mockPriorityCategory(counts, profile) : null;
  if (coreNeeded.length) {
    const requiredTag = coreNeeded[0].key;
    const coreCandidates = available.filter(item => coreTags(item).includes(requiredTag));
    const categoryMatched = priorityCategory ? coreCandidates.filter(item => categoryFor(item) === priorityCategory) : [];
    const blueprintMatched = !priorityCategory && priorityBlueprint ? coreCandidates.filter(item => item.blueprint === priorityBlueprint) : [];
    candidates = categoryMatched.length ? categoryMatched : (blueprintMatched.length ? blueprintMatched : coreCandidates);
  } else if (priorityCategory) {
    candidates = available.filter(item => categoryFor(item) === priorityCategory);
  } else if (priorityBlueprint) {
    candidates = available.filter(item => item.blueprint === priorityBlueprint);
  }
  if (!candidates.length) candidates = available;

  const weakAreas = profile?.weakAreas || [];
  const weakCandidates = candidates.filter(item =>
    weakAreas.some(area =>
      item.blueprint?.toLowerCase().includes(area.toLowerCase()) ||
      item.category?.toLowerCase().includes(area.toLowerCase())
    )
  );
  if (weakCandidates.length && Math.random() < 0.45) candidates = weakCandidates;

  const recentBlueprints = history.slice(-2).map(item => item.blueprint);
  const ranked = candidates
    .map(item => {
      const externalWeight = categoryWeight(profile, categoryFor(item));
      return {
        item,
        score:
          Math.abs((ITEM_DIFFICULTIES[item.difficulty] ?? 0.5) - ability) +
          (recentBlueprints.includes(item.blueprint) ? 0.18 : 0) -
          (externalWeight - 1) * 0.08
      };
    })
    .sort((a, b) => a.score - b.score);
  const bestScore = ranked[0].score;
  const appropriate = ranked.filter(entry => entry.score <= bestScore + 0.04);
  const unused = appropriate.filter(entry => !previouslyAnsweredIds.has(entry.item.item_id || entry.item.id));
  const shortlist = (unused.length ? unused : appropriate).slice(0, 3);
  return shortlist[Math.floor(Math.random() * shortlist.length)].item;
}

export function nclexCategory(item) {
  return categoryFor(item);
}

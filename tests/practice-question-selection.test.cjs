const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const helper = readFileSync(join(root, 'question-bank-selection.js'), 'utf8');
const page = readFileSync(join(root, 'supplemental-practice.html'), 'utf8');
const examUi = readFileSync(join(root, 'exam-ui.js'), 'utf8');
const assignmentsPage = readFileSync(join(root, 'madison-assignments.html'), 'utf8');
const diagnostic = readFileSync(join(root, 'diagnostic.html'), 'utf8');
const migration = readFileSync(join(root, 'supabase-legacy-practice-sets-qbank-migration.sql'), 'utf8');
const studyAreaMigration = readFileSync(join(root, 'supabase-question-study-areas-migration.sql'), 'utf8');
const studyAreaNames = readFileSync(join(root, 'study-area-names.js'), 'utf8');

function selection() {
  const context = { window: {} };
  vm.runInNewContext(helper, context);
  return context.window.PracticeQuestionSelection;
}

test('the practice builder shows Client Needs first and keeps optional filters accessible', () => {
  const builder = page.slice(page.indexOf('function renderNclexLibrary()'), page.indexOf('const topicSearch=', page.indexOf('function renderNclexLibrary()')));
  assert.ok(builder.indexOf('id="client-needs-tab"') < builder.indexOf('id="study-area-tab"'));
  assert.match(builder, /id="client-needs-tab"[^>]*aria-selected="true"/);
  assert.match(builder, /id="study-area-tab"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(builder, /id="study-area-panel"[^>]* hidden/);
  assert.doesNotMatch(builder, /id="client-needs-panel"[^>]* hidden/);
  assert.match(builder, /<details class="custom-topic-picker">/);
  assert.match(page, /event\.key==='ArrowRight'/);
  assert.match(page, /event\.key==='ArrowLeft'/);
  assert.match(page, /event\.key==='Home'/);
  assert.match(page, /event\.key==='End'/);
  assert.match(page, /\.custom-topic-picker\{grid-column:1\/-1/);
  assert.ok(Number(page.match(/\.builder-choice\{[^}]*min-height:(\d+)px/)?.[1]) >= 44);
});

test('the custom builder does not expose a difficulty selector', () => {
  const api = selection();
  const questions = [
    { id: 'easy', difficulty: 'easy' },
    { id: 'medium', difficulty: 'medium' },
    { id: 'hard', difficulty: 'hard' }
  ];
  assert.deepEqual(api.filter(questions, { difficulty: 'medium-hard' }).map(item => item.id), ['medium', 'hard']);
  assert.deepEqual(api.filter(questions, { difficulty: 'all' }).map(item => item.id), ['easy', 'medium', 'hard']);
  assert.deepEqual(api.filter(questions, {}).map(item => item.id), ['easy', 'medium', 'hard']);
  assert.doesNotMatch(page, /id="custom-difficulty"/);
  assert.match(page, /id="tutor-mode-choice" checked/);
  assert.match(page, /id="timed-mode-choice"/);
  assert.match(page, /tutorMode:target\.querySelector\('#tutor-mode-choice'\)\.checked/);
  assert.match(page, /timedMode:target\.querySelector\('#timed-mode-choice'\)\.checked/);
  assert.match(page, /tutorMode:practiceOptions\?\.tutorMode!==false/);
  assert.match(page, /timedMode:practiceOptions\?\.timedMode===true/);
  assert.match(page, /instant:activeSet\.tutorMode\?\?!activeSet\.assignmentId/);
  assert.match(page, /showTimer:activeSet\.timedMode/);
  assert.match(examUi, /this\.o\.showTimer === false \? null : setInterval/);
  assert.match(examUi, /this\.o\.showTimer === false \? '' : `.*Time Elapsed/);
});

test('builder offers scoped bulk selection without replacing practice filters', () => {
  const builder = page.slice(page.indexOf('function renderNclexLibrary()'), page.indexOf('function renderLibrary()'));
  for (const [group, label] of [['category', 'Client Needs'], ['study-area', 'Study Areas'], ['topic', 'topics'],
    ['item-type', 'question types'], ['question-mode', 'question history']]) {
    assert.ok(builder.includes(`bulkControls('${group}','${label}')`));
  }
  assert.match(builder, /data-selection-count="\$\{group\}" role="status"/);
  assert.match(builder, /input\.checked=checked/);
  assert.match(builder, /Select all and Clear all apply to all topics/);
  assert.match(builder, /selected===inputs\.length/);
  assert.match(builder, /selected===0/);
  assert.match(builder, /buildMixedReview\(count,null,topics,categories,'all',studyAreas,itemTypes,modes,practiceOptions\)/);
});

test('UWorld-inspired filters use existing Study Areas and Client Needs with supported item types', () => {
  const api = selection();
  const questions = [
    { id: 'mcq', itemType: 'mcq', nclexCategory: 'Management of Care', studyArea: 'Leadership & Professional Practice' },
    { id: 'sata', itemType: 'sata', nclexCategory: 'Management of Care', studyArea: 'Leadership & Professional Practice' },
    { id: 'other-category', itemType: 'mcq', nclexCategory: 'Psychosocial Integrity', studyArea: 'Mental Health' }
  ];
  assert.deepEqual(api.filter(questions, {
    itemTypes: ['sata'],
    studyAreas: ['Leadership & Professional Practice'],
    categories: ['Management of Care']
  }).map(item => item.id), ['sata']);
  assert.match(page, /data-category-tab="study-areas">Study Areas/);
  assert.match(page, /data-category-tab="client-needs">Client Needs/);
  assert.match(page, /id="mixed-item-type-choice" checked/);
  assert.match(page, /data-item-type-choice value="mcq"><span>Traditional/);
  assert.match(page, /data-item-type-choice value="sata"><span>Next Gen/);
  assert.match(page, /data-item-type-choice value="case"><span>NGN unfolding cases/);
  assert.doesNotMatch(page, /Systems\s*\(/);
  assert.match(page, /marked_for_review:\!\!activeSet\.sessionMarked/);
  assert.match(page, /Questions you have not practiced will be selected first/);
});

test('Core-Safe CAT and SWM-CAT withhold rationales until results review', () => {
  assert.match(diagnostic, /const isCAT = isNCLEX \|\| isMock/);
  for (const component of ['MCQQuestion', 'SATAQuestion', 'BowTieQuestion', 'CaseStudyQuestion']) {
    assert.match(diagnostic, new RegExp(`<${component}[^>]*examMode=\\{isCAT\\}`));
  }
  assert.match(diagnostic, /submitted&&isCAT&&<div[^>]*>Response recorded\. Item feedback will be available after the exam\./);
  assert.match(diagnostic, /submitted&&!isCAT&&q\.type!=="casestudy"/);
  assert.match(diagnostic, /\(isMock\|\|isNCLEX\) && sections\.length>0 && <details/);
});

test('question history modes use the latest attempt, and unused questions are distinguishable', () => {
  const api = selection();
  const history = api.summarizeLatestAttempts([
    { answer_details: [
      { question_id: 'correct', selected_answer: 0, correct: true, marked_for_review: false },
      { question_id: 'marked', selected_answer: 1, correct: false, marked_for_review: true },
      { question_id: 'omitted', selected_answer: null, correct: false, marked_for_review: false }
    ] },
    { answer_details: [{ question_id: 'correct', selected_answer: 2, correct: false, marked_for_review: false }] }
  ]);
  const questions = ['unused', 'correct', 'marked', 'omitted', 'incorrect'].map(id => ({ id }));
  assert.deepEqual(questions.map(question => api.questionMode(question, history)), ['unused', 'correct', 'marked', 'omitted', 'unused']);
  assert.deepEqual(
    api.filterByModes(questions, ['unused', 'correct'], history).map(question => question.id),
    ['unused', 'correct', 'incorrect']
  );
  assert.deepEqual({ ...api.countByMode(questions, history) }, {
    unused: 2,
    incorrect: 0,
    marked: 1,
    omitted: 1,
    correct: 1
  });
  const scopedQuestions = api.filter([
    { id: 'scoped-unused', itemType: 'mcq', studyArea: 'Adult Health' },
    { id: 'scoped-correct', itemType: 'mcq', studyArea: 'Adult Health' },
    { id: 'other-type', itemType: 'sata', studyArea: 'Adult Health' }
  ], { itemTypes: ['mcq'], studyAreas: ['Adult Health'] });
  const scopedHistory = new Map([['scoped-correct', { selected_answer: 0, correct: true }]]);
  assert.deepEqual({ ...api.countByMode(scopedQuestions, scopedHistory) }, {
    unused: 1,
    incorrect: 0,
    marked: 0,
    omitted: 0,
    correct: 1
  });
  const prioritized = api.selectByUsage(questions, 3, history);
  assert.deepEqual(
    Array.from(prioritized.slice(0, 2), question => api.questionMode(question, history)),
    ['unused', 'unused']
  );
  assert.notEqual(api.questionMode(prioritized[2], history), 'unused');
  assert.equal(new Set(prioritized.map(question => question.id)).size, prioritized.length);
  assert.equal(api.questionMode({ id: 'older-correct' }, history), 'unused');
  assert.equal(api.questionMode({ id: 'newest-wrong' }, new Map([['newest-wrong', { selected_answer: 1, correct_answer: 0 }]])), 'incorrect');
});

test('active bank SATA items map to array-based answers for ExamUI practice', () => {
  const api = selection();
  const sata = api.fromBankRow({
    item_type: 'sata',
    item_data: { options: ['A', 'B', 'C', 'D', 'E'], correct: [0, 2, 4] }
  });
  assert.equal(sata.itemType, 'sata');
  assert.deepEqual(Array.from(sata.answer), [0, 2, 4]);
  assert.equal(sata.options.length, 5);
  assert.equal(api.fromBankRow({
    item_type: 'sata',
    item_data: { options: ['A', 'B', 'C', 'D'], correct: [1, 1] }
  }), null);
  assert.equal(api.fromBankRow({
    item_type: 'sata',
    item_data: { options: ['A', 'B', 'C'], correct: [0] }
  }), null);
  assert.match(page, /\.in\('item_type',\['mcq','sata','case'\]\)/);
});

test('case history is grouped without splitting its six questions, and selection counts each case as six', () => {
  const api = selection();
  const caseQuestion = {
    id: 'case-1',
    itemType: 'case',
    childIds: ['case-1a', 'case-1b', 'case-1c', 'case-1d', 'case-1e', 'case-1f'],
    questionCount: 6
  };
  const history = new Map([
    ['case-1a', { selected_answer: 0, correct: false }],
    ['case-1b', { selected_answer: 1, correct: true }],
    ['case-1c', { selected_answer: 0, correct: true }],
    ['case-1d', { selected_answer: 1, correct: true }],
    ['case-1e', { selected_answer: 0, correct: true }],
    ['case-1f', { selected_answer: 1, correct: true }]
  ]);
  assert.equal(api.questionMode(caseQuestion, history), 'incorrect');
  assert.deepEqual(api.filterByModes([caseQuestion], ['incorrect'], history).map(item => item.id), ['case-1']);
  assert.deepEqual({ ...api.countByMode([caseQuestion], history) }, {
    unused: 0, incorrect: 6, marked: 0, omitted: 0, correct: 0
  });
  assert.equal(api.questionCount(caseQuestion), 6);

  const selected = api.selectByUsage([caseQuestion, { id: 'mcq-1' }], 7, new Map());
  assert.deepEqual(Array.from(selected, item => item.id).sort(), ['case-1', 'mcq-1']);
  assert.equal(selected.reduce((sum, item) => sum + api.questionCount(item), 0), 7);
  const mixed = api.selectByUsage([caseQuestion, ...Array.from({ length: 5 }, (_, index) => ({ id: `mcq-${index}` }))], 10, new Map());
  assert.equal(mixed.some(item => item.id === 'case-1'), true);
  assert.equal(mixed.reduce((sum, item) => sum + api.questionCount(item), 0), 10);
});

test('category and topic filters intersect instead of widening the selected pool', () => {
  const api = selection();
  const questions = [
    { id: 'match', nclexCategory: 'physiological', topic: 'Heart Failure', difficulty: 'hard' },
    { id: 'other-topic', nclexCategory: 'physiological', topic: 'Asthma', difficulty: 'hard' },
    { id: 'other-category', nclexCategory: 'psychosocial', topic: 'Heart Failure', difficulty: 'hard' },
    { id: 'easy', nclexCategory: 'physiological', topic: 'Heart Failure', difficulty: 'easy' }
  ];
  assert.deepEqual(
    api.filter(questions, {
      categories: ['physiological'],
      topics: ['Heart Failure'],
      difficulty: 'medium-hard'
    }).map(item => item.id),
    ['match']
  );
});

test('Study Areas intersect with Client Needs and topic filters across all difficulties', () => {
  const api = selection();
  const questions = [
    { id: 'match', studyArea: 'Maternal & Newborn', nclexCategory: 'physiological', topic: 'Fetal Monitoring', difficulty: 'hard' },
    { id: 'wrong-area', studyArea: 'Adult Health / Medical-Surgical', nclexCategory: 'physiological', topic: 'Fetal Monitoring', difficulty: 'hard' },
    { id: 'wrong-topic', studyArea: 'Maternal & Newborn', nclexCategory: 'physiological', topic: 'Postpartum', difficulty: 'hard' },
    { id: 'wrong-category', studyArea: 'Maternal & Newborn', nclexCategory: 'psychosocial', topic: 'Fetal Monitoring', difficulty: 'hard' },
    { id: 'wrong-difficulty', studyArea: 'Maternal & Newborn', nclexCategory: 'physiological', topic: 'Fetal Monitoring', difficulty: 'easy' }
  ];
  assert.deepEqual(
    api.filter(questions, {
      studyAreas: ['Maternal & Newborn'],
      categories: ['physiological'],
      topics: ['Fetal Monitoring'],
    }).map(item => item.id),
    ['match', 'wrong-difficulty']
  );
});

test('Study Area names are canonical and tutor mixed-review URLs preserve optional focus', () => {
  const context = { window: {} };
  vm.runInNewContext(studyAreaNames, context);
  const areas = Array.from(context.window.NCLEXStudyAreas.NAMES);
  assert.equal(areas.length, 8);
  assert.ok(context.window.NCLEXStudyAreas.isKnown('Mental Health'));
  assert.ok(!context.window.NCLEXStudyAreas.isKnown('Accelerations'));

  const urlSource = assignmentsPage.match(/function mixedPracticeUrl\(count,areas\)\{[\s\S]*?\n    \}/);
  assert.ok(urlSource, 'tutor page defines the mixed-review URL builder');
  const buildUrl = vm.runInNewContext(`(${urlSource[0]})`, { URLSearchParams });
  assert.equal(buildUrl(20, []), 'supplemental-practice.html?mixed=20');
  assert.equal(
    buildUrl(50, ['Maternal & Newborn', 'Pediatrics']),
    'supplemental-practice.html?mixed=50&area=Maternal+%26+Newborn&area=Pediatrics'
  );
  assert.match(assignmentsPage, /mixedParams\.getAll\('area'\)/);
  assert.match(page, /params\.getAll\('area'\)/);
});

test('Study Area migration validates and maps all 441 approved questions', () => {
  const mappings = Array.from(
    studyAreaMigration.matchAll(/^\s*\((\d+), '(mcq|sata)', '([^']+)'\)(?:,|;)\s*$/gm),
    match => ({
      questionNo: Number(match[1]),
      itemType: match[2],
      studyArea: match[3]
    })
  );
  const areaCounts = mappings.reduce((counts, mapping) => {
    counts[mapping.studyArea] = (counts[mapping.studyArea] || 0) + 1;
    return counts;
  }, {});
  const byNumber = new Map(mappings.map(mapping => [mapping.questionNo, mapping]));

  assert.equal(mappings.length, 441);
  assert.equal(new Set(mappings.map(mapping => mapping.questionNo)).size, 441);
  assert.equal(mappings.filter(mapping => mapping.itemType === 'mcq').length, 432);
  assert.equal(mappings.filter(mapping => mapping.itemType === 'sata').length, 9);
  assert.deepEqual(areaCounts, {
    'Leadership & Professional Practice': 82,
    'Pharmacology & Medication Safety': 47,
    'Fundamentals, Safety & Infection Control': 25,
    'Pediatrics': 11,
    'Maternal & Newborn': 172,
    'Adult Health / Medical-Surgical': 64,
    'Mental Health': 29,
    'Health Promotion & Maintenance': 11
  });
  assert.equal(byNumber.get(93).studyArea, 'Mental Health');
  assert.equal(byNumber.get(988).studyArea, 'Fundamentals, Safety & Infection Control');
  assert.equal(byNumber.get(1001).studyArea, 'Adult Health / Medical-Surgical');
  assert.equal(byNumber.get(40).studyArea, 'Mental Health');
  assert.match(studyAreaMigration, /ADD COLUMN IF NOT EXISTS study_area text/);
  assert.match(studyAreaMigration, /question\.active IS DISTINCT FROM TRUE/);
  assert.match(studyAreaMigration, /question\.item_type IS DISTINCT FROM mapping\.expected_item_type/);
  assert.match(studyAreaMigration, /question\.study_area IS NOT NULL AND question\.study_area IS DISTINCT FROM mapping\.study_area/);
  assert.match(studyAreaMigration, /UPDATE public\.questions AS question[\s\S]*?SET study_area = mapping\.study_area/);
  assert.doesNotMatch(studyAreaMigration, /SET\s+(?:nclex_category|topic|stem|rationale|correct_answer)\s*=/i);
});

test('student builder inventory and question query include active MCQ, SATA, and case entries', () => {
  assert.match(page, /loadQuestionCatalog[\s\S]*?\.eq\('active',true\)\.in\('item_type',\['mcq','sata','case'\]\)/);
  assert.match(page, /\.eq\('active',true\)\s*\.in\('item_type',\['mcq','sata','case'\]\)/);
  for (const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
  for (const script of assignmentsPage.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
});

test('assigned legacy practice sets load their questions from the master bank', () => {
  for (const id of ['safety-priority-01', 'med-procedure-01', 'ngn-acute-01']) {
    assert.match(page, new RegExp(`id:'${id}'.*questionSource:'question-bank'`));
  }
  assert.match(page, /id:'nur215-foundations-practice'.*questionSource:'question-bank'/);
  assert.match(page, /db\.from\('question_set_items'\)[\s\S]*?question:questions!inner/);
  assert.match(page, /Build a practice set/);
  assert.doesNotMatch(page, /Tutor-assigned sets & materials/);
  for (const legacyId of ['sp01-q01', 'mp01-q01', 'ng01-q01', 'nur215-001']) {
    assert.doesNotMatch(page, new RegExp(legacyId));
  }
});

test('available pathway practice sets do not require per-student module access', () => {
  assert.match(page, /db\.from\('modules'\)\.select\('module_key,is_available'\)/);
  assert.match(page, /availableModules=new Set\(\(modules\|\|\[\]\)\.filter\(item=>item\.is_available\)\.map\(item=>item\.module_key\)\)/);
  assert.match(page, /'ob-newborn-01':'core-lifespan-reproductive'/);
  assert.match(page, /modulePracticeSets\[id\]&&availableModules\.has\(modulePracticeSets\[id\]\)/);
  assert.doesNotMatch(page, /const moduleResources=/);
  assert.doesNotMatch(page, /Tutor-assigned sets & materials/);
  assert.match(page, /PracticeQuestionSelection\.countByMode\(filtered,questionHistoryById\)/);
  assert.match(page, /label\.textContent=modeCounts\?modeCounts\[mode\]:'Unavailable'/);

  const dashboard = readFileSync(join(root, 'student-dashboard.html'), 'utf8');
  assert.match(dashboard, /catalog\.filter\(i => showAvailableCatalog \? i\.is_available : enabled\.has\(i\.module_key\)\)/);
  assert.match(dashboard, /renderModulesInto\('modules-nclex', catalog, access, true\)/);
  assert.match(dashboard, /m\.guide_url \? `<a href="\$\{text\(m\.guide_url\)\}">Open module<\/a>`/);
  assert.doesNotMatch(dashboard, /m\.quiz_url && m\.quiz_url !== m\.guide_url/);
  assert.doesNotMatch(dashboard, /Open general practice/);
  assert.match(dashboard, /\.module a\{[^}]*background:var\(--ink\)[^}]*color:#fff/);
});

test('question-bank migration preserves all four legacy sets and supported item types', () => {
  const match = migration.match(/\$legacy_questions\$\n([\s\S]*?)\n\$legacy_questions\$::jsonb/);
  assert.ok(match, 'migration includes its JSON question payload');
  const questions = JSON.parse(match[1]);
  const counts = questions.reduce((grouped, question) => {
    (grouped[question.set_key] ||= []).push(question);
    return grouped;
  }, {});
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([key, items]) => [key, items.length])),
    {
      'safety-priority-01': 5,
      'med-procedure-01': 5,
      'ngn-acute-01': 5,
      'nur215-foundations-practice': 60
    }
  );
  assert.equal(questions.length, 75);
  assert.equal(questions.filter(question => question.item_type === 'mcq').length, 66);
  assert.equal(questions.filter(question => question.item_type === 'sata').length, 9);
  assert.equal(new Set(questions.map(question => `${question.set_key}:${question.legacy_id}`)).size, 75);
  for (const question of questions) {
    assert.ok(question.stem);
    assert.ok(question.rationale);
    assert.ok(Array.isArray(question.options) && question.options.length >= 4);
    assert.ok(Array.isArray(question.correct) && question.correct.length);
    assert.ok(question.position > 0);
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ON CONFLICT \(set_key, legacy_id\)/);
  assert.match(migration, /question_bank.*IS TRUE|q\.active IS TRUE/);
  assert.match(migration, /SET active = TRUE,[\s\S]*?source_key = COALESCE/);
  assert.match(migration, /q\.rationale IS DISTINCT FROM item\.rationale/);
  assert.match(migration, /different rationale; resolve the content before migrating/);
  assert.match(migration, /CREATE TEMP TABLE legacy_practice_items AS/);
  assert.doesNotMatch(migration, /CREATE TEMP TABLE legacy_practice_items ON COMMIT DROP/);
  assert.match(migration, /DO \$\$[\s\S]*?CREATE TEMP TABLE legacy_practice_items AS[\s\S]*?DROP TABLE legacy_practice_items;\s+END \$\$;\s+COMMIT;/);
});

test('QBank-backed practice preserves legacy IDs and SATA answer indexes', async () => {
  const payload = migration.match(/\$legacy_questions\$\n([\s\S]*?)\n\$legacy_questions\$::jsonb/);
  const items = JSON.parse(payload[1]).filter(item => item.set_key === 'nur215-foundations-practice');
  const records = items.map(item => ({
    legacy_id: item.legacy_id,
    question: {
      id: `db-${item.position}`,
      question_no: item.position,
      stem: item.stem,
      option_a: item.item_type === 'mcq' ? item.options[0] : null,
      option_b: item.item_type === 'mcq' ? item.options[1] : null,
      option_c: item.item_type === 'mcq' ? item.options[2] : null,
      option_d: item.item_type === 'mcq' ? item.options[3] : null,
      correct_answer: item.item_type === 'mcq' ? 'abcd'[item.correct[0]] : null,
      rationale: item.rationale,
      topic: item.topic,
      difficulty: item.difficulty,
      item_type: item.item_type,
      item_data: item.item_type === 'sata' ? { options: item.options, correct: item.correct } : null
    }
  }));
  const query = {
    select() { return this; },
    eq(field, value) { assert.equal(field, 'set_key'); assert.equal(value, 'nur215-foundations-practice'); return this; },
    order(field) { assert.equal(field, 'position'); return Promise.resolve({ data: records, error: null }); }
  };
  const loaderSource = page.match(/async function loadQuestionBankSet\(set\)\{[\s\S]*?\n    \}/);
  assert.ok(loaderSource, 'page contains the Question Bank set loader');
  const loadSet = vm.runInNewContext(`(${loaderSource[0]})`, {
    PracticeQuestionSelection: selection(),
    db: { from(table) { assert.equal(table, 'question_set_items'); return query; } }
  });
  const questions = await loadSet({ id: 'nur215-foundations-practice', questionCount: 60, title: 'NUR 215 Foundations Practice' });
  assert.equal(questions.length, 60);
  assert.equal(questions[0].id, 'nur215-001');
  assert.equal(questions.at(-1).id, 'nur215-060');
  const sata = questions.find(question => Array.isArray(question.answer));
  const sataItem = items.find(item => item.item_type === 'sata');
  assert.equal(sata.id, sataItem.legacy_id);
  assert.equal(sata.options.length, sataItem.options.length);
  assert.deepEqual(Array.from(sata.answer), sataItem.correct);
});

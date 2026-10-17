const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const page = readFileSync(join(root, 'core-rn-pathway.html'), 'utf8');
const moduleCatalogDefaults = readFileSync(join(root, 'madison-assignments.html'), 'utf8');
const moduleCatalogSeed = readFileSync(join(root, 'supabase-core-rn-module-catalog.sql'), 'utf8');
const moduleLinksMigration = readFileSync(join(root, 'supabase-learning-library-module-links-migration.sql'), 'utf8');
const inlineScript = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(script => script.includes('const requestedKey='));

function render(search) {
  const mounts = [];
  const elements = Object.fromEntries(
    ['pathway-back', 'pathway-eyebrow', 'pathway-title', 'pathway-intro', 'pathway-notice', 'modules']
      .map(id => [id, { textContent: '', innerHTML: '', href: '' }])
  );
  const document = {
    title: '',
    getElementById: id => elements[id],
    querySelector: () => elements.modules
  };
  const blueprint = {
    learningPathway: [
      {
        key: 'core-safety-priority',
        label: 'Safe Care, Priorities & Delegation',
        emoji: '🛡️',
        description: 'Priorities and safety.',
        requiredTopics: ['priority-frameworks', 'delegation', 'blood-administration', 'infection-prevention', 'procedure-safety']
      },
      {
        key: 'core-medication-calculations',
        label: 'Medication, Fluids & Calculations',
        emoji: '💊',
        description: 'Medication safety.',
        requiredTopics: ['insulin-hypoglycemia']
      },
      {
        key: 'core-lifespan-reproductive',
        label: 'OB, Newborn & Pediatric Safety',
        emoji: '👶',
        description: 'Lifespan safety.',
        requiredTopics: ['preeclampsia']
      },
      {
        key: 'core-acute-systems',
        label: 'Acute Care, Systems & Procedures',
        emoji: '🫁',
        description: 'Acute care.',
        requiredTopics: ['airway-emergency']
      },
      {
        key: 'core-psych-judgment',
        label: 'Psych, Clinical Judgment & NCLEX Integration',
        emoji: '🧠',
        description: 'Psych safety.',
        requiredTopics: ['suicide-safety']
      }
    ]
  };
  vm.runInNewContext(inlineScript, {
    window: { NCLEX_CORE_BLUEPRINT: blueprint, location: { search }, Core1Module: { mount: root => mounts.push(root) } },
    document,
    URLSearchParams
  });
  return { document, elements, mounts };
}

test('module links open a focused module with all its topics and related practice', () => {
  const moduleLinks = {
    'core-medication-calculations': 'supplemental-practice.html?set=med-procedure-01',
    'core-lifespan-reproductive': 'supplemental-practice.html?set=ob-newborn-01',
    'core-acute-systems': 'supplemental-practice.html?set=ngn-acute-01',
    'core-psych-judgment': 'supplemental-practice.html?mixed=20&area=Mental%20Health'
  };
  for (const [key, practiceUrl] of Object.entries(moduleLinks)) {
    const { document, elements } = render(`?module=${key}`);
    assert.ok(document.title.endsWith('· Core RN Safety Pathway'), `${key} should have a focused title`);
    assert.equal(elements['pathway-back'].href, 'core-rn-pathway.html');
    assert.equal(elements['pathway-back'].textContent, 'All core modules');
    assert.equal(elements['pathway-title'].textContent, document.title.split(' · Core RN Safety Pathway')[0]);
    assert.match(elements.modules.innerHTML, /Topics in this module/);
    assert.ok(elements.modules.innerHTML.replaceAll('&amp;', '&').includes(practiceUrl), `${key} should open its mapped practice`);
    assert.match(elements.modules.innerHTML, /Practice questions/);
    assert.doesNotMatch(elements.modules.innerHTML, /Explore module/);
  }

  const { document, elements, mounts } = render('?module=core-safety-priority');
  assert.equal(document.title, 'Safe Care, Priorities & Delegation · Core RN Safety Pathway');
  assert.deepEqual(mounts, [elements.modules]);
  assert.equal(elements.modules.innerHTML, '');
});

test('pathway without a module selection remains an overview linking to focused pages', () => {
  const { elements } = render('');
  assert.match(elements.modules.innerHTML, /Core module 1/);
  assert.match(elements.modules.innerHTML, /Core module 2/);
  assert.match(elements.modules.innerHTML, /core-rn-pathway\.html\?module=core-safety-priority/);
  assert.match(elements.modules.innerHTML, /core-rn-pathway\.html\?module=core-medication-calculations/);
  assert.match(elements.modules.innerHTML, /Open module/);
});

test('module catalog links Module 3 and Core 5 to their current learning experiences', () => {
  assert.match(moduleCatalogDefaults, /module_key:'m3'[^}]*guide_url:'module3-guide\.html'/);
  assert.match(moduleCatalogDefaults, /module_key:'core-psych-judgment'[^}]*quiz_url:'supplemental-practice\.html\?mixed=20&area=Mental%20Health'/);
  assert.match(moduleCatalogSeed, /\('core-psych-judgment',[\s\S]*?'core-rn-pathway\.html\?module=core-psych-judgment',\s*'supplemental-practice\.html\?mixed=20&area=Mental%20Health'/);
  assert.match(moduleLinksMigration, /SET\s+guide_url = 'module3-guide\.html',\s+quiz_url = NULL/i);
  assert.match(moduleLinksMigration, /WHERE module_key = 'm3'/);
  assert.match(moduleLinksMigration, /SET\s+quiz_url = 'supplemental-practice\.html\?mixed=20&area=Mental%20Health'/);
  assert.match(moduleLinksMigration, /WHERE module_key = 'core-psych-judgment'/);
  assert.equal((moduleLinksMigration.match(/RETURNING module_key, name, guide_url, quiz_url, is_available/g) || []).length, 2);
});

test('available Learning Library cards open their guide as a single module entry', () => {
  const dashboard = readFileSync(join(root, 'student-dashboard.html'), 'utf8');
  assert.match(dashboard, /m\.guide_url \? `<a href="\$\{text\(m\.guide_url\)\}">Open module<\/a>`/);
  assert.doesNotMatch(dashboard, /m\.quiz_url && m\.quiz_url !== m\.guide_url/);
  for (const [key, guide] of [
    ['m1', 'module1-newborn.html'],
    ['m2', 'module2-maternal.html'],
    ['m3', 'module3-guide.html'],
    ['m4', 'module4-guide.html'],
    ['m5', 'module5-guide.html'],
    ['m6', 'module6-guide.html'],
    ['m7', 'module7-ekg.html']
  ]) {
    assert.match(moduleCatalogDefaults, new RegExp(`module_key:'${key}'[^}]*guide_url:'${guide.replaceAll('.', '\\.')}'`));
    assert.ok(require('node:fs').existsSync(join(root, guide)), `${key} guide exists`);
  }
});

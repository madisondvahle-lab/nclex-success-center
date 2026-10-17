const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const page = readFileSync(join(root, 'core-rn-pathway.html'), 'utf8');
const inlineScript = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(script => script.includes('const requestedKey='));

function render(search) {
  const elements = Object.fromEntries(
    ['pathway-back', 'pathway-eyebrow', 'pathway-title', 'pathway-intro', 'pathway-notice', 'modules']
      .map(id => [id, { textContent: '', innerHTML: '', href: '' }])
  );
  const document = {
    title: '',
    getElementById: id => elements[id]
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
      }
    ]
  };
  vm.runInNewContext(inlineScript, {
    window: { NCLEX_CORE_BLUEPRINT: blueprint, location: { search } },
    document,
    URLSearchParams
  });
  return { document, elements };
}

test('module links open a focused module with all its topics and related practice', () => {
  const { document, elements } = render('?module=core-safety-priority');
  assert.equal(document.title, 'Safe Care, Priorities & Delegation · Core RN Safety Pathway');
  assert.equal(elements['pathway-back'].href, 'core-rn-pathway.html');
  assert.equal(elements['pathway-back'].textContent, 'All core modules');
  assert.equal(elements['pathway-title'].textContent, 'Safe Care, Priorities & Delegation');
  assert.match(elements.modules.innerHTML, /Topics in this module/);
  assert.match(elements.modules.innerHTML, /procedure safety/);
  assert.match(elements.modules.innerHTML, /supplemental-practice\.html\?set=safety-priority-01/);
  assert.match(elements.modules.innerHTML, /Practice questions/);
  assert.doesNotMatch(elements.modules.innerHTML, /Medication, Fluids &amp; Calculations/);
});

test('pathway without a module selection remains an overview linking to focused pages', () => {
  const { elements } = render('');
  assert.match(elements.modules.innerHTML, /Core module 1/);
  assert.match(elements.modules.innerHTML, /Core module 2/);
  assert.match(elements.modules.innerHTML, /core-rn-pathway\.html\?module=core-safety-priority/);
  assert.match(elements.modules.innerHTML, /core-rn-pathway\.html\?module=core-medication-calculations/);
});

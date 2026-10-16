const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');

function loadImporter() {
  const context = { window: {} };
  for (const file of ['category-names.js', 'assessment-import.js']) {
    vm.runInNewContext(read(file), context, { filename: file });
  }
  return context.window.AssessmentImport;
}

test('UWorld CAT table extracts all Client Needs even with expanded Safety label', () => {
  const importer = loadImporter();
  const reportText = [
    'Overall score 65%',
    'TOTAL Q SCORED / MAX CORRECT Q INCORRECT Q OMITTED Q',
    'Management of Care 14 24 / 36 (67%) 6 (43%) 8 (57%) 0 (0%)',
    'Safety and Infection Prevention and Control 1 1 / 3 (33%) 0 (0%) 1 (100%) 0 (0%)',
    'Health Promotion and Maintenance 20 39 / 53 (74%) 9 (45%) 11 (55%) 0 (0%)',
    'Psychosocial Integrity 6 15 / 18 (83%) 4 (67%) 2 (33%) 0 (0%)',
    'Basic Care and Comfort 3 4 / 11 (36%) 0 (0%) 3 (100%) 0 (0%)',
    'Pharmacological and Parenteral Therapies 15 16 / 30 (53%) 4 (27%) 11 (73%) 0 (0%)',
    'Reduction of Risk Potential 2 6 / 7 (86%) 1 (50%) 1 (50%) 0 (0%)',
    'Physiological Adaptation 24 44 / 71 (62%) 7 (29%) 17 (71%) 0 (0%)'
  ].join(' ');

  const parsed = importer.parseText(reportText);
  assert.equal(Object.keys(parsed.cats).length, 8);
  assert.equal(parsed.cats['Safety and Infection Control'], 33);
  assert.equal(parsed.cats['Physiological Adaptation'], 62);
  assert.equal(parsed.counts['Management of Care'], 14);
});

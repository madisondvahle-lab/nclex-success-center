const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const questions = JSON.parse(readFileSync(join(root, 'nur312-exam2-parallel-question-bank.json'), 'utf8'));
const keys = questions.map(({ id, source, a, difficulty, topic }) => ({ id, source, a, difficulty, topic }));
if (new Set(keys.map(item => item.id)).size !== keys.length ||
    keys.some(item => !item.id || !item.source || !Number.isInteger(item.a) || item.a < 0 || item.a > 3)) {
  throw new Error('Parallel practice bank has invalid IDs or MCQ keys.');
}
const template = readFileSync(join(__dirname, 'parallel-practice-migration.sql'), 'utf8');
writeFileSync(join(root, 'supabase-nur312-parallel-persistence.sql'), template.replace('__BANK_KEYS__', JSON.stringify(keys)));

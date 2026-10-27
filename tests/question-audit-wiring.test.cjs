const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const read = file => readFileSync(join(root, file), 'utf8');

test('review page loads the audit panel inside Review & Flags', () => {
  const page = read('question-bank-review.html');
  assert.match(page, /<script src="question-audit-panel\.js\?v=archive-v1"><\/script>/);
  assert.match(page, /id="qa-audit-mount"/);
  assert.match(page, /globalThis\.QAAudit\?\.init\(/);
  assert.match(page, /QAAudit\.core\.validateContent\(proposed\)/);
  assert.match(read('question-audit-panel.js'), /supabase\/functions\/shared\/question-audit-core\.mjs/);
  assert.match(read('supabase/functions/question-audit/index.ts'), /"\.\.\/shared\/question-audit-core\.mjs"/);
});

test('audit migration is additive and admin-only', () => {
  const sql = read('supabase-question-audit.sql').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|alter table questions|update questions set (?!active))/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /is_app_admin\(\)/);
  assert.match(sql, /revoke all on function set_question_quarantine/i);
});

test('audit function never modifies questions or applies, approves or publishes drafts', () => {
  const fn = read('supabase/functions/question-audit/index.ts');
  assert.doesNotMatch(fn, /from\("questions"\)\s*\.(update|insert|delete|upsert)/);
  assert.doesNotMatch(fn, /apply_question_revision|approve_question_revision|set_question_quarantine/);
  assert.match(fn, /status: "pending_review"/);
  assert.match(fn, /is_app_admin/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { pickNextQuestion, shouldStop, updateAbility } from './diagnostic-assessment-engine.mjs';

test('published diagnostic banks contain no answer keys or rationales', () => {
  const source = readFileSync(new URL('../../../diagnostic-question-bank.js', import.meta.url), 'utf8');
  const window = {};
  runInNewContext(source, { window });
  assert.deepEqual(Object.keys(window.DIAGNOSTIC_BANKS).sort(), ['questionBank', 'remediationBank']);
  assert.equal(window.DIAGNOSTIC_BANKS.questionBank.length, 174);
  assert.equal(window.DIAGNOSTIC_BANKS.remediationBank.length, 52);

  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /^(correct|correctanswer|correctleft|correctcenter|correctright|rationale|answerkey)$/i);
      visit(child);
    }
  };
  visit(window.DIAGNOSTIC_BANKS);
});

test('client roles cannot read attempt scores or item responses directly', () => {
  const migration = readFileSync(
    new URL('../../../.agents/private/supabase-diagnostic-item-keys-migration.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ALTER TABLE public\.in_house_assessment_attempts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY "admins manage in-house assessment attempts"/);
  assert.match(migration, /DROP POLICY IF EXISTS "students read own in-house assessment attempts"/);
  assert.match(migration, /DROP POLICY IF EXISTS "students create own in-house assessment attempts"/);
  assert.match(migration, /REVOKE ALL ON public\.in_house_assessment_attempts FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.in_house_assessment_attempts TO authenticated/);
  assert.match(migration, /REVOKE ALL ON public\.in_house_assessment_item_responses FROM PUBLIC, anon, authenticated/);
});

test('adaptive selection prefers an unused item that covers a missing core tag', () => {
  const bank = [
    { item_id: 'already-used', item_type: 'mcq', difficulty: 2, blueprint: 'Other', core_tags: ['airway'] },
    { item_id: 'core-item', item_type: 'mcq', difficulty: 2, blueprint: 'Other', core_tags: ['airway'] },
    { item_id: 'unrelated-item', item_type: 'mcq', difficulty: 2, blueprint: 'Other', core_tags: [] },
  ];
  const next = pickNextQuestion(
    bank,
    [{ id: 'already-used', sourceId: 'already-used', difficulty: 2, blueprint: 'Other', core_tags: [] }],
    { mode: 'practice' },
    0.5,
    [{ key: 'airway' }],
  );
  assert.equal(next.item_id, 'core-item');
});

test('CAT ability updates move toward the submitted outcome', () => {
  const before = 0.5;
  assert.ok(updateAbility(before, true, 2) > before);
  assert.ok(updateAbility(before, false, 2) < before);
});

test('CAT stopping waits for required core coverage', () => {
  const history = Array.from({ length: 45 }, (_, index) => ({
    id: `item-${index}`,
    difficulty: 2,
    blueprint: 'Safe & Effective Care Environment',
  }));
  assert.equal(shouldStop(history, 0.9, [{ key: 'airway' }]), null);
});

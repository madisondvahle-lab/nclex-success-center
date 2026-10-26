import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as candidate from '../supabase/functions/_shared/diagnostic-assessment-engine.mjs';
import * as hosted from './fixtures/cat-hosted-baseline/_shared/diagnostic-assessment-engine.mjs';

test('production baseline fixtures retain the exact downloaded handler and adaptive engine', () => {
  for (const [path, hash] of [
    ['diagnostic-assessment/index.ts', '90d01bf586b909e0979e2f1843239fc214e6958838139babddb2f7e31b532da0'],
    ['_shared/diagnostic-assessment-engine.mjs', '25f80bc6f0938d701187a6efc9934573cdd1bc3e9b5d7ecc91792bb0f1969c8d'],
  ]) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`./fixtures/cat-hosted-baseline/${path}`, import.meta.url))).digest('hex'), hash);
  }
});

test('legacy selection, ability and stopping match actual hosted code over difficulty, coverage and length boundaries', t => {
  let comparisons = 0;
  const categories = [
    ['Management of Care', 'Safe & Effective Care Environment'],
    ['Safety & Infection Prevention', 'Safe & Effective Care Environment'],
    ['Health Promotion & Maintenance', 'Health Promotion & Maintenance'],
    ['Psychosocial Integrity', 'Psychosocial Integrity'],
    ['Basic Care & Comfort', 'Physiological Integrity'],
    ['Pharmacological & Parenteral Therapies', 'Physiological Integrity'],
    ['Reduction of Risk Potential', 'Physiological Integrity'],
    ['Physiological Adaptation', 'Physiological Integrity'],
  ];
  const bank = Array.from({ length: 170 }, (_, i) => ({
    item_id: `key-${i}`, item_type: i % 10 === 0 ? 'casestudy' : 'mcq',
    case_length: 6, difficulty: i % 3 + 1, core_tags: i % 2 ? ['core'] : [],
    nclex_category: categories[i % 8][0], blueprint: categories[i % 8][1],
  }));
  for (const ability of [0.05, 0.28, 0.5, 0.589, 0.591, 0.6, 0.72, 0.95]) {
    for (const difficulty of [1, 2, 3]) for (const correct of [true, false]) {
      assert.equal(candidate.updateAbility(ability, correct, difficulty), hosted.updateAbility(ability, correct, difficulty));
      comparisons++;
    }
    for (const length of [0, 1, 29, 30, 44, 45, 84, 85, 149, 150]) {
      const history = bank.slice(0, length).map((item, i) => ({ ...item, id: item.item_id, sourceId: item.item_id, correct: i % 2 === 0 }));
      for (const requirements of [[], [{ key: 'core' }], [{ key: 'missing' }]]) {
        assert.equal(candidate.shouldStop(history, ability, requirements), hosted.shouldStop(history, ability, requirements));
        assert.equal(candidate.shouldStopMock(history, ability, requirements), hosted.shouldStopMock(history, ability, requirements));
        comparisons += 2;
        for (const mode of ['nclex', 'mock', 'assessment', 'practice', 'remediation']) {
          for (const maximum of [45, 85, 150]) for (const random of [0, 0.49, 0.99]) {
            t.mock.method(Math, 'random', () => random);
            const profile = { mode, weakAreas: ['Management of Care'], externalCategoryWeights: { 'Management of Care': 1.5 } };
            assert.deepEqual(candidate.pickNextQuestion(bank, history, profile, ability, requirements, maximum),
              hosted.pickNextQuestion(bank, history, profile, ability, requirements, maximum));
            t.mock.restoreAll();
            comparisons++;
          }
        }
      }
    }
  }
  assert.equal(comparisons, 11328);
});

test('prior-question preference is an explicit Phase 1 extension; hosted fixtures remain unchanged', () => {
  const handler = readFileSync(new URL('../supabase/functions/diagnostic-assessment/index.ts', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('../supabase/functions/_shared/diagnostic-assessment-engine.mjs', import.meta.url), 'utf8');
  assert.match(handler, /diagnostic-assessment-history/);
  assert.match(engine, /preferences\.previouslyAnsweredIds/);
});

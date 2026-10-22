import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { pickNextQuestion, shouldStop, updateAbility } from './diagnostic-assessment-engine.mjs';
import { previouslyAnsweredItemIds } from './diagnostic-assessment-history.mjs';

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

const selectionItem = (id, overrides = {}) => ({
  item_id: id,
  item_type: 'mcq',
  difficulty: 2,
  blueprint: 'Other',
  core_tags: [],
  ...overrides,
});

test('CAT prefers an unanswered equivalent even beyond the original three-item shortlist', t => {
  t.mock.method(Math, 'random', () => 0);
  const bank = ['old-1', 'old-2', 'old-3', 'new'].map(id => selectionItem(id));
  for (const mode of ['nclex', 'mock', 'assessment']) {
    const next = pickNextQuestion(bank, [], { mode }, 0.5, [], 150, new Set(['old-1', 'old-2', 'old-3']));
    assert.equal(next.item_id, 'new');
  }
});

test('CAT history does not displace a better difficulty match outside the existing score tolerance', () => {
  const bank = [selectionItem('old'), selectionItem('new', { difficulty: 3 })];
  const next = pickNextQuestion(bank, [], { mode: 'nclex' }, 0.5, [], 45, new Set(['old']));
  assert.equal(next.item_id, 'old');
});

test('CAT prefers unanswered items within, but not outside, the 0.04 score tolerance', t => {
  t.mock.method(Math, 'random', () => 0);
  const bank = [selectionItem('old'), selectionItem('new', { difficulty: 3 })];
  const seen = new Set(['old']);
  assert.equal(pickNextQuestion(bank, [], { mode: 'nclex' }, 0.591, [], 45, seen).item_id, 'new');
  assert.equal(pickNextQuestion(bank, [], { mode: 'nclex' }, 0.589, [], 45, seen).item_id, 'old');
});

test('CAT can repeat a previously answered item to satisfy required topic coverage', () => {
  const bank = [selectionItem('old-core', { core_tags: ['airway'] }), selectionItem('new')];
  const next = pickNextQuestion(bank, [], { mode: 'nclex' }, 0.5, [{ key: 'airway' }], 45, new Set(['old-core']));
  assert.equal(next.item_id, 'old-core');
});

test('mock and readiness assessments retain Client Needs priority over unanswered items', () => {
  const bank = [
    selectionItem('old-management', { nclex_category: 'Management of Care' }),
    selectionItem('new-pharm', { nclex_category: 'Pharmacological & Parenteral Therapies' }),
  ];
  for (const mode of ['mock', 'assessment']) {
    const next = pickNextQuestion(bank, [], { mode }, 0.5, [], 150, new Set(['old-management']));
    assert.equal(next.item_id, 'old-management');
  }
});

test('CAT retains blueprint coverage priority over unanswered items', () => {
  const bank = [
    selectionItem('old-safe', { blueprint: 'Safe & Effective Care Environment' }),
    selectionItem('new-physio', { blueprint: 'Physiological Integrity' }),
  ];
  const next = pickNextQuestion(bank, [], { mode: 'nclex' }, 0.5, [], 45, new Set(['old-safe']));
  assert.equal(next.item_id, 'old-safe');
});

test('CAT still selects a question when every eligible item has been answered before', t => {
  t.mock.method(Math, 'random', () => 0);
  const bank = [selectionItem('old-1'), selectionItem('old-2')];
  assert.equal(pickNextQuestion(bank, [], { mode: 'nclex' }, 0.5, [], 45, new Set(['old-1', 'old-2'])).item_id, 'old-1');
});

test('CAT never repeats a current-attempt item or case-study parent, even if the pool is exhausted', () => {
  const bank = [
    selectionItem('used'),
    selectionItem('case', { item_type: 'casestudy', case_length: 6 }),
    selectionItem('old'),
  ];
  const history = [{ id: 'used' }, { id: 'case:child', sourceId: 'case' }];
  const seen = new Set(['used', 'case', 'old']);
  assert.equal(pickNextQuestion(bank, history, { mode: 'nclex' }, 0.5, [], 45, seen).item_id, 'old');
  assert.equal(pickNextQuestion(bank.slice(0, 2), history, { mode: 'nclex' }, 0.5, [], 45, seen), null);
});

test('mock history awareness does not bypass the remaining case-study question limit', () => {
  const bank = [
    selectionItem('new-case', { item_type: 'casestudy', case_length: 6 }),
    selectionItem('old-single'),
  ];
  const next = pickNextQuestion(bank, Array.from({ length: 84 }, (_, id) => ({ id: `used-${id}` })), { mode: 'mock' }, 0.5, [], 85, new Set(['old-single']));
  assert.equal(next.item_id, 'old-single');
});

test('an empty historical set preserves existing selection behavior', t => {
  t.mock.method(Math, 'random', () => 0.75);
  const bank = ['one', 'two', 'three', 'four'].map(id => selectionItem(id));
  const args = [bank, [], { mode: 'nclex' }, 0.5, [], 45];
  assert.equal(pickNextQuestion(...args).item_id, pickNextQuestion(...args, new Set()).item_id);
});

function historyService(rows, failAtOffset = -1) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'in_house_assessment_item_responses');
      const filters = [];
      return {
        select(columns) {
          assert.equal(columns, 'id,item_id,in_house_assessment_attempts!inner(student_id)');
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'in_house_assessment_attempts.student_id');
          calls.push(['student', value]);
          filters.push(row => row.in_house_assessment_attempts?.student_id === value);
          return this;
        },
        neq(column, value) {
          assert.equal(column, 'attempt_id');
          calls.push(['exclude', value]);
          filters.push(row => row.attempt_id !== value);
          return this;
        },
        order(column, options) {
          assert.equal(column, 'id');
          assert.deepEqual(options, { ascending: true });
          return this;
        },
        async range(start, end) {
          calls.push(['range', start, end]);
          if (start === failAtOffset) return { data: null, error: new Error('History unavailable') };
          return {
            data: rows.filter(row => filters.every(filter => filter(row)))
              .sort((a, b) => a.id.localeCompare(b.id)).slice(start, end + 1),
            error: null,
          };
        },
      };
    },
  };
}

const savedResponse = (id, itemId, studentId = 'student-a', attemptId = 'previous') => ({
  id,
  item_id: itemId,
  attempt_id: attemptId,
  in_house_assessment_attempts: { student_id: studentId },
});

test('saved history is student-scoped, excludes the current attempt, and maps case children to parents', async () => {
  const service = historyService([
    savedResponse('1', 'single'),
    savedResponse('2', 'case:child-1'),
    savedResponse('3', 'case:child-2'),
    savedResponse('4', 'other-student-only', 'student-b'),
    savedResponse('5', 'current-only', 'student-a', 'current'),
    savedResponse('6', 'unknown-retired-id'),
  ]);
  const keys = [
    selectionItem('single'),
    selectionItem('case', { item_type: 'casestudy' }),
    selectionItem('case:child-1', { parent_item_id: 'case', selectable: false }),
    selectionItem('case:child-2', { parent_item_id: 'case', selectable: false }),
    selectionItem('other-student-only'),
    selectionItem('current-only'),
  ];
  const ids = await previouslyAnsweredItemIds(service, 'student-a', keys, 'current');
  assert.deepEqual([...ids].sort(), ['case', 'single']);
  assert.deepEqual(service.calls.slice(0, 2), [['student', 'student-a'], ['exclude', 'current']]);
  assert.equal(pickNextQuestion([keys[1], selectionItem('unused')], [], { mode: 'nclex' }, 0.5, [], 45, ids).item_id, 'unused');
});

test('saved history includes all pages beyond the Supabase default row limit', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => savedResponse(String(index).padStart(4, '0'), `item-${index}`));
  const service = historyService(rows);
  const keys = rows.map(row => selectionItem(row.item_id));
  const ids = await previouslyAnsweredItemIds(service, 'student-a', keys);
  assert.equal(ids.size, 1001);
  assert.ok(ids.has('item-1000'));
  assert.deepEqual(service.calls.filter(call => call[0] === 'range'), [
    ['range', 0, 499], ['range', 500, 999], ['range', 1000, 1499],
  ]);
});

test('reviewed NGN child exposure maps to its parent without changing saved response IDs', async () => {
  const parent = 'qbank:00000000-0000-4000-8000-000000000001';
  const rows = [savedResponse('1', `${parent}:first`), savedResponse('2', `${parent}:second`)];
  const keys = [selectionItem(parent, { item_type: 'casestudy', ngn_entry: { kind: 'case', items: [{ id: 'first' }, { id: 'second' }] } })];
  const original = structuredClone(rows);
  assert.deepEqual(await previouslyAnsweredItemIds(historyService(rows), 'student-a', keys), new Set([parent]));
  assert.deepEqual(rows, original);
});

test('a new student with no saved answers retains an empty history', async () => {
  assert.deepEqual(await previouslyAnsweredItemIds(historyService([]), 'student-a', []), new Set());
});

test('saved-history query errors are surfaced, including failures after the first page', async () => {
  await assert.rejects(previouslyAnsweredItemIds(historyService([], 0), 'student-a', []), /History unavailable/);
  const rows = Array.from({ length: 500 }, (_, index) => savedResponse(String(index), 'single'));
  await assert.rejects(previouslyAnsweredItemIds(historyService(rows, 500), 'student-a', [selectionItem('single')]), /History unavailable/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { pickNextQuestion } from '../supabase/functions/_shared/diagnostic-assessment-engine.mjs';
import { previouslyAnsweredItemIds, selectionPreferences, historySnapshot } from '../supabase/functions/_shared/diagnostic-assessment-history.mjs';
import { publicCheckpoint } from '../supabase/functions/_shared/diagnostic-ngn.mjs';

const key = (id, extra = {}) => ({
  item_id: id, item_type: 'mcq', difficulty: 2, blueprint: 'Safe & Effective Care Environment',
  nclex_category: 'Management of Care', core_tags: ['delegation'], ...extra,
});
const pick = (bank, preferences, history = []) =>
  pickNextQuestion(bank, history, { mode: 'mock' }, 0.5, [{ key: 'delegation' }], 150, preferences);

test('unused preference is within the unchanged safety, category and difficulty shortlist', () => {
  const bank = [key('seen'), key('new'), key('wrong-category', { nclex_category: 'Other' }),
    key('wrong-safety', { core_tags: [] }), key('too-hard', { difficulty: 3 })];
  assert.equal(pick(bank, { diversify: true, previouslyAnsweredIds: new Set(['seen']) }).item_id, 'new');
  assert.equal(pick([bank[0], bank[4]], { previouslyAnsweredIds: new Set(['seen']) }).item_id, 'seen');
});

test('all equivalent candidates are reachable without insertion-order first-three bias', t => {
  const bank = Array.from({ length: 20 }, (_, i) => key(`item-${i}`));
  const reached = new Set();
  for (let i = 0; i < 20; i++) {
    t.mock.method(Math, 'random', () => (i + 0.5) / 20);
    reached.add(pick(bank, { diversify: true }).item_id);
    t.mock.restoreAll();
  }
  assert.equal(reached.size, 20);
});

test('current-attempt repeats and oversized cases stay excluded, including all-seen fallback', () => {
  const bank = [key('used'), key('fallback'), key('case', { item_type: 'casestudy', case_length: 151 })];
  assert.equal(pick(bank, { diversify: true, previouslyAnsweredIds: new Set(['fallback']) },
    [{ sourceId: 'used', blueprint: 'Other', core_tags: [] }]).item_id, 'fallback');
});

function service(rows, failAt = -1) {
  const calls = [];
  return { calls, from(table) {
    assert.equal(table, 'in_house_assessment_item_responses');
    const filters = [];
    return {
      select(value) { assert.match(value, /!inner\(student_id\)/); return this; },
      eq(field, value) { filters.push(row => row.student === value); calls.push([field, value]); return this; },
      neq(field, value) { filters.push(row => row[field] !== value); return this; },
      order(field) { assert.equal(field, 'id'); return this; },
      async range(start, end) {
        if (start === failAt) return { error: new Error('history read failed') };
        return { data: rows.filter(r => filters.every(f => f(r))).slice(start, end + 1) };
      },
    };
  } };
}

test('history is student-scoped, paginated and maps traditional and NGN case children', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ item_id: 'seen', student: 'own', attempt_id: 'prior' }));
  rows.push({ item_id: 'case:a', student: 'own' }, { item_id: 'ngn:b', student: 'own' },
    { item_id: 'other-student', student: 'other' }, { item_id: 'current', student: 'own', attempt_id: 'current' });
  const keys = [key('seen'), key('case:a', { parent_item_id: 'case' }),
    key('ngn', { ngn_entry: { kind: 'case', items: [{ id: 'b' }] } }),
    key('other-student'), key('current')];
  const db = service(rows);
  const result = await previouslyAnsweredItemIds(db, 'own', keys, 'current');
  assert.deepEqual([...result].sort(), ['case', 'ngn', 'seen']);
  assert.equal(db.calls.length, 2);
});

test('history errors propagate even after the first page; empty history is valid', async () => {
  const rows = Array.from({ length: 501 }, () => ({ item_id: 'seen', student: 'own' }));
  await assert.rejects(previouslyAnsweredItemIds(service(rows, 500), 'own', [key('seen')]), /history read failed/);
  assert.equal((await previouslyAnsweredItemIds(service([]), 'own', [])).size, 0);
});

test('server-owned per-attempt snapshots avoid historical scans on later answers and are never public', async () => {
  const first = await selectionPreferences(service([{ item_id: 'seen', student: 'own' }]), 'own', [key('seen')]);
  const snapshot = historySnapshot(first);
  const second = await selectionPreferences({ from() { throw new Error('must not rescan'); } }, 'own', [],
    { checkpoint: { selectionHistory: snapshot } });
  assert.deepEqual([...second.previouslyAnsweredIds], ['seen']);
  assert.equal(publicCheckpoint({ selectionHistory: snapshot }).selectionHistory, undefined);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registryEntry, MODEL, selectCurrent, currentInteraction, publicInteraction, publicCheckpoint, scoreCurrent, recordCredit, validateDraft, responseDetail } from './diagnostic-ngn.mjs';
import { pickNextQuestion, updateAbility, updateNGNAbility, standardError, shouldStopMock, shouldStopNGN, ngnEvidence } from './diagnostic-assessment-engine.mjs';
const scoring = globalThis.NGNScoring;
const base = (type, fields) => ({ id: type, type, stem: 'Synthetic prompt', rationale: 'Synthetic rationale', schemaVersion: 1, textFormat: 'plain', scoringVersion: 'ngn-v1', ...fields });
export const fixtures = [
  base('mcq', { options: ['A', 'B'], correct: [0] }),
  base('sata', { options: ['A', 'B', 'C'], correct: [0, 1] }),
  base('highlight', { segments: [{ id: 'a', t: 'Finding A', correct: true }, { id: 'b', t: 'Finding B', correct: true }, { id: 'c', t: 'Finding C', correct: false }] }),
  base('matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'], responseMode: 'single' }),
  base('matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'] }),
  base('cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['C', 'D'], correct: 1 }] }),
  base('bowtie', { bowtie: { actions: ['A', 'B', 'C'], conditions: ['D', 'E'], complications: ['F', 'G', 'H'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } }),
  base('fill', { correct: 1.25, tolerance: 0.01, unit: 'units' }),
];
export const study = {
  id: 'case-source', kind: 'case', schemaVersion: 1, textFormat: 'plain', scenario: 'Synthetic scenario',
  tabs: [{ id: 'notes', label: 'Notes', columns: ['Finding'], entries: [
    { at: '2026-10-21T08:00', cells: [{ id: 'a', t: 'Finding A' },] },
    { at: '2026-10-21T09:00', fromItem: 2, cells: [{ id: 'future-id', t: 'NEVER SEND BEFORE STAGE TWO' }] },
  ] }],
  items: [base('highlight', { id: 'first', chartSelections: true, segments: [{ id: 'a', t: 'Finding A', correct: true, rationale: 'PRIVATE KEY RATIONALE' }] }),
    { ...fixtures[5], id: 'second' }, { ...fixtures[6], id: 'third' }],
};
export const row = (entry = study, extra = {}) => ({
  id: '00000000-0000-4000-8000-000000000001', active: true, source_key: 'qbank-bulk-test-authored',
  stem: 'Synthetic prompt', rationale: 'Synthetic rationale', difficulty: 'medium', nclex_category: 'Physiological Adaptation',
  topic: 'Synthetic test', item_type: entry.kind === 'case' ? 'case' : entry.type, item_data: entry, ...extra,
});
const review = { status: 'published' };
export async function checkpoint(entry = study) {
  const key = await registryEntry(row(entry), review);
  const cp = { scoringModel: MODEL, mode: 'mock', ngnState: selectCurrent({}, key) };
  cp.currentItemId = currentInteraction(cp).id;
  return cp;
}
test('type-specific points: plus/minus, row zero/one, cloze, bow-tie and numeric', () => {
  const answers = [0, [0], ['a'], ['0:0', '1:0'], ['0:0', '1:0'], [0, 0], [0, 2, 0, 0, 2], '1.25'];
  const expected = [[1, 1], [1, 2], [1, 2], [1, 2], [0, 2], [1, 2], [3, 5], [1, 1]];
  fixtures.forEach((it, i) => {
    const score = scoring.points(it, answers[i]);
    assert.deepEqual([score.earned, score.max], expected[i], `${it.type} / ${it.responseMode}`);
    assert.equal(score.version, 'ngn-v1');
  });
  assert.equal(scoring.points(fixtures[1], [0, 2]).earned, 0, 'incorrect choices penalize SATA');
  assert.equal(scoring.points({ ...fixtures[3], scoring: 'zero-one' }, ['0:0', '1:0']).earned, 0);
  assert.equal(scoring.points(fixtures[4], ['0:0', '0:1']).earned, 1, 'a negative column is floored independently');
  assert.equal(scoring.points({ ...fixtures[4], scoringAxis: 'row' }, ['0:0', '1:0']).earned, 1, 'a negative row cannot erase another row');
});
test('invalid, duplicate, overfull, out-of-range and nonnumeric submissions cannot score', () => {
  const invalid = [
    [fixtures[0], [0]], [fixtures[1], [0, 0]], [fixtures[1], [9]], [fixtures[2], ['future-id']],
    [fixtures[2], ['a', 'a']], [fixtures[3], ['0:0', '0:1', '1:0']], [fixtures[3], ['0:0']],
    [fixtures[5], [0]], [fixtures[5], [0, null]], [fixtures[6], [0, 0, 0, 0, 1]],
    [fixtures[6], [0, 1, 0, 0, 0]], [fixtures[7], '1.25junk'], [fixtures[7], 'Infinity'], [fixtures[7], ''],
  ];
  invalid.forEach(([it, answer]) => assert.throws(() => scoring.points(it, answer), /response/));
});
test('only active, reviewed, versioned bank items enter the registry; invalid clinical structures fail explicitly', async () => {
  assert.equal(await registryEntry(row(study, { active: false }), review), null);
  assert.equal(await registryEntry(row(), { status: 'draft' }), null);
  assert.equal(await registryEntry(row(study, { source_key: 'legacy' }), review), null);
  const malformed = structuredClone(study); malformed.items[0].segments[0].id = 'future-id';
  await assert.rejects(registryEntry(row(malformed), review), /unavailable/);
  const key = await registryEntry(row(), review);
  assert.equal(key.item_id, `qbank:${row().id}`);
  assert.match(key.content_version, /^[a-f0-9]{64}$/);
  assert.equal(key.case_length, 3);
});
test('active payloads allowlist fields and never contain future records, answer keys or scoring metadata', async () => {
  const cp = await checkpoint();
  const payload = publicInteraction(cp), raw = JSON.stringify(payload);
  assert.doesNotMatch(raw, /NEVER SEND|future-id|PRIVATE|correct|rationale|scoringVersion|content_version/);
  assert.equal(payload.case.tabs[0].entries.length, 1);
  assert.deepEqual(Object.keys(payload.segments[0]).sort(), ['id', 't']);
  assert.equal(publicCheckpoint(cp).ngnState, undefined);
  assert.deepEqual(responseDetail(cp, 'missing', false), {});
});
test('case responses score individually, disclose sequentially, and update ability once per completed group', async () => {
  let cp = await checkpoint(), ability = 0.5;
  let result = recordCredit(cp, scoreCurrent(cp, ['a']));
  assert.equal(result.final, false);
  assert.equal(result.evidenceScore, null);
  cp.ngnState = result.state;
  assert.match(JSON.stringify(publicInteraction(cp)), /NEVER SEND/);
  assert.equal(currentInteraction(cp).sourceItemId, 'second');
  result = recordCredit(cp, scoreCurrent(cp, [0, 0]));
  cp.ngnState = result.state;
  assert.equal(result.final, false);
  result = recordCredit(cp, scoreCurrent(cp, [0, 2, 0, 0, 2]));
  assert.equal(result.final, true);
  assert.equal(result.evidenceScore, (1 + 0.5 + 0.6) / 3, 'equal question weighting, not total-point weighting');
  ability = updateNGNAbility(ability, result.evidenceScore, 2);
  assert.ok(ability > 0.5 && ability < updateAbility(0.5, true, 2));
  assert.equal(Object.keys(result.state.responses).length, 3);
  const detail = Object.values(result.state.responses)[0];
  cp.ngnState = result.state;
  assert.equal(responseDetail(cp, detail.item.id, true).interaction.rationale, detail.item.rationale);
  assert.equal(responseDetail(cp, detail.item.id, false).credit, undefined);
});
test('incomplete answers and chart-tab state resume without accepting unavailable IDs', async () => {
  const cp = await checkpoint();
  assert.deepEqual(validateDraft(cp, { answer: [], tabId: 'notes' }), { answer: [], tabId: 'notes' });
  assert.throws(() => validateDraft(cp, { answer: ['future-id'] }), /response/);
  assert.throws(() => validateDraft(cp, { answer: ['a'], tabId: 'future-tab' }), /unavailable/);
});
test('dependent responses cannot increase confidence by being counted as independent evidence', () => {
  const independent = Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, difficulty: 2 }));
  const grouped = independent.map(it => ({ ...it, evidenceGroup: 'case', evidenceComplete: true }));
  assert.ok(standardError(grouped, 0.8) > standardError(independent, 0.8));
  assert.equal(standardError(grouped, 0.8), standardError([independent[0]], 0.8));
  assert.equal(standardError(grouped.map(it => ({ ...it, evidenceComplete: false })), 0.8), Infinity);
  const categories = ['Management of Care', 'Safety & Infection Prevention', 'Health Promotion & Maintenance', 'Psychosocial Integrity', 'Basic Care & Comfort', 'Pharmacological & Parenteral Therapies', 'Reduction of Risk Potential', 'Physiological Adaptation'];
  const many = categories.flatMap(category => Array.from({ length: 20 }, () => ({ difficulty: 2, nclex_category: category, evidenceGroup: 'case', evidenceComplete: true })));
  assert.equal(shouldStopMock(many.slice(0, 84), 0.8, []), null, 'minimum item count is unchanged');
  assert.equal(shouldStopMock(many, 0.8, [], 85, 200), null, 'one group cannot produce a confident early stop');
});
test('legacy binary updates are unchanged, fractional credit has bounded effect, and case selection reserves room', async () => {
  assert.equal(updateNGNAbility(0.5, 1, 2), updateAbility(0.5, true, 2));
  assert.equal(updateNGNAbility(0.5, 0, 2), updateAbility(0.5, false, 2));
  assert.equal(updateNGNAbility(0.5, 0.5, 2), 0.5);
  assert.throws(() => updateNGNAbility(0.5, 3, 2), /Invalid/);
  const key = await registryEntry(row(), review);
  const prior = Array.from({ length: 44 }, (_, i) => ({ id: `prior-${i}` }));
  assert.equal(pickNextQuestion([key], prior, { mode: 'nclex', scoringModel: MODEL }, 0.5, [], 45), null);
  assert.equal(pickNextQuestion([key], [{ id: `${key.item_id}:first`, sourceId: key.item_id }], { mode: 'mock' }, 0.5, [], 150), null);
});
test('partial credit never creates early-stop confidence, and a case is at most one evidence unit', () => {
  const categories = ['Management of Care', 'Safety & Infection Prevention', 'Health Promotion & Maintenance', 'Psychosocial Integrity', 'Basic Care & Comfort', 'Pharmacological & Parenteral Therapies', 'Reduction of Risk Potential', 'Physiological Adaptation'];
  const fractional = categories.flatMap((category, c) => Array.from({ length: 18 }, (_, i) => ({
    id: `${c}:${i}`, sourceId: `${c}:${i}`, evidenceGroup: `${c}:${i}`, evidenceComplete: true,
    evidenceCredit: 0.8, difficulty: 2, nclex_category: category, correct: false,
  })));
  assert.equal(ngnEvidence(fractional).length, 0);
  assert.equal(shouldStopNGN(fractional, 0.95, [], 'mock'), null);
  assert.equal(shouldStopNGN(fractional, 0.05, [], 'mock'), null);
  const grouped = fractional.map(it => ({ ...it, evidenceGroup: 'single-case', evidenceCredit: 1, correct: true }));
  assert.equal(ngnEvidence(grouped).length, 1);
  assert.equal(shouldStopNGN(grouped, 0.95, [], 'mock'), null);
  grouped[0].evidenceCredit = 0;
  assert.equal(ngnEvidence(grouped).length, 0, 'mixed case credit is not independent binary evidence');
  const independent = fractional.map(it => ({ ...it, evidenceCredit: 1, correct: true }));
  assert.equal(shouldStopNGN(independent, 0.95, [], 'mock'), 'PASS');
  assert.equal(shouldStopNGN([...independent, { ...fractional[0], id: 'partial', evidenceGroup: 'partial' }], 0.95, [], 'mock'), null,
    'a partial-credit response cannot trigger a stop even after the independent-evidence minimum');
  assert.equal(shouldStopNGN([...independent, { ...fractional[0], id: 'case-a', evidenceGroup: 'mixed-case', evidenceCredit: 1 },
    { ...fractional[1], id: 'case-b', evidenceGroup: 'mixed-case', evidenceCredit: 0 }], 0.95, [], 'mock'), null,
  'finishing a mixed-credit case cannot trigger a stop');
});

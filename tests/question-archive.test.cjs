const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const html = readFileSync(new URL('../question-bank-review.html', `file://${__filename}`), 'utf8');
function harness({ error, returned, confirm = true } = {}) {
  const calls = [], alerts = [];
  const context = {
    live: [{ id: 'old', active: false }, { id: 'published', active: true }],
    mSel: new Set(['old']), alert: text => alerts.push(text), confirm: () => confirm,
    render() {}, renderManage() {}, renderFlags() {}, renderRevisionDrafts() {}, updateBankOverview() {},
    db: { from(table) { return { update(patch) { return {
      in(field, ids) { return { eq: (field, value) => ({ select: async () => {
        calls.push({ table, patch, ids: Array.from(ids), field, value });
        return error ? { error } : { data: returned || ids.map(id => ({ id, ...patch })) };
      } }) }; }
    }; } }; } }
  };
  vm.runInNewContext(html.slice(html.indexOf('let archiveBusy='), html.indexOf('const QUESTION_COLUMNS=')), context);
  return { context, calls, alerts };
}
test('archive and restore affect only archived_at on explicit inactive IDs', async () => {
  const h = harness();
  await h.context.changeQuestionArchive('archive', ['old', 'old']);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].ids, ['old']);
  assert.deepEqual(Object.keys(h.calls[0].patch), ['archived_at']);
  assert.equal(h.calls[0].field, 'active');
  assert.equal(h.calls[0].value, false);
  assert.ok(h.context.live[0].archived_at);
  assert.equal(h.context.live[1].active, true);
  await h.context.changeQuestionArchive('restore', ['old']);
  assert.equal(h.context.live[0].archived_at, null);
  assert.equal(h.context.live[0].active, false);
});
test('published questions, missing IDs and cancelled confirmation produce no writes', async () => {
  for (const [ids, options] of [[['published'], {}], [['missing'], {}], [['old'], { confirm: false }]]) {
    const h = harness(options);
    await h.context.changeQuestionArchive('archive', ids);
    assert.equal(h.calls.length, 0);
  }
});
test('database failure and concurrent activation report explicit incomplete operation', async () => {
  const failed = harness({ error: { message: 'Synthetic error' } });
  await failed.context.changeQuestionArchive('archive', ['old']);
  assert.match(failed.alerts[0], /0 questions archived.*Synthetic error/);
  assert.equal(failed.context.live[0].archived_at, undefined);
  const race = harness({ returned: [] });
  await race.context.changeQuestionArchive('archive', ['old']);
  assert.match(race.alerts[0], /Some questions changed/);
});
test('working bank, duplicate and batch queues exclude archives without removing records', () => {
  assert.match(html, /const workingQuestions=\(\)=>live\.filter\(question=>!question\.archived_at\)/);
  assert.match(html, /const indexed=workingQuestions\(\)\.map/);
  assert.match(html, /function getBulkBatches\(\)[\s\S]*?workingQuestions\(\)\.forEach/);
  assert.match(html, /f==='archived'\?!!q\.archived_at:!q\.archived_at/);
  assert.match(html, /Restore archived questions before publishing/);
  assert.match(html, /id="review-archive-history"/);
  assert.match(html, /Archived history:/);
});

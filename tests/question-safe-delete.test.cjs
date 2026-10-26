const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
const source = html.slice(html.indexOf('const DELETE_LINK_NAMES='), html.indexOf('const QUESTION_COLUMNS='));

function harness({ usage = [], deleteError, blockersError, confirms = [] } = {}) {
  const calls = [], alerts = [], prompts = [];
  const context = {
    live: [
      { id: 'unused', question_no: 1, stem: 'Unused', active: false },
      { id: 'used', question_no: 2, stem: 'Used', active: true }
    ],
    revisionDrafts: [{ id: 'd1', question_id: 'unused' }, { id: 'd2', question_id: 'used' }],
    mSel: new Set(['unused', 'used']), reviews: new Map(), session: { user: { id: 'admin' } },
    render() {}, renderManage() {},
    alert: message => alerts.push(message),
    confirm: message => { prompts.push(message); return confirms.length ? confirms.shift() : true; },
    db: {
      async rpc(name, args) {
        calls.push([name, args]);
        if (name === 'question_deletion_blockers') return blockersError ? { error: blockersError } : { data: usage };
        return deleteError ? { error: deleteError } : { data: args.p_question_ids.length };
      },
      from(table) {
        return { update(values) { return { async in(column, ids) { calls.push(['update', table, values, ids]); return {}; } }; } };
      }
    }
  };
  vm.runInNewContext(`${source};this.mApply=mApply;`, context);
  return { context, calls, alerts, prompts };
}

test('deletes unused question with drafts through the safe RPC and clears local drafts', async () => {
  const h = harness({ usage: [{ question_id: 'unused', reason: 'revision_drafts', label: 'saved correction draft (will be archived)', record_count: 1, blocks_delete: false }] });
  await h.context.mApply('delete', ['unused']);
  assert.deepEqual(h.calls.map(call => call[0]), ['question_deletion_blockers', 'delete_questions_permanently']);
  assert.match(h.prompts[0], /PERMANENTLY DELETE 1 question\?/);
  assert.match(h.prompts[0], /1 saved correction draft/);
  assert.deepEqual(h.context.live.map(q => q.id), ['used']);
  assert.deepEqual(h.context.revisionDrafts.map(d => d.id), ['d2']);
  assert.equal(h.alerts.length, 0);
});

test('protected question is not deleted; real reason shown and Make inactive offered', async () => {
  const h = harness({ usage: [{ question_id: 'used', reason: 'practice_sets', label: 'assigned practice-set entry', record_count: 1, blocks_delete: true }] });
  await h.context.mApply('delete', ['used']);
  assert.ok(!h.calls.some(call => call[0] === 'delete_questions_permanently'));
  assert.match(h.alerts[0], /#2: 1 assigned practice-set entry/);
  assert.doesNotMatch(h.alerts[0], /student.*answers/i);
  assert.match(h.prompts[0], /Make the 1 published question inactive instead\? It will be hidden from students\. 1 with student or assessment history must be kept/);
  assert.equal(JSON.stringify(h.calls.at(-1)), JSON.stringify(['update', 'questions', { active: false }, ['used']]));
  assert.equal(h.context.live.find(q => q.id === 'used').active, false);
});

test('mixed selection deletes only the unused question after confirmation', async () => {
  const h = harness({ usage: [{ question_id: 'used', reason: 'student_practice_results', label: 'student practice result', record_count: 3, blocks_delete: true }], confirms: [true, false] });
  await h.context.mApply('delete', ['unused', 'used']);
  assert.equal(JSON.stringify(h.calls.find(call => call[0] === 'delete_questions_permanently')[1]), JSON.stringify({ p_question_ids: ['unused'] }));
  assert.match(h.alerts[0], /3 student practice result\(s\)/);
  assert.match(h.alerts[0], /other 1 question can still be deleted/);
  assert.deepEqual(h.context.live.map(q => q.id), ['used']);
  assert.ok(!h.calls.some(call => call[0] === 'update'));
});

test('cancelling the confirmation deletes nothing', async () => {
  const h = harness({ confirms: [false] });
  await h.context.mApply('delete', ['unused']);
  assert.deepEqual(h.calls.map(call => call[0]), ['question_deletion_blockers']);
  assert.equal(h.context.live.length, 2);
});

test('explains missing database update instead of implying student answers', async () => {
  const h = harness({ blockersError: { message: 'Could not find the function public.question_deletion_blockers(p_question_ids) in the schema cache' } });
  await h.context.mApply('delete', ['unused']);
  assert.match(h.alerts[0], /safe-delete database update/);
  assert.doesNotMatch(h.alerts[0], /students already have answers/);
});

test('raw foreign-key errors name the linked records', async () => {
  const h = harness({ deleteError: { code: '23503', message: 'update or delete on table "questions" violates foreign key constraint "question_revision_drafts_question_id_fkey" on table "question_revision_drafts"' } });
  await h.context.mApply('delete', ['unused']);
  assert.match(h.alerts[0], /Nothing was deleted\. The question is still linked to saved correction drafts/);
  assert.equal(h.context.live.length, 2);
});

test('active-only question: told to make it inactive first, then Delete again', async () => {
  const h = harness({ usage: [{ question_id: 'used', reason: 'active_question', label: 'still active (visible to students); make it inactive first', record_count: 1, blocks_delete: true }] });
  await h.context.mApply('delete', ['used']);
  assert.ok(!h.calls.some(call => call[0] === 'delete_questions_permanently'));
  assert.match(h.alerts[0], /#2: still active \(visible to students\); make it inactive first$/m);
  assert.doesNotMatch(h.alerts[0], /1 still active/);
  assert.match(h.prompts[0], /It has no student or assessment history, so you can permanently delete it afterwards by choosing Delete again/);
  assert.equal(JSON.stringify(h.calls.at(-1)), JSON.stringify(['update', 'questions', { active: false }, ['used']]));
});

test('active question with history: Make inactive offered, not a later delete', async () => {
  const h = harness({ usage: [
    { question_id: 'used', reason: 'active_question', label: 'still active (visible to students); make it inactive first', record_count: 1, blocks_delete: true },
    { question_id: 'used', reason: 'assessment_attempts', label: 'saved, paused, or completed assessment attempt', record_count: 1, blocks_delete: true }
  ] });
  await h.context.mApply('delete', ['used']);
  assert.match(h.alerts[0], /#2: still active .*; 1 saved, paused, or completed assessment attempt/);
  assert.match(h.prompts[0], /1 with student or assessment history must be kept/);
  assert.doesNotMatch(h.prompts[0], /Delete again/);
});

test('busy database: friendly retry message, nothing removed locally', async () => {
  const h = harness({ deleteError: { code: '55P03', message: 'Nothing was deleted because students are saving work right now. Please try again in a minute.' } });
  await h.context.mApply('delete', ['unused']);
  assert.equal(h.alerts[0], 'Nothing was deleted because students are saving work right now. Please try again in a minute.');
  assert.equal(h.context.live.length, 2);
  const t = harness({ deleteError: { code: '55P03', message: 'canceling statement due to lock timeout' } });
  await t.context.mApply('delete', ['unused']);
  assert.match(t.alerts[0], /busy .* try again in a minute/);
});

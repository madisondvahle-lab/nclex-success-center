const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
const editor = html.slice(html.indexOf('async function openCorrectionEditor('), html.indexOf('function loadDiagBank('));
const question = { id: 'question', question_no: 1, stem: 'Original text', rationale: 'Original rationale', item_type: 'mcq', option_a: 'Original A', difficulty: 'hard' };
const draft = {
  id: 'revision', question_id: question.id, status: 'approved', proposed_at: '2026-10-15T00:00:00Z',
  base_content: { stem: 'Original text' }, change_summary: 'Saved reason',
  proposed_content: {
    stem: 'Saved text', rationale: 'Saved rationale', difficulty: 'medium', item_type: 'mcq',
    option_a: 'Saved A', option_b: 'Saved B', option_c: 'Saved C', option_d: 'Saved D', correct_answer: 'd',
    topic: 'Saved topic', nclex_category: 'Saved category', clinical_judgment_skill: 'Saved skill',
    option_rationales: { a: 'Saved explanation' }, reference_list: [{ title: 'Test reference', url: 'https://example.test' }]
  }
};

function harness(existing = draft, failure) {
  const fields = new Map(), alerts = [], calls = [], save = {}, intro = {};
  let values, closed = false, saving;
  const decode = value => value.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
  const form = {
    querySelector(selector) {
      if (selector === '.intro') return intro;
      if (selector === '.buttons') return { before() {} };
      if (selector.includes('submit')) return save;
      if (selector.includes('e-ans')) return { value: values.correct_answer || 'a' };
    },
    querySelectorAll(selector) {
      if (selector === '.e-sata') return values.item_data.options.map((_, i) => ({ checked: values.item_data.correct.includes(i) }));
      if (selector === '.e-sopt') return values.item_data.options.map(value => ({ value }));
      return [];
    }
  };
  const context = {
    revisionWorkflowReady: true, revisionDrafts: existing ? [structuredClone(existing)] : [],
    session: { user: { id: 'admin' } }, alert: message => alerts.push(message),
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    $: id => id === 'ed-form' ? form : id === 'ed' ? { classList: { add() { closed = true; } } } : fields.get(id),
    openEdit(id, editable) {
      assert.equal(id, question.id);
      values = editable;
      for (const [id, key] of [['e-stem', 'stem'], ['e-rat', 'rationale'], ['e-topic', 'topic'], ['e-cat', 'nclex_category'], ['e-dif', 'difficulty'], ...'abcd'.split('').map(l => [`e-${l}`, `option_${l}`])]) {
        fields.set(id, { value: editable[key] || '' });
      }
    },
    document: { createElement: () => ({
      set innerHTML(markup) {
        for (const match of markup.matchAll(/<textarea id="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields.set(match[1], { value: decode(match[2]) });
        for (const match of markup.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g)) fields.set(match[1], { value: decode(match[2]) });
      }
    }) },
    renderRevisionDrafts() {}, render() {},
    db: {
      from(table) {
        assert.equal(table, 'question_revision_drafts', 'must never write the questions table');
        return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: existing, error: failure?.load }) }) }) }),
          insert(record) {
            calls.push({ insert: record });
            return { select: () => ({ single: async () => ({ data: { ...record, id: 'new-revision' }, error: failure?.save }) }) };
          }
        };
      },
      async rpc(name, args) {
        calls.push({ name, args });
        if (saving) await saving;
        return { data: { ...existing, proposed_content: args.p_proposed_content, status: 'pending_review' }, error: failure?.save };
      }
    }
  };
  vm.runInNewContext(editor, context);
  return { context, fields, alerts, calls, save, intro, get values() { return values; }, get closed() { return closed; }, hold(promise) { saving = promise; } };
}

test('reopening uses saved proposed fields and metadata, not original bank values', async () => {
  const h = harness();
  await h.context.openCorrectionEditor(question);
  assert.equal(h.values.stem, 'Saved text');
  assert.equal(h.values.option_a, 'Saved A');
  assert.equal(h.values.difficulty, 'medium');
  assert.equal(h.fields.get('e-summary').value, 'Saved reason');
  assert.equal(h.fields.get('e-cj').value, 'Saved skill');
  assert.deepEqual(JSON.parse(h.fields.get('e-option-rationales').value), draft.proposed_content.option_rationales);
  assert.deepEqual(JSON.parse(h.fields.get('e-reference-list').value), draft.proposed_content.reference_list);
  assert.match(h.intro.textContent, /fresh approval/);
});

test('saving updates the same draft with concurrency guards and leaves the original unchanged', async () => {
  const original = JSON.stringify(question), h = harness();
  await h.context.openCorrectionEditor(question);
  h.fields.get('e-stem').value = 'Edited draft';
  await h.context.$('ed-form').onsubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
  const { name, args } = h.calls[0];
  assert.equal(name, 'update_question_revision_draft');
  assert.equal(args.p_revision_id, draft.id);
  assert.equal(args.p_expected_proposed_at, draft.proposed_at);
  assert.equal(args.p_expected_status, 'approved');
  assert.equal(args.p_proposed_content.stem, 'Edited draft');
  assert.equal(h.context.revisionDrafts.length, 1);
  assert.equal(h.context.revisionDrafts[0].status, 'pending_review');
  assert.equal(JSON.stringify(question), original);
  assert.equal(h.closed, true);
});

test('a new correction is still inserted with the original content snapshot', async () => {
  const h = harness(null);
  await h.context.openCorrectionEditor(question);
  h.fields.get('e-summary').value = 'New correction';
  await h.context.$('ed-form').onsubmit({ preventDefault() {} });
  assert.equal(h.calls[0].insert.base_content.stem, question.stem);
  assert.equal(h.calls[0].insert.status, 'pending_review');
});

test('SATA proposed options and keys survive reopening and saving', async () => {
  const sata = structuredClone(draft);
  sata.proposed_content.item_type = 'sata';
  sata.proposed_content.item_data = { options: ['Saved first', 'Saved second'], correct: [1] };
  const h = harness(sata);
  await h.context.openCorrectionEditor({ ...question, item_type: 'sata' });
  await h.context.$('ed-form').onsubmit({ preventDefault() {} });
  const data = h.calls[0].args.p_proposed_content.item_data;
  assert.equal(data.options.join(','), 'Saved first,Saved second');
  assert.equal(data.correct.join(','), '1');
});

test('load failures do not open an original-value editor; save failures retain form edits', async () => {
  const load = harness(draft, { load: { message: 'Unavailable' } });
  await load.context.openCorrectionEditor(question);
  assert.equal(load.values, undefined);
  assert.match(load.alerts[0], /Could not load/);
  for (const error of [{ message: 'Draft changed' }, { code: '23505', message: 'Duplicate' }]) {
    const h = harness(draft, { save: error });
    await h.context.openCorrectionEditor(question);
    h.fields.get('e-stem').value = 'Unsaved text';
    await h.context.$('ed-form').onsubmit({ preventDefault() {} });
    assert.equal(h.closed, false);
    assert.equal(h.fields.get('e-stem').value, 'Unsaved text');
    assert.equal(h.save.disabled, false);
    assert.match(h.alerts[0], /Your edits remain/);
  }
});

test('double submits do not send a second write', async () => {
  const h = harness();
  let release;
  h.hold(new Promise(resolve => { release = resolve; }));
  await h.context.openCorrectionEditor(question);
  const pending = h.context.$('ed-form').onsubmit({ preventDefault() {} });
  await h.context.$('ed-form').onsubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
  release();
  await pending;
});

test('question bank inline JavaScript parses', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('category dropdown uses shared names and preserves blank, standard, and nonstandard saved values', () => {
  const context = {
    window: {},
    document: { createElement: tag => ({ tag }) },
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'category-names.js'), 'utf8'), context);
  context.NCLEXCats = context.window.NCLEXCats;
  vm.runInNewContext(html.slice(html.indexOf('function categorySelect('), html.indexOf('function openEdit(')), context);
  for (const current of ['', ...context.NCLEXCats.NAMES, 'Legacy & "custom" <category>']) {
    const select = context.categorySelect(current);
    assert.equal(select.tag, 'select');
    assert.equal(select.id, 'e-cat');
    for (const name of context.NCLEXCats.NAMES) assert.ok(select.innerHTML.includes(`value="${name}"`));
    assert.equal((select.innerHTML.match(/ selected/g) || []).length, 1);
    assert.ok(select.innerHTML.includes(`value="${context.esc(current)}" selected`));
    assert.equal((select.innerHTML.match(/<option /g) || []).length, current && !context.NCLEXCats.NAMES.includes(current) ? 10 : 9);
  }
  assert.match(html, /<script src="category-names\.js"><\/script>/);
  assert.match(html, /\$\('e-cat'\)\.replaceWith\(categorySelect\(q\.nclex_category\|\|''\)\)/);
});

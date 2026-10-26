const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
const openEdit = html.slice(html.indexOf('function openEdit('), html.indexOf('function needsRevisionApproval('));
const plain = value => JSON.parse(JSON.stringify(value));
const walk = root => [root, ...root.children.flatMap(walk)];

function harness(question) {
  const ids = new Map(), writes = [], alerts = [];
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.events = {};
      this.classList = { add() {}, remove() {} };
    }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(name, handler) { this.events[name] = handler; }
    before(child) { form.appendChild(child); }
    after(child) { form.appendChild(child); }
    querySelector(selector) {
      if (selector === ':scope > .buttons') return buttons;
      if (selector.includes('submit')) return save;
      if (selector === '.intro') return intro;
      if (selector.includes('e-ans')) return walk(form).find(el => el.name === 'e-ans' && el.checked);
    }
    set innerHTML(markup) {
      const removed = new Set(this.children.flatMap(walk));
      for (const [id, element] of ids) if (removed.has(element)) ids.delete(id);
      this.children = [];
      for (const match of markup.matchAll(/<(textarea|input|div)[^>]*id="([^"]+)"[^>]*>/g)) {
        const el = new Element(match[1]);
        const contents = markup.slice(match.index + match[0].length);
        el.value = match[1] === 'textarea' ? contents.slice(0, contents.indexOf('</textarea>')) : (match[0].match(/value="([^"]*)"/)?.[1] || '');
        ids.set(match[2], el);
        this.children.push(el);
      }
      for (const match of markup.matchAll(/<input type="radio" name="e-ans" value="([^"]*)"([^>]*)>/g)) {
        const radio = new Element('input');
        Object.assign(radio, { type: 'radio', name: 'e-ans', value: match[1], checked: /\bchecked\b/.test(match[2]) });
        this.children.push(radio);
      }
      ids.set('e-dif', { value: question.difficulty || 'medium' });
      ids.set('e-cancel', new Element('button'));
    }
  }
  const form = new Element('form'), buttons = new Element('div');
  const save = new Element('button'), intro = new Element('p');
  ids.set('ed-form', form);
  ids.set('ed', new Element('div'));
  const context = {
    window: {}, crypto: { randomUUID },
    document: {
      createElement: tag => new Element(tag),
      querySelector: selector => form.querySelector(selector)
    },
    live: [question], catApprovals: new Map(), $: id => ids.get(id), qlabel: () => 'Synthetic',
    esc: value => String(value ?? ''), alert: message => alerts.push(message),
    render() {}, renderManage() {},
    db: { from: table => {
      assert.equal(table, 'questions');
      return { update: row => ({ eq: async (_, id) => { writes.push({ id, row: plain(row) }); return {}; } }) };
    } }
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'ngn-author-ngn.js'), 'utf8'), context);
  context.NGNAuthor = context.window.NGNAuthor;
  vm.runInNewContext(openEdit, context);
  context.openEdit(question.id);
  return { context, ids, form, save, writes, alerts, nodes: () => walk(form) };
}

const sata = () => ({
  id: 'synthetic-existing-sata', item_type: 'sata', is_ngn: true,
  stem: 'Synthetic stem', rationale: 'Synthetic overall rationale',
  item_data: { options: ['First', 'Second', 'Third', 'Fourth', 'Fifth'], correct: [0, 2, 4] },
  option_rationales: { 0: 'First explanation', 1: 'Second explanation' }
});

function validQuestion(type) {
  const context = { window: {}, crypto: { randomUUID } };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'ngn-author-ngn.js'), 'utf8'), context);
  const item = plain(context.window.NGNAuthor.blank(type));
  Object.assign(item, { stem: 'Synthetic stem', rationale: 'Synthetic overall rationale', tabs: [] });
  if (type === 'mcq' || type === 'sata') Object.assign(item, { options: ['First', 'Second', 'Third', 'Fourth'], correct: type === 'mcq' ? [3] : [0, 2] });
  if (type === 'matrix') Object.assign(item, { rows: ['Row 1', 'Row 2'], cols: ['Column 1', 'Column 2'], correct: ['0:1', '1:0'], responseMode: 'single', scoringAxis: 'row' });
  if (type === 'cloze') Object.assign(item, { template: 'Choose {{0}}.', dropdowns: [{ options: ['First', 'Second'], correct: 1 }] });
  if (type === 'highlight') item.segments = [{ id: 'finding', t: 'Finding', correct: true, rationale: 'Finding explanation' }];
  if (type === 'bowtie') item.bowtie = { actions: ['Action 1', 'Action 2'], conditions: ['Condition'], complications: ['Parameter 1', 'Parameter 2'] };
  if (type === 'fill') Object.assign(item, { correct: 3.5, tolerance: 0.5, unit: 'mL' });
  if (type === 'case') Object.assign(item, { title: item.stem, scenario: 'Synthetic scenario', items: ['mcq', 'sata', 'highlight'].map(t => validQuestion(t).item_data) });
  return {
    ...sata(), item_type: type, item_data: item,
    option_a: 'First', option_b: 'Second', option_c: 'Third', option_d: 'Fourth', correct_answer: 'd',
    reference_list: [{ title: 'Synthetic reference', url: 'https://example.test/reference' }]
  };
}

test('standard MCQ exposes its single answer, optional clinical records and rationales without NGN scoring controls', async () => {
  const question = validQuestion('mcq'), h = harness(question);
  assert.ok(h.form.ngnAuthor);
  assert.ok(h.form.ngnMetadata);
  assert.equal(h.nodes().filter(el => el.type === 'radio').length, 4);
  assert.equal(h.form.querySelector('[name="e-ans"]:checked').value, 'd');
  assert.ok(h.nodes().some(el => /Clinical record/.test(el.textContent || '')));
  assert.ok(!h.nodes().some(el => /Scoring version|Scoring rule/.test(el.textContent || '')));
  const rationale = h.nodes().find(el => el.value === 'First explanation');
  rationale.value = 'Edited MCQ explanation'; rationale.events.input();
  h.ids.get('e-b').value = 'Edited second option';
  await h.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(h.alerts, []);
  assert.equal(h.writes[0].row.correct_answer, 'd');
  assert.equal(h.writes[0].row.item_data.options[1], 'Edited second option');
  assert.equal(h.writes[0].row.option_rationales[0], 'Edited MCQ explanation');
  assert.equal(question.item_type, 'mcq');
});

test('all supported interactions preserve saved keys, scoring, rationales, IDs and references on roundtrip', async () => {
  for (const type of ['mcq', 'sata', 'matrix', 'cloze', 'highlight', 'bowtie', 'fill', 'case']) {
    const question = validQuestion(type);
    const before = plain(question), h = harness(question);
    assert.equal(h.writes.length, 0, type);
    assert.equal(h.save.disabled, undefined, type);
    assert.deepEqual(plain(h.form.ngnMetadata.read().option_rationales), before.option_rationales, type);
    if (h.form.ngnAuthor) assert.deepEqual(plain(h.form.ngnAuthor.read()), before.item_data, type);
    await h.form.onsubmit({ preventDefault() {} });
    assert.deepEqual(h.alerts, [], type);
    assert.deepEqual(h.writes[0].row.item_data, before.item_data, type);
    assert.deepEqual(h.writes[0].row.option_rationales, before.option_rationales, type);
    assert.deepEqual(h.writes[0].row.reference_list, before.reference_list, type);
    assert.equal(question.item_type, type);
    assert.equal(question.id, before.id);
    assert.equal(question.correct_answer, before.correct_answer);
  }
});

test('MCQ can author and retain clinical tabs without creating a case or changing its key', async () => {
  const question = validQuestion('mcq');
  question.item_data.tabs = ['Nurses Notes', 'Vital Signs', 'Laboratory Results', 'Medication Administration Record'].map((label, i) => ({
    id: 'tab-' + i, label, columns: ['Finding'], entries: [{ at: '2026-10-26T08:00', cells: [{ t: 'Synthetic finding' }] }]
  }));
  const before = plain(question), h = harness(question);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(plain(h.form.ngnAuthor.read().tabs), before.item_data.tabs);
  await h.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(h.alerts, []);
  assert.deepEqual(h.writes[0].row.item_data.tabs, before.item_data.tabs);
  assert.equal(h.writes[0].row.item_data.kind, undefined);
  assert.equal(h.writes[0].row.correct_answer, 'd');
});

test('existing SATA uses the bank type and stable ID when nested metadata is absent', async () => {
  const question = sata(), before = JSON.stringify(question), h = harness(question);
  assert.equal(h.writes.length, 0, 'opening must not save anything');
  assert.equal(JSON.stringify(question), before);
  assert.ok(h.form.ngnAuthor, 'answer editor mounted');
  assert.equal(h.form.ngnAuthor.read().type, 'sata');
  assert.equal(h.form.ngnAuthor.read().id, question.id);
  assert.equal(h.nodes().filter(el => el.textContent === 'Text').length, 5);
  assert.equal(h.nodes().filter(el => el.type === 'checkbox').length, 5);
  assert.ok(h.nodes().some(el => /Clinical record/.test(el.textContent || '')));
  assert.ok(!h.nodes().some(el => /Scoring version|Scoring rule/.test(el.textContent || '')));
  const choice = h.nodes().find(el => el.value === 'Second');
  choice.value = 'Edited second'; choice.events.input();
  const checks = h.nodes().filter(el => el.type === 'checkbox');
  checks[1].checked = true; checks[1].events.change();
  checks[2].checked = false; checks[2].events.change();
  h.ids.get('e-stem').value = 'Edited stem';
  h.ids.get('e-rat').value = 'Edited overall rationale';
  const rationale = h.nodes().find(el => el.value === 'Second explanation');
  rationale.value = 'Edited explanation'; rationale.events.input();
  assert.equal(JSON.stringify(question), before, 'typing only edits the local form');
  await h.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(h.alerts, []);
  assert.equal(h.writes.length, 1);
  const saved = h.writes[0].row;
  assert.equal(saved.stem, 'Edited stem');
  assert.equal(saved.rationale, 'Edited overall rationale');
  assert.equal(saved.item_data.options[1], 'Edited second');
  assert.deepEqual(saved.item_data.correct, [0, 4, 1]);
  assert.equal(saved.option_rationales[1], 'Edited explanation');
});

test('conflicting interaction classification blocks saving rather than silently converting it', () => {
  const question = sata();
  question.item_data.type = 'matrix';
  const h = harness(question);
  assert.equal(h.save.disabled, true);
  assert.match(h.ids.get('e-ngn').textContent, /conflicts/);
  assert.equal(h.writes.length, 0);
});

test('existing SATA correction drafts use the real answer and rationale controls without touching the bank', async () => {
  const question = sata(), before = JSON.stringify(question), h = harness(question);
  const draft = {
    id: 'synthetic-revision', status: 'approved', proposed_at: '2026-10-25T00:00:00Z',
    change_summary: 'Synthetic correction', question_id: question.id,
    proposed_content: { ...plain(question), stem: 'Saved draft stem' }
  };
  Object.assign(h.context, {
    revisionWorkflowReady: true, revisionDrafts: [draft],
    renderRevisionDrafts() {},
    db: {
      from(table) {
        assert.equal(table, 'question_revision_drafts', 'must never write to the question bank');
        return { select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: draft }) }) }) }) };
      },
      async rpc(name, args) {
        assert.equal(name, 'update_question_revision_draft');
        h.writes.push(plain(args));
        return { data: { ...draft, proposed_content: args.p_proposed_content, status: 'pending_review' } };
      }
    }
  });
  const correction = html.slice(html.indexOf('async function openCorrectionEditor('), html.indexOf('function loadDiagBank('));
  vm.runInNewContext(correction, h.context);
  await h.context.openCorrectionEditor(question);
  assert.equal(h.ids.get('e-stem').value, 'Saved draft stem');
  assert.ok(!h.ids.has('e-item-data'));
  assert.ok(!h.ids.has('e-option-rationales'));
  assert.equal(h.nodes().filter(el => el.textContent === 'Clinical judgment skill').length, 1);
  const choice = h.nodes().find(el => el.value === 'Third');
  choice.value = 'Draft third'; choice.events.input();
  const rationale = h.nodes().find(el => el.value === 'First explanation');
  rationale.value = 'Draft explanation'; rationale.events.input();
  await h.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(h.alerts, []);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].p_proposed_content.item_data.options[2], 'Draft third');
  assert.equal(h.writes[0].p_proposed_content.option_rationales[0], 'Draft explanation');
  assert.equal(JSON.stringify(question), before);
});

test('NGN interactions retain their relevant controls without SATA answer fields', () => {
  for (const type of ['matrix', 'cloze', 'highlight', 'bowtie', 'fill', 'case']) {
    const context = { window: {}, crypto: { randomUUID } };
    vm.runInNewContext(readFileSync(join(__dirname, '..', 'ngn-author-ngn.js'), 'utf8'), context);
    const question = { ...sata(), item_type: type, item_data: plain(context.window.NGNAuthor.blank(type)) };
    const before = JSON.stringify(question), h = harness(question);
    assert.ok(h.form.ngnAuthor, type);
    assert.ok(h.nodes().some(el => el.textContent === 'Clinical record tab'), type);
    if (type !== 'case') assert.ok(!h.nodes().some(el => el.textContent === 'Answer option'), type);
    assert.equal(JSON.stringify(question), before);
    assert.equal(h.writes.length, 0);
  }
});

test('SATA with an existing chart or versioned NGN scoring retains those controls and data', () => {
  for (const extra of [
    { tabs: [{ id: 'notes', label: 'Notes', html: '<p>Existing chart</p>' }] },
    { scoringVersion: 'ngn-v1' }
  ]) {
    const question = sata();
    Object.assign(question.item_data, extra);
    const h = harness(question);
    assert.ok(h.nodes().some(el => el.textContent === 'Clinical record tab'));
    assert.ok(h.nodes().some(el => el.textContent === 'Answer option'));
    const saved = plain(h.form.ngnAuthor.read());
    for (const [key, value] of Object.entries(extra)) assert.deepEqual(saved[key], value);
    assert.equal(h.writes.length, 0);
  }
});

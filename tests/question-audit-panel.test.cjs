const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const test = require('node:test');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'question-audit-panel.js'), 'utf8');

async function harness(invoke, { count = 10, reloadError = false } = {}) {
  const elements = new Map();
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.html = ''; this.events = {}; this.disabled = false; }
    set innerHTML(html) {
      this.html = html;
      for (const match of html.matchAll(/id="([^"]+)"([^>]*)/g)) {
        const el = get(match[1]);
        el.value = /value="([^"]*)"/.exec(match[2])?.[1] || '';
      }
    }
    get innerHTML() { return this.html; }
    appendChild() {}
    scrollIntoView() {}
    addEventListener(name, fn) { this.events[name] = fn; }
    querySelectorAll(selector) {
      const attr = selector.slice(1, -1);
      const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return [...this.html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map(match => {
        const el = new Element();
        el.dataset = { [key]: match[1] };
        el.checked = true;
        return el;
      });
    }
  }
  function get(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); }
  const core = await import(pathToFileURL(join(root, 'supabase/functions/shared/question-audit-core.mjs')));
  const sandbox = {
    document: { head: new Element(), createElement: () => new Element(), getElementById: get },
    Response, __core: core,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source.replace('import(CORE_URL)', 'Promise.resolve(__core)'), sandbox);
  const live = Array.from({ length: count }, (_, i) => ({
    id: `q${i}`, question_no: i + 1, item_type: 'mcq', active: true,
    stem: 'Example item', option_a: 'First', option_b: 'Second', option_c: 'Third', option_d: 'Fourth',
    correct_answer: 'a', rationale: 'Explanation', difficulty: 'easy',
  }));
  const calls = [];
  let reloading = false;
  await sandbox.QAAudit.init({
    esc: value => String(value ?? ''), qlabel: q => q.id,
    getFlags: () => live.map(q => ({ question_id: q.id, status: 'open' })), getDrafts: () => [], getLive: () => live,
    reloadDrafts: async () => {}, rerender() {},
    db: {
      from: () => ({ select: () => ({ order: () => ({ range: async () => ({
        data: [], error: reloading && reloadError ? { message: 'Database unavailable' } : null,
      }) }) }) }),
      functions: { invoke: async (_, options) => { calls.push(options.body); reloading = true; return invoke(options.body, calls.length); } },
    },
  });
  get('qa-source').value = 'flagged_risk';
  get('qa-size').value = String(count);
  get('qa-cap').value = '2';
  await get('qa-build').events.click();
  return { get, calls, api: sandbox.QAAudit, run: () => get('qa-run').events.click() };
}

test('billing failure stops ten selected questions after one request and keeps failures retryable', async () => {
  const h = await harness(async () => ({
    error: { message: 'Non-2xx response', context: new Response(JSON.stringify({
      status: 'error', audit: { note: 'OpenAI API credits are exhausted.' }, cost_usd: 0,
    }), { status: 503 }) },
  }));
  await h.run();
  assert.equal(h.calls.length, 1);
  assert.match(h.get('qa-progress').textContent, /credits are exhausted/);
  assert.match(h.get('qa-progress').textContent, /0 completed, 1 failed, 0 skipped; 10 remaining/);
  assert.equal(h.get('qa-run').disabled, false);
  assert.match(h.get('qa-batch-list').innerHTML, /Not completed/);
});

test('a failed item can succeed on resume without duplicated batch entries or automatic retry', async () => {
  const h = await harness(async (_, n) => n === 1
    ? { data: { status: 'error', audit: { note: 'Temporary failure' }, cost_usd: 0.01 } }
    : { data: { status: 'pass', cost_usd: 0.01 } }, { count: 1 });
  await h.run();
  assert.equal(h.calls.length, 1);
  await h.run();
  assert.equal(h.calls.length, 2);
  assert.match(h.get('qa-progress').textContent, /1 completed, 0 failed, 0 skipped; 0 remaining/);
  assert.equal((h.get('qa-batch-list').innerHTML.match(/data-qa-pick=/g) || []).length, 1);
  assert.equal(h.get('qa-run').disabled, true);
});

test('network and expired-session failures stop immediately', async () => {
  for (const response of [
    { error: { message: 'Network request failed' } },
    { error: { message: 'Non-2xx', context: new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 }) } },
  ]) {
    const h = await harness(async () => response);
    await h.run();
    assert.equal(h.calls.length, 1);
    assert.match(h.get('qa-progress').textContent, /0 completed, 1 failed/);
  }
});

test('the $2 cap cannot be raised and no request starts once it is exhausted', async () => {
  const h = await harness(async body => ({ data: { status: 'pass', cost_usd: body.max_cost_usd } }));
  h.get('qa-cap').value = '5';
  await h.run();
  assert.equal(h.calls.length, 8);
  assert.equal(h.calls.reduce((sum, call) => sum + call.max_cost_usd, 0), 2);
  assert.match(h.get('qa-progress').textContent, /Spending cap of \$2.00 reached/);
  assert.match(h.get('qa-progress').textContent, /8 completed, 0 failed, 0 skipped; 2 remaining/);
});

test('remaining budget, including failed-request cost, limits the next request', async () => {
  const h = await harness(async (_, n) => n === 1
    ? { error: { context: new Response(JSON.stringify({ status: 'error', cost_usd: 0.19, audit: { note: 'Retry later' } }), { status: 503 }) } }
    : { data: { status: 'pass', cost_usd: 0.01 } }, { count: 1 });
  h.get('qa-cap').value = '0.2';
  await h.run();
  await h.run();
  assert.ok(h.calls[1].max_cost_usd <= 0.010001);
});

test('completed and skipped counts stay distinct and refresh errors remain visible', async () => {
  const h = await harness(async (_, n) => ({ data: { status: ['pass', 'cached', 'skipped'][n - 1], cost_usd: 0 } }), { count: 3, reloadError: true });
  await h.run();
  assert.match(h.get('qa-progress').textContent, /1 completed, 0 failed, 2 skipped; 0 remaining/);
  assert.match(h.get('qa-progress').textContent, /Could not reload audit results: Database unavailable/);
});

test('building a batch during a pending request cannot mutate the running batch', async () => {
  let resolve;
  const h = await harness(() => new Promise(done => { resolve = done; }), { count: 1 });
  const run = h.run();
  assert.equal(h.get('qa-build').disabled, true);
  await h.get('qa-build').events.click();
  resolve({ data: { status: 'pass', cost_usd: 0 } });
  await run;
  assert.equal(h.calls.length, 1);
  assert.equal(h.get('qa-run').disabled, true);
  assert.equal(h.get('qa-build').disabled, false);
});

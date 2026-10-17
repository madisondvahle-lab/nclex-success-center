const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'core1-module.js'), 'utf8');
const migration = readFileSync(join(__dirname, '..', 'supabase-core1-private-lessons.sql'), 'utf8');
const keys = ['priority-frameworks', 'delegation', 'blood-administration', 'infection-prevention'];

function fixture() {
  return {
    version: 1,
    moduleKey: 'core-safety-priority',
    intro: 'Synthetic introduction.',
    lessons: keys.map((key, index) => ({
      key, nav: `Topic ${index}`, title: `Title ${index}`, lead: 'Synthetic lead.',
      body: ['Synthetic lesson.'], recognize: 'Synthetic cue.', action: 'Synthetic action.',
      trap: 'Synthetic trap.', review: `Review ${index}`,
      diagram: {
        type: ['flow', 'decision', 'response', 'layers', 'checkpoint'][index],
        title: 'Synthetic diagram.', caption: 'Synthetic caption.',
        items: Array.from({ length: [3, 2, 4, 2, 1][index] }, () => ({ title: 'Synthetic step.', text: 'Synthetic explanation.' }))
      }
    }))
  };
}

class Node {
  constructor(tag, text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
    this.events = {};
    this.className = '';
    this.attributes = {};
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.append(...nodes); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; } }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.events[event] = callback; }
  get isConnected() { return !!this.parent || this.tagName === 'main'; }
  scrollIntoView() { this.scrolled = true; }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const matches = node => selector.startsWith('#') ? node.id === selector.slice(1) :
      selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector;
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
}

function setup(options = {}) {
  const root = new Node('main');
  const calls = [];
  const errors = [];
  const events = {};
  let authChange;
  let redirect;
  let reloads = 0;
  const db = {
    auth: {
      onAuthStateChange(callback) { authChange = callback; return { data: { subscription: { unsubscribe() { calls.push('unsubscribe'); } } } }; },
      async getSession() {
        calls.push('session');
        return { data: { session: options.signedOut ? null : { user: { id: 'test-user' } } }, error: options.sessionError };
      },
      async getUser() {
        calls.push('user');
        return { data: { user: { id: 'test-user' } }, error: options.userError };
      }
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'module-lessons');
        return { async download(path) {
          calls.push('download');
          assert.equal(path, 'core-safety-priority.json');
          if (options.download) return options.download();
          return { data: { size: 100, text: async () => JSON.stringify(options.content || fixture()) }, error: options.fileError };
        } };
      }
    }
  };
  const window = {
    supabase: options.missingSdk ? null : { createClient: () => db },
    location: { hash: options.hash || '', replace: value => { redirect = value; }, reload: () => { reloads++; } },
    addEventListener: (event, callback) => { events[event] = callback; }
  };
  vm.runInNewContext(source, {
    window,
    document: {
      body: { classList: { add() {} } },
      createElement: tag => new Node(tag),
      createTextNode: text => new Node('#text', text),
      getElementById: id => root.querySelector(`#${id}`)
    },
    console: { error: (...args) => errors.push(args) }
  });
  return {
    root, calls, errors, events, api: window.Core1Module,
    signOut: () => authChange('SIGNED_OUT'),
    get redirect() { return redirect; }, get reloads() { return reloads; }
  };
}

test('signed-out visitors redirect before a protected file is requested', async () => {
  const env = setup({ signedOut: true });
  await env.api.mount(env.root);
  assert.equal(env.redirect, 'student-login.html');
  assert.deepEqual(env.calls, ['session']);
  assert.equal(env.root.querySelector('.core1-content'), null);
});

test('verified users receive four lessons and the existing practice destination', async () => {
  const content = fixture();
  content.lessons[3].precautions = [{ name: 'Synthetic category', protection: 'Synthetic protection', examples: 'Synthetic example' }];
  content.lessons[3].mnemonic = { title: 'Synthetic memory aid', entries: [{ letter: 'A', text: 'Synthetic entry' }], caution: 'Synthetic exception' };
  content.lessons[3].mnemonics = [{ title: 'Second synthetic aid', entries: [
    { letter: 'X', text: 'First synthetic entry' },
    { letter: 'Y', text: 'Second synthetic entry' },
    { letter: 'Z', text: 'Third synthetic entry' }
  ], caution: 'Second synthetic exception' }];
  content.lessons[0].example = { prompt: 'Synthetic question?', reasoning: 'Synthetic reasoning.' };
  const env = setup({ content, hash: '#delegation' });
  await env.api.mount(env.root);
  assert.deepEqual(env.calls, ['session', 'user', 'download']);
  assert.equal(env.root.querySelectorAll('.lesson').length, 5);
  assert.equal(env.root.querySelector('#procedure-safety'), null);
  assert.equal(env.root.querySelector('#infection-prevention').querySelectorAll('a').at(-1).href, '#knowledge-check');
  assert.ok(env.root.querySelector('#delegation').scrolled);
  assert.equal(env.root.querySelector('table').querySelectorAll('tbody').length, 1);
  const mnemonics = env.root.querySelectorAll('.mnemonic');
  assert.equal(mnemonics.length, 2);
  assert.equal(mnemonics[0].querySelector('summary').textContent, 'Second synthetic aid');
  assert.equal(mnemonics[0].querySelectorAll('.mnemonic-letter').length, 3);
  assert.equal(mnemonics[1].querySelector('summary').textContent, 'Synthetic memory aid');
  const practiceLink = env.root.querySelector('#knowledge-check').querySelector('a');
  assert.equal(practiceLink.href, 'supplemental-practice.html?set=safety-priority-01');
  assert.equal(practiceLink.target, undefined);
  for (const anchor of env.root.querySelectorAll('a').filter(node => node.href.startsWith('#'))) {
    assert.ok(env.root.querySelector(anchor.href), `anchor ${anchor.href} resolves`);
  }
});

test('cached five-topic payloads do not restore the removed lesson or its links', async () => {
  const content = fixture();
  content.lessons.push({
    ...content.lessons[0], key: 'procedure-safety', nav: 'Removed topic',
    diagram: { ...content.lessons[0].diagram, type: 'checkpoint', items: content.lessons[0].diagram.items.slice(0, 1) }
  });
  const env = setup({ content });
  await env.api.mount(env.root);
  assert.equal(env.root.querySelectorAll('.lesson').length, 5);
  assert.equal(env.root.querySelector('#procedure-safety'), null);
  assert.ok(env.root.querySelectorAll('a').every(anchor => anchor.href !== '#procedure-safety'));
});

test('lesson content is rendered as text, never interpreted as markup', async () => {
  const content = fixture();
  content.lessons[0].title = '<img src=x onerror=alert(1)>';
  const env = setup({ content });
  await env.api.mount(env.root);
  assert.equal(env.root.querySelector('#priority-frameworks-title').textContent, content.lessons[0].title);
  assert.equal(env.root.querySelector('img'), null);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|createSignedUrl/);
});

test('auth and file errors surface a retry state without lesson content', async () => {
  for (const options of [
    { sessionError: new Error('session failed') },
    { userError: new Error('invalid token') },
    { fileError: new Error('not available') },
    { content: { version: 99 } },
    { download: async () => ({ data: { size: 600000 }, error: null }) },
    { download: async () => ({ data: { size: 20, text: async () => '{invalid' }, error: null }) }
  ]) {
    const env = setup(options);
    await env.api.mount(env.root);
    assert.equal(env.root.querySelector('.core1-content'), null);
    assert.equal(env.root.querySelector('#core1-state').querySelector('h1').textContent, 'Core 1 could not load');
    assert.ok(env.root.querySelector('button'));
    assert.equal(env.errors.length, 1);
    if (options.sessionError || options.userError) assert.ok(!env.calls.includes('download'));
  }
});

test('retry loads successfully after a transient file error', async () => {
  let attempts = 0;
  const env = setup({ download: async () => {
    attempts++;
    return attempts === 1 ? { error: new Error('temporary') } :
      { data: { size: 100, text: async () => JSON.stringify(fixture()) } };
  } });
  await env.api.mount(env.root);
  await env.root.querySelector('button').events.click();
  assert.ok(env.root.querySelector('.core1-content'));
  assert.equal(attempts, 2);
});

test('missing SDK has a clear error without showing lessons', async () => {
  const env = setup({ missingSdk: true });
  await env.api.mount(env.root);
  assert.equal(env.root.querySelector('h1').textContent, 'Core 1 could not load');
  assert.equal(env.root.querySelector('.core1-content'), null);
});

test('sign-out clears displayed content and prevents an in-flight response from restoring it', async () => {
  const env = setup();
  await env.api.mount(env.root);
  env.signOut();
  assert.equal(env.root.querySelector('.core1-content'), null);
  assert.equal(env.root.querySelector('h1').textContent, 'Please sign in');

  let resolve;
  const pending = setup({ download: () => new Promise(done => { resolve = done; }) });
  const loading = pending.api.mount(pending.root);
  while (!resolve) await Promise.resolve();
  pending.signOut();
  resolve({ data: { size: 100, text: async () => JSON.stringify(fixture()) } });
  await loading;
  assert.equal(pending.root.querySelector('.core1-content'), null);
  assert.equal(pending.root.querySelector('h1').textContent, 'Please sign in');
});

test('back-forward cache restoration revalidates instead of retaining an old session', async () => {
  const env = setup();
  await env.api.mount(env.root);
  env.events.pagehide();
  assert.equal(env.root.querySelector('.core1-content'), null);
  assert.ok(env.calls.includes('unsubscribe'));
  env.events.pageshow({ persisted: true });
  assert.equal(env.reloads, 1);
});

test('schema rejects missing, reordered, or malformed lesson sections', () => {
  const { api } = setup();
  for (const mutate of [
    data => data.lessons.pop(),
    data => data.lessons.reverse(),
    data => { data.lessons[0].diagram.type = 'unknown'; },
    data => { data.lessons[0].body = []; },
    data => { data.lessons[3].precautions = [{ name: 'Missing fields' }]; },
    data => { data.lessons[3].mnemonic = { title: 'Missing entries' }; },
    data => { data.lessons[3].mnemonics = [{ title: 'Missing entries' }]; },
    data => { data.lessons[3].mnemonics = []; }
  ]) {
    const content = fixture();
    mutate(content);
    assert.throws(() => api.validate(content), /Core 1 lesson file/);
  }
});

test('storage provisioning keeps the lesson bucket private and restricts its read policy', () => {
  assert.match(migration, /'module-lessons', 'module-lessons', false/);
  assert.match(migration, /public = false/);
  assert.match(migration, /FOR SELECT TO authenticated/);
  assert.match(migration, /name = 'core-safety-priority\.json'/);
  assert.match(migration, /module_key = 'core-safety-priority' AND is_available = true/);
  assert.match(migration, /public\.is_app_admin\(\)/);
  assert.doesNotMatch(migration, /TO anon|TO public|DISABLE ROW LEVEL SECURITY/i);
});

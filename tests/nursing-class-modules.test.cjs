const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const nursing = { id: 'nursing', name: 'Test Student', student_type: 'nursing_student' };
const nclex = { id: 'nclex', name: 'NCLEX Student', student_type: 'nclex' };
const cardiac = { module_key: 'm4', name: 'Module 4 - Cardiac', guide_url: 'module4-guide.html' };
const respiratory = { module_key: 'm5', name: 'Module 5 - Respiratory', guide_url: 'module5-guide.html' };

function database() {
  const rows = { student_resources: [], student_module_access: [], student_class_schedules: [] };
  const calls = [];
  const failures = {};
  let delay;
  return {
    rows, calls, failures,
    setDelay(callback) { delay = callback; },
    from(table) {
      const filters = [];
      let action = 'select', payload;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        limit() { return query; },
        insert(value) { action = 'insert'; payload = plain(value); return query; },
        upsert(value) { action = 'upsert'; payload = plain(value); return query; },
        async then(resolve, reject) {
          try {
            calls.push({ table, action, payload });
            if (delay) await delay(table);
            const error = failures[table + ':' + action];
            if (error) return resolve({ data: null, error: { message: error } });
            if (action === 'insert') rows[table].push({ id: String(rows[table].length + 1), ...payload });
            if (action === 'upsert') {
              for (const item of payload) {
                const existing = rows[table].find(row => row.student_id === item.student_id && row.module_key === item.module_key);
                if (existing) Object.assign(existing, item);
                else rows[table].push(item);
              }
            }
            resolve({ data: rows[table].filter(row => filters.every(filter => filter(row))), error: null });
          } catch (error) { reject(error); }
        }
      };
      return query;
    }
  };
}

function dom() {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      value: '', checked: false, disabled: false, children: [], dataset: {}, textContent: '',
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
      },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; this.value = ''; },
      setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; },
      insertAdjacentHTML(_where, html) { this.innerHTML = html + this.innerHTML; },
      set innerHTML(html) {
        this.html = html;
        for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element());
      },
      get innerHTML() { return this.html || ''; }
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  return {
    get,
    document: { getElementById: get, createElement: element, querySelectorAll: () => [] },
    Option: function (text, value) { this.textContent = text; this.value = value; }
  };
}

function admin(db = database()) {
  const ui = dom();
  const context = vm.createContext({
    window: { addEventListener() {} }, document: ui.document, Option: ui.Option,
    supabase: { createClient: () => db }, URL, URLSearchParams
  });
  vm.runInContext(read('nursing-class-modules.js'), context);
  context.NursingClassModules = context.window.NursingClassModules;
  const script = [...read('madison-assignments.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(source => source.includes('async function loadStudent()'));
  vm.runInContext(script.slice(0, script.lastIndexOf('    init().catch')), context);
  vm.runInContext('students = [testNursing, testNclex]; catalog = []; renderModuleChoices();'
    .replace('testNursing', JSON.stringify(nursing)).replace('testNclex', JSON.stringify(nclex)), context);
  ui.get('student').value = nursing.id;
  return { db, ui, context, run: code => vm.runInContext(code, context) };
}

test('shared class choices preserve defaults and include saved additional classes without duplicates', () => {
  const app = admin();
  assert.deepEqual(plain(app.context.NursingClassModules.classes(nursing, [
    { class_code: 'NUR 312' }, { class_code: 'NUR 500' }, {}
  ])).map(item => item.code), ['NUR 312', 'NUR 321', 'NUR 416', 'NUR 500']);
  assert.deepEqual(plain(app.context.NursingClassModules.classes({ email: 'BIANCA.EDWARDS86@GMAIL.COM' }))
    .map(item => item.code), ['NUR 215', 'NUR 235']);
});

test('only exact class-tagged module guide resources count as class module assignments', () => {
  const app = admin();
  const resources = [
    { resource_type: 'study_guide', class_code: 'NUR 312', url: cardiac.guide_url },
    { resource_type: 'study_guide', class_code: 'NUR 416', url: respiratory.guide_url },
    { resource_type: 'practice_set', class_code: 'NUR 312', url: respiratory.guide_url },
    { resource_type: 'study_guide', class_code: 'NUR 312', url: 'unrelated-guide.html' },
    { resource_type: 'study_guide', url: respiratory.guide_url }
  ];
  assert.deepEqual(plain(app.context.NursingClassModules.assignedKeys(resources, [cardiac, respiratory], 'NUR 312')), ['m4']);
  assert.deepEqual(plain(app.context.NursingClassModules.assignedKeys(resources, [cardiac, respiratory])), ['m4', 'm5']);
});

test('nursing assignment requires an explicit class, persists Cardiac, reloads, and is retry-safe', async () => {
  const app = admin();
  await app.run('loadStudent()');
  assert.equal(app.ui.get('m4').disabled, true);
  assert.equal(app.ui.get('module-class-field').classList.contains('hidden'), false);
  await assert.rejects(app.run("saveModuleAssignments(selected(), ['m4'])"), /Choose a class/);
  assert.equal(app.db.calls.some(call => call.action !== 'select'), false);
  app.ui.get('module-class').value = 'NUR 312';
  app.run('syncModuleClass()');
  app.ui.get('m4').checked = true;
  await app.run('save()');
  assert.equal(app.db.rows.student_resources.length, 1);
  assert.deepEqual(app.db.rows.student_resources[0], {
    id: '1', student_id: nursing.id, class_code: 'NUR 312', resource_type: 'study_guide',
    title: 'Module 4 · Cardiac', url: 'module4-guide.html',
    note: 'Success Center module assigned for NUR 312.'
  });
  assert.deepEqual(app.db.rows.student_module_access, [{ student_id: nursing.id, module_key: 'm4', enabled: true }]);
  assert.match(app.ui.get('notice').innerHTML, /Modules are filed under NUR 312/);
  await app.run('save()');
  assert.equal(app.db.rows.student_resources.length, 1);
  await app.run('loadStudent()');
  app.ui.get('module-class').value = 'NUR 312';
  app.run('syncModuleClass()');
  assert.equal(app.ui.get('m4').checked, true);
  app.ui.get('module-class').value = 'NUR 321';
  app.run('syncModuleClass()');
  assert.equal(app.ui.get('m4').checked, false);
  await app.run("saveModuleAssignments(selected(), ['m4'])");
  assert.equal(app.db.rows.student_resources.length, 2);
  assert.equal(app.db.rows.student_module_access.length, 1);
});

test('class scope is independent of other students, other classes, and pre-existing assignments', async () => {
  const app = admin();
  const unrelated = { id: 'existing', student_id: nclex.id, class_code: 'NUR 312', resource_type: 'study_guide', url: cardiac.guide_url };
  app.db.rows.student_resources.push(unrelated);
  app.db.rows.student_module_access.push({ student_id: nursing.id, module_key: 'm5', enabled: true });
  await app.run('loadStudent()');
  app.ui.get('module-class').value = 'NUR 312';
  await app.run("saveModuleAssignments(selected(), ['m4'])");
  app.ui.get('module-class').value = 'NUR 416';
  await app.run("saveModuleAssignments(selected(), ['m5'])");
  assert.equal(app.db.rows.student_resources.length, 3);
  assert.deepEqual(app.db.rows.student_resources[0], unrelated);
  assert.equal(app.db.rows.student_module_access.length, 2);
  await app.run('loadStudent()');
  app.ui.get('module-class').value = 'NUR 312';
  app.run('syncModuleClass()');
  assert.equal(app.ui.get('m4').checked, true);
  assert.equal(app.ui.get('m5').checked, false);
});

test('NCLEX assignments remain student-wide with no class schedule queries or class links', async () => {
  const app = admin();
  app.ui.get('student').value = nclex.id;
  await app.run('loadStudent()');
  assert.equal(app.ui.get('module-class-field').classList.contains('hidden'), true);
  assert.equal(app.ui.get('m4').disabled, false);
  app.ui.get('m4').checked = true;
  await app.run('save()');
  assert.equal(app.db.rows.student_resources.length, 0);
  assert.equal(app.db.calls.some(call => call.table === 'student_class_schedules'), false);
  assert.deepEqual(app.db.rows.student_module_access, [{ student_id: nclex.id, module_key: 'm4', enabled: true }]);
  await app.run('loadStudent()');
  assert.equal(app.ui.get('m4').checked, true);
});

test('failed class loads block saving and show the actual error', async () => {
  const app = admin();
  app.db.failures['student_class_schedules:select'] = 'schedule unavailable';
  await app.run('loadStudent()');
  assert.equal(app.ui.get('save').disabled, true);
  assert.equal(app.ui.get('m4').disabled, true);
  assert.match(app.ui.get('notice').textContent, /Could not load classes.*schedule unavailable/);
});

test('resource and access failures surface explicitly and can be retried without duplicate links', async () => {
  const app = admin();
  await app.run('loadStudent()');
  app.ui.get('module-class').value = 'NUR 312';
  app.db.failures['student_resources:insert'] = 'insert denied';
  await assert.rejects(app.run("saveModuleAssignments(selected(), ['m4'])"), /insert denied/);
  assert.equal(app.db.rows.student_module_access.length, 0);
  delete app.db.failures['student_resources:insert'];
  app.db.failures['student_module_access:upsert'] = 'access denied';
  await assert.rejects(app.run("saveModuleAssignments(selected(), ['m4'])"), /access denied.*retry/);
  assert.equal(app.db.rows.student_resources.length, 1);
  delete app.db.failures['student_module_access:upsert'];
  await app.run("saveModuleAssignments(selected(), ['m4'])");
  assert.equal(app.db.rows.student_resources.length, 1);
  assert.equal(app.db.rows.student_module_access.length, 1);
});

test('lookup failures do not insert a success-shaped class assignment', async () => {
  const app = admin();
  app.db.failures['student_resources:select'] = 'lookup denied';
  await assert.rejects(
    app.context.NursingClassModules.assign(app.db, nursing, 'NUR 312', [cardiac]),
    /Could not check class module assignments: lookup denied/
  );
  assert.equal(app.db.rows.student_resources.length, 0);
  assert.equal(app.db.rows.student_module_access.length, 0);
});

test('a late student load cannot replace the current student or class assignments', async () => {
  const app = admin();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  app.db.setDelay(table => table === 'student_class_schedules' ? waiting : undefined);
  const first = app.run('loadStudent()');
  app.ui.get('student').value = nclex.id;
  await app.run('loadStudent()');
  release();
  await first;
  assert.equal(app.run('loadedStudentId'), nclex.id);
  assert.equal(app.ui.get('module-class-field').classList.contains('hidden'), true);
  assert.equal(app.ui.get('module-class').children.length, 1);
});

function library() {
  const ui = dom();
  const context = vm.createContext({ window: {}, document: ui.document, text: value => String(value).replaceAll('<', '&lt;') });
  vm.runInContext(read('nursing-class-modules.js'), context);
  context.NursingClassModules = context.window.NursingClassModules;
  const html = read('student-dashboard.html');
  vm.runInContext(html.slice(html.indexOf('    function renderModulesInto('), html.indexOf('    // ── NCLEX portal')), context);
  vm.runInContext(html.slice(html.indexOf('    function renderNursingModules('), html.indexOf('    function renderClassSchedule(')), context);
  return { ui, context };
}

test('student library switches class modules, clears stale cards, and keeps legacy access separately', () => {
  const { ui, context } = library();
  context.catalog = [cardiac, respiratory, { module_key: 'm3', name: 'Pharmacology', guide_url: 'module3-guide.html' }];
  context.access = [{ module_key: 'm4', enabled: true }, { module_key: 'm5', enabled: true }, { module_key: 'm3', enabled: true }];
  context.resources = [
    { resource_type: 'study_guide', class_code: 'NUR 312', url: cardiac.guide_url },
    { resource_type: 'study_guide', class_code: 'NUR 416', url: respiratory.guide_url }
  ];
  vm.runInContext("renderNursingModules('NUR 312',catalog,access,resources)", context);
  assert.match(ui.get('modules-nursing-class').innerHTML, /Cardiac/);
  assert.doesNotMatch(ui.get('modules-nursing-class').innerHTML, /Respiratory/);
  assert.match(ui.get('modules-nursing-general').innerHTML, /Other assigned modules.*Pharmacology/s);
  assert.doesNotMatch(ui.get('modules-nursing-general').innerHTML, /Cardiac|Respiratory/);
  vm.runInContext("renderNursingModules('NUR 416',catalog,access,resources)", context);
  assert.match(ui.get('modules-nursing-class').innerHTML, /Respiratory/);
  assert.doesNotMatch(ui.get('modules-nursing-class').innerHTML, /Cardiac/);
  vm.runInContext("renderNursingModules('NUR 321',catalog,access,resources)", context);
  assert.match(ui.get('modules-nursing-class').innerHTML, /No modules assigned/);
  vm.runInContext("renderNursingModules('NUR 312',catalog,[],resources)", context);
  assert.match(ui.get('modules-nursing-class').innerHTML, /No modules assigned/);
  vm.runInContext("renderNursingModules('NUR 312',catalog,access,resources,'load failed')", context);
  assert.match(ui.get('modules-nursing').innerHTML, /could not be loaded: load failed/);
});

test('edited pages parse and both load the same class helper before their inline application', () => {
  for (const file of ['madison-assignments.html', 'student-dashboard.html']) {
    const html = read(file);
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    assert.ok(html.indexOf('src="nursing-class-modules.js"') < html.indexOf('const db'));
  }
  const dashboard = read('student-dashboard.html');
  assert.match(dashboard, /renderNursingModules\(classCode, catalog, access, resources, moduleError\)/);
  assert.match(dashboard, /!classModuleResources\.has\(r\)/);
  assert.match(dashboard, /renderModulesInto\('modules-nclex', catalog, access, true\)/);
});

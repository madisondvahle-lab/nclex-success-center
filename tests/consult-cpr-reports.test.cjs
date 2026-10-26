const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const read = path => readFileSync(join(__dirname, '..', path), 'utf8');
const context = { window: {}, crypto: webcrypto };
vm.runInNewContext(read('consult-cpr-reports.js'), context);
const api = context.window.ConsultCPRReports;
const plain = value => JSON.parse(JSON.stringify(value));
const file = { name: 'Synthetic CPR.pdf', type: 'application/pdf', size: 100 };

test('report details reuse existing attempt fields and validate counts/dates without interpreting clinical data', () => {
  assert.deepEqual(plain(api.details({ test_date: '2026-10-26', question_count: '85', notes: '  Separate notes  ' })),
    { test_date: '2026-10-26', question_count: 85, notes: 'Separate notes' });
  assert.deepEqual(plain(api.details({})), { test_date: null, question_count: null, notes: null });
  for (const count of ['0', '-1', '85.5', 'text', 'Infinity', '9007199254740992']) {
    assert.throws(() => api.details({ question_count: count }), /positive whole number/);
  }
  for (const date of ['2026-02-30', 'bad', '26-10-2026']) assert.throws(() => api.details({ test_date: date }), /valid exam date/);
  assert.throws(() => api.details({ notes: 'x'.repeat(2001) }), /2,000/);
});

test('upload validation permits only nonempty bounded PDF/images', () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']) assert.doesNotThrow(() => api.checkFile({ ...file, type }));
  assert.throws(() => api.checkFile({ ...file, type: 'text/html' }), /choose a PDF/);
  for (const size of [0, 20 * 1024 * 1024 + 1]) assert.throws(() => api.checkFile({ ...file, size }), /20 MB/);
});

function uploadDB({ uploadError, metadataError, cleanupError } = {}) {
  const writes = [];
  return {
    writes,
    storage: { from(bucket) {
      assert.equal(bucket, 'assessment-reports');
      return {
        async upload(path, value, options) { writes.push({ kind: 'upload', path, value, options }); return { error: uploadError }; },
        async remove(paths) { writes.push({ kind: 'cleanup', paths }); return { error: cleanupError }; }
      };
    } },
    from(table) {
      assert.equal(table, 'consult_intake_files');
      return { async insert(row) { writes.push({ kind: 'metadata', row }); return { error: metadataError }; } };
    }
  };
}
test('CPR files use existing private bucket and link to exactly one intake/attempt, without public URLs', async () => {
  const db = uploadDB();
  await api.attach(db, 'intake-1', 'attempt-1', file);
  assert.equal(db.writes.length, 2);
  assert.match(db.writes[0].path, /^consults\/intake-1\/[a-f0-9-]+-Synthetic-CPR.pdf$/);
  assert.equal(db.writes[0].options.upsert, false);
  assert.deepEqual(plain(db.writes[1].row), {
    consult_intake_id: 'intake-1', attempt_id: 'attempt-1', category: 'CPR report',
    storage_path: db.writes[0].path, file_name: file.name, mime_type: file.type
  });
});
test('upload failure never creates metadata; failed metadata cleans up the private object', async () => {
  const failedUpload = uploadDB({ uploadError: { message: 'Storage unavailable' } });
  await assert.rejects(api.attach(failedUpload, 'intake', 'attempt', file), /Storage unavailable/);
  assert.equal(failedUpload.writes.length, 1);
  const failedMeta = uploadDB({ metadataError: { message: 'Metadata denied' } });
  await assert.rejects(api.attach(failedMeta, 'intake', 'attempt', file), /Metadata denied.*unattached upload was removed/);
  assert.deepEqual(plain(failedMeta.writes[2].paths), [failedMeta.writes[0].path]);
  const failedCleanup = uploadDB({ metadataError: { message: 'Metadata denied' }, cleanupError: { message: 'Cleanup denied' } });
  await assert.rejects(api.attach(failedCleanup, 'intake', 'attempt', file), /cleanup also failed: Cleanup denied.*storage path:/);
});
test('invalid files do not write and unlinked bookings do not implicitly create a prospect', async () => {
  const db = uploadDB();
  await assert.rejects(api.attach(db, 'intake', 'attempt', { ...file, size: 0 }), /20 MB/);
  assert.equal(db.writes.length, 0);
  const root = {};
  api.mount(root, db, null);
  assert.match(root.innerHTML, /no linked consultation intake/);
  assert.equal(db.writes.length, 0);
});
test('consultations keep paid strategy sessions, diagnostic links, and private CPR integration together', () => {
  const html = read('madison-consultations.html');
  assert.match(html, /consult-cpr-reports.js\?v=consult-cpr-v1/);
  assert.match(html, /ConsultCPRReports.mount\(document.getElementById\('consult-cpr-reports'\),db,c.consult_intake_id\)/);
  assert.match(html, /paid, in-depth consultation/);
  assert.match(html, /madison-diagnostic.html\?consultation=\$\{encodeURIComponent\(c.id\)\}/);
  assert.match(read('consult-cpr-reports.js'), /createSignedUrl\(file.storage_path, 600\)/);
  assert.doesNotMatch(read('consult-cpr-reports.js'), /getPublicUrl|from\('students'\)|from\('consultations'\)|nclex_cpr_results/);
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
test('scheduled paid strategy consults expose CPR preparation without changing templates or diagnostic links', () => {
  const html = read('madison-consultations.html');
  const elements = new Map(), mounted = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', classList: { add() {}, remove() {} },
      addEventListener() {}, querySelectorAll: () => []
    });
    return elements.get(id);
  };
  const current = { id: 'strategy-1', status: 'scheduled', consult_type: 'strategy_session',
    consult_intake_id: 'intake-1', template: { notes: 'Existing private session notes' } };
  const before = JSON.stringify(current);
  const ctx = {
    current, db: {}, document: { getElementById: get },
    ConsultCPRReports: { mount: (...args) => mounted.push(args) },
    isStrat: item => item.consult_type === 'strategy_session',
    STRAT_CHECKLIST: [], CHECKLIST: [], RECS: [], CREDIT_LABEL: {},
    esc: value => String(value ?? ''), fmt: () => 'Synthetic date',
    closeDetail() {}, queueSave() {}, toggleTimer() {}, makeDraft() {}, completeConsult() {},
    changeAttendanceStatus() {}, setCredit() {}
  };
  vm.runInNewContext(html.slice(html.indexOf('function renderDetail('), html.indexOf('function collect(')), ctx);
  ctx.renderDetail([]);
  assert.equal(mounted.length, 1);
  assert.equal(mounted[0][2], 'intake-1');
  assert.match(get('detail-view').innerHTML, /paid, in-depth consultation/);
  assert.match(get('detail-view').innerHTML, /madison-diagnostic.html\?consultation=strategy-1/);
  assert.match(get('detail-view').innerHTML, /data-top="notes" disabled>Existing private session notes/);
  assert.equal(JSON.stringify(current), before);
});

// Supply private local images in the order in archer-report-expectations.json.
// Images are read locally by Tesseract; they are not sent to Supabase.
async function runArcherScreenshotChecks(page, origin, imagePaths) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(imagePaths.length === 4, 'Supply all four original screenshots.');
  await page.goto(`${origin}/tests/`);
  const expected = await page.evaluate(async () =>
    (await fetch('/tests/fixtures/archer-report-expectations.json')).json());
  await page.evaluate(() => { document.body.innerHTML = '<input id="archer-test-images" type="file" multiple>'; });
  for (const script of ['category-names.js', 'assessment-archer.js', 'assessment-import.js']) {
    await page.addScriptTag({ url: `${origin}/${script}?archer-test=${Date.now()}` });
  }
  await page.locator('#archer-test-images').setInputFiles(imagePaths);
  const actual = await page.evaluate(async expected => {
    const results = [];
    const images = document.getElementById('archer-test-images').files;
    for (let i = 0; i < expected.length; i++) {
      results.push(await AssessmentImport.readArcherStats(images[i], expected[i].section));
    }
    return results;
  }, expected);
  const results = [];
  let fields = 0;
  expected.forEach((fixture, index) => {
    const result = actual[index];
    check(result.section === fixture.section && result.view === fixture.view, `${fixture.id}: section/view`);
    const rows = result[fixture.view === 'client_need' ? 'categories' : 'subjects'];
    check(Object.keys(rows).length === Object.keys(fixture.rows).length, `${fixture.id}: row count`);
    for (const [label, values] of Object.entries(fixture.rows)) {
      const row = rows[label];
      check(Boolean(row), `${fixture.id}: missing ${label}`);
      ['score', 'peer_score', 'peer_score_unit', 'question_count'].forEach((field, i) => {
        check(row[field] === values[i], `${fixture.id}: ${label} ${field}: ${row[field]} instead of ${values[i]}`);
        fields++;
      });
    }
    for (const field of ['question_count', 'overall_percent', 'overall_points']) {
      check(JSON.stringify(result[field]) === JSON.stringify(fixture[field]), `${fixture.id}: ${field}`);
    }
    check(result.reviewRequired === true, `${fixture.id}: review required`);
    if (fixture.view === 'subject_lesson') check(result.categories === undefined, `${fixture.id}: leaked Client Needs`);
    else check(result.subjects === undefined, `${fixture.id}: leaked subjects`);
    results.push(`${fixture.id}: ${Object.keys(rows).length} rows matched`);
  });
  const wrongSection = await page.evaluate(() =>
    AssessmentImport.readArcherStats(document.getElementById('archer-test-images').files[3], 'classic'));
  check(wrongSection.section === 'ngn' && Object.keys(wrongSection.subjects).length === 0, 'Wrong section was imported');
  results.push('Visible NGN tab rejects Classic upload');
  return { results, fields, actual };
}

async function runArcherReviewChecks(page, origin, ocrResults) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [], productionRequests = [];
  const onError = error => errors.push(error.message);
  const blockProduction = route => { productionRequests.push(route.request().url()); return route.abort(); };
  page.on('pageerror', onError);
  await page.route('**/*.supabase.co/**', blockProduction);
  try {
    await page.goto(`${origin}/tests/`);
    await page.evaluate(async results => {
      const html = await (await fetch('/assessment-history-admin.html')).text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      document.body.replaceChildren(parsed.getElementById('assessment-form'), parsed.getElementById('status'));
      window.__archerSaved = { assessments: [], files: [], uploads: [], failNextFile: false };
      window.currentUser = { id: 'synthetic-admin' };
      window.db = {
        from(table) {
          return {
            insert(payload) {
              if (table === 'external_assessments') {
                window.__archerSaved.assessments.push(payload);
                return { select: () => ({ single: async () => ({
                  data: { id: 'synthetic-assessment', student_id: payload.student_id }
                }) }) };
              }
              if (window.__archerSaved.failNextFile) {
                window.__archerSaved.failNextFile = false;
                return Promise.resolve({ error: { message: 'Synthetic attachment failure' } });
              }
              window.__archerSaved.files.push(payload);
              return Promise.resolve({ error: null });
            }
          };
        },
        storage: { from: () => ({
          upload: async path => { window.__archerSaved.uploads.push(path); return { error: null }; },
          remove: async () => ({ error: null })
        }) }
      };
      window.__archerOcrResults = results;
      document.getElementById('student').innerHTML = '<option value="synthetic-student">Synthetic student</option>';
    }, ocrResults);
    for (const script of ['category-names.js', 'assessment-archer.js', 'assessment-import.js']) {
      await page.addScriptTag({ url: `${origin}/${script}?archer-test=${Date.now()}` });
    }
    await page.evaluate(() => {
      AssessmentImport.readArcherStats = async file => structuredClone(window.__archerOcrResults[Number(file.name[0])]);
    });
    await page.addScriptTag({ url: `${origin}/assessment-history-archer.js?archer-test=${Date.now()}` });
    await page.locator('#platform').fill('Archer');
    await page.locator('#assessment-name').fill('Synthetic CAT');
    await page.locator('#taken-at').fill('2026-10-24');
    await page.locator('#archer-result').selectOption('PASS');
    const rowInput = (view, section, label, field) => page.locator(
      `[data-archer-view="${view}"][data-archer-section="${section}"]` +
      `[data-archer-${view === 'client_need' ? 'category' : 'subject'}="${label}"][data-archer-field="${field}"]`);
    const screenshots = (selector, names) => page.locator(selector).evaluate((input, names) => {
      const transfer = new DataTransfer();
      names.forEach(name => transfer.items.add(new File(['synthetic'], name, { type: 'image/png' })));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, names);
    await screenshots('#archer-classic-files', ['0-synthetic.png', '2-synthetic.png']);
    await page.waitForFunction(() => !document.getElementById('save').disabled);
    await screenshots('#archer-ngn-files', ['1-synthetic.png', '3-synthetic.png']);
    await page.waitForFunction(() => !document.getElementById('save').disabled);
    check(await page.locator('.archer-preview').count() === 4, 'Multiple previews not retained');
    check(await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score').inputValue() === '4', 'Low peer score lost');
    check(await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score_unit').inputValue() === 'percent', 'Peer unit changed');
    check(await rowInput('client_need', 'classic', 'Physiological Adaptation', 'score').inputValue() === '71', 'Client Need overwritten');
    await page.locator('#save').click();
    check(await page.evaluate(() => window.__archerSaved.assessments.length) === 0, 'Unreviewed OCR was saved');
    await page.locator('#archer-ocr-reviewed').check();
    await rowInput('subject_lesson', 'classic', 'Fundamentals', 'score').fill('74');
    check(!await page.locator('#archer-ocr-reviewed').isChecked(), 'Correction did not invalidate review');
    await rowInput('subject_lesson', 'classic', 'Fundamentals', 'score').fill('75');
    await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score_unit').selectOption('points');
    await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score').fill('');
    await screenshots('#archer-ngn-files', ['3-conflict.png']);
    await page.waitForFunction(() => !document.getElementById('save').disabled);
    check(await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score').inputValue() === '', 'Mixed OCR percent with manual points');
    await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score_unit').selectOption('percent');
    await rowInput('subject_lesson', 'ngn', 'Mental Health', 'peer_score').fill('4');
    await page.locator('#archer-ocr-reviewed').check();
    await page.evaluate(() => { window.__archerSaved.failNextFile = true; });
    await page.locator('#save').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('already saved'));
    await page.locator('#save').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('saved as one assessment'));
    const saved = await page.evaluate(() => window.__archerSaved);
    check(saved.assessments.length === 1 && saved.files.length === 5, 'Retry duplicated assessment or lost attachments');
    check(saved.files.every(file => file.assessment_id === 'synthetic-assessment'), 'Attachments split across assessments');
    check(saved.files.filter(file => file.section === 'classic').length === 2, 'Classic attachments lost');
    check(saved.files.filter(file => file.report_view === 'subject_lesson').length === 3, 'Report views lost');
    const data = saved.assessments[0].archer_cat_data;
    check(data.subject_lesson.ngn.subjects['Mental Health'].peer_score === 4, 'Manual peer correction not saved');
    check(data.subject_lesson.ngn.subjects['Mental Health'].peer_score_unit === 'percent', 'Saved peer unit wrong');
    check(data.classic.categories['Physiological Adaptation'].peer_score_percent === 71, 'Category peer unit wrong');
    check(saved.assessments[0].overall_score === null, 'Invented combined overall');
    check(data.classic.overall_percent === null && data.classic.question_count === null, 'Invented cropped totals');
    check(Object.keys(saved.assessments[0].category_scores).length === 0, 'Subject scores leaked to Client Needs');
    check(errors.length === 0 && productionRequests.length === 0, 'Browser errors or production requests');
    return { passed: true, screenshots: saved.files.length, assessments: saved.assessments.length, errors, productionRequests };
  } finally {
    await page.unroute('**/*.supabase.co/**', blockProduction);
    page.removeListener('pageerror', onError);
  }
}

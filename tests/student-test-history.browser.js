// Run with an isolated Playwright page and the worktree served on localhost.
async function runStudentTestHistoryBrowserChecks(page, origin) {
  const fixture = await page.evaluate(async url => (await fetch(url)).text(), origin + '/tests/fixtures/student-test-history-browser.js');
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route =>
    route.fulfill({ contentType: 'application/javascript', body: fixture }));
  await page.route('**/*.supabase.co/**', route => { remote.push(route.request().url()); return route.abort(); });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const activate = async locator => {
    await locator.waitFor();
    const text = await locator.textContent();
    await page.evaluate(text => {
      const element = [...document.querySelectorAll('#previous-tests-card button')].find(button => button.textContent === text);
      element.scrollIntoView({ block: 'center' });
      element.click();
    }, text);
  };
  const search = (root, value) => root.getByRole('searchbox').evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  for (const [width, nursing] of [[1440, false], [390, false], [320, true]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(config => { window.__HISTORY_TEST__ = config; }, { nursing });
    await page.goto(origin + '/student-dashboard.html?history-test=' + width + '-' + Date.now() + '#previous-tests');
    const root = page.locator('#previous-tests-card');
    await root.getByRole('button', { name: 'Review test', exact: true }).first().waitFor();
    check(await page.locator('#main-content').evaluate(el => el.classList.contains('test-history-view')), 'History is not a separate view');
    check(!await page.locator('.hero').first().isVisible(), 'Dashboard content remains visible');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Viewport overflow at ' + width);
    check(!await root.getByText('Other student private test', { exact: true }).count(), 'Other student history exposed');
    check(!await root.getByText('Unfinished test', { exact: true }).count(), 'Incomplete CAT listed');
    await search(root, 'Synthetic practice test');
    await activate(root.getByRole('button', { name: 'Review test', exact: true }));
    await root.getByRole('button', { name: 'Review question 1', exact: true }).waitFor();
    await root.getByLabel('Show responses').selectOption('partial');
    check(await root.getByRole('button', { name: /^Review question/ }).count() === 1, 'Partial response filter is incorrect');
    await activate(root.getByRole('button', { name: 'Review question 3', exact: true }));
    await root.getByText('Synthetic rationale q2', { exact: true }).waitFor();
    check(await root.getByRole('button', { name: 'Next question', exact: true }).isDisabled(), 'Filtered navigation leaked questions');
    await activate(root.getByRole('button', { name: '← Test results', exact: true }));
    await root.getByLabel('Show responses').selectOption('all');
    await activate(root.getByRole('button', { name: 'Review question 2', exact: true }));
    await root.getByText('Synthetic rationale q1', { exact: true }).waitFor();
    const options = await root.locator('.ex-rv li').allTextContents();
    check(options[0].includes('Gamma') && options[1].includes('Alpha'), 'Saved option ordering was changed');
    await activate(root.getByRole('button', { name: 'Next question', exact: true }));
    await root.getByText('Synthetic rationale q2', { exact: true }).waitFor();
    await activate(root.getByRole('button', { name: '← Test results', exact: true }));
    await activate(root.getByRole('button', { name: 'Review question 5', exact: true }));
    await root.getByText('Saved clinical record', { exact: true }).waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Question viewport overflow at ' + width);
    await activate(root.getByRole('button', { name: '← Test results', exact: true }));
    await activate(root.getByRole('button', { name: '← All previous tests', exact: true }));
    await search(root, 'Older score-only test');
    await activate(root.getByRole('button', { name: 'Review test', exact: true }));
    await root.getByText(/Question details were not saved/).waitFor();
    await activate(root.getByRole('button', { name: '← All previous tests', exact: true }));
    await search(root, '');
    await activate(root.getByRole('button', { name: 'Load older tests', exact: true }));
    await root.getByText('Synthetic older test 20', { exact: true }).waitFor();
    await search(root, 'Synthetic mock CAT');
    await activate(root.getByRole('button', { name: 'Review test', exact: true }));
    await root.getByRole('button', { name: 'Review question 1', exact: true }).waitFor();
    const api = await page.evaluate(() => window.__historyCalls.find(call => call.body?.action === 'review'));
    check(api.body.attemptId === 'cat' && api.body.mcqOptionProtocol === 'mcq-order-v1', 'CAT review contract is incorrect');
    check(await page.evaluate(() => window.__historyCalls.filter(call => call.fields === 'answer_details').every(call =>
      call.filters.some(([key, value]) => key === 'student_id' && value === 'synthetic-student') &&
      call.filters.some(([key]) => key === 'id'))), 'Practice review is not ownership scoped');
    await page.goto(origin + '/student-dashboard.html');
    await page.locator('#app:not(.hidden)').waitFor();
    check(!await page.locator('#previous-tests-card').isVisible(), 'History is visible on the main dashboard');
  }
  await page.goto(origin + '/student-dashboard.html?failSource=external_assessments&check=' + Date.now() + '#previous-tests');
  const root = page.locator('#previous-tests-card');
  await root.getByRole('status').getByText(/Synthetic source failure/).waitFor();
  check(await root.getByText('Synthetic practice test', { exact: true }).count() === 1, 'Partial source failure hid available tests');
  await page.evaluate(() => { window.__HISTORY_TEST__.failSource = ''; });
  await activate(root.getByRole('button', { name: 'Retry / load more results', exact: true }));
  await root.getByText('Synthetic external CAT', { exact: true }).waitFor();
  check(await root.getByText('Synthetic practice test', { exact: true }).count() === 1, 'Retry duplicated practice results');
  await page.evaluate(() => { window.__HISTORY_TEST__.failReview = true; });
  await search(root, 'Synthetic mock CAT');
  await activate(root.getByRole('button', { name: 'Review test', exact: true }));
  await root.getByRole('alert').getByText(/Synthetic review failure/).waitFor();
  await page.evaluate(() => { window.__HISTORY_TEST__.failReview = false; });
  await activate(root.getByRole('button', { name: 'Retry review', exact: true }));
  await root.getByRole('button', { name: 'Review question 1', exact: true }).waitFor();
  check(!errors.length, 'Browser errors: ' + errors.join('; '));
  check(!remote.length, 'Unexpected Supabase network requests');
  return 'Passed desktop and 390px/320px checks for both account types, standalone views, search, pagination, status filters, question navigation, option order, clinical records, legacy content, ownership, CAT review, and no live requests.';
}

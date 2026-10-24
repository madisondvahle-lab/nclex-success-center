// Run with an isolated Playwright page and the worktree served on localhost.
async function runAssessmentInterfaceBrowserChecks(page) {
  const origin = 'http://127.0.0.1:8768';
  const fixture = await page.evaluate(async url => (await fetch(url)).text(), `${origin}/tests/fixtures/assessment-interface-browser.js`);
  const errors = [], unexpected = [], results = [];
  const recordError = error => errors.push(error.message);
  const localRequest = route => route.request().headers()['referer']?.startsWith(`${origin}/`);
  page.on('pageerror', recordError);
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', route => localRequest(route)
    ? route.fulfill({ contentType: 'application/javascript', body: fixture })
    : route.continue());
  await page.route('**/*.supabase.co/**', route => {
    if (!localRequest(route)) return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  for (const destination of ['student-login.html', 'student-dashboard.html']) {
    await page.route(`${origin}/${destination}`, route => route.fulfill({ contentType: 'text/html', body: '<p>Redirect destination</p>' }));
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  async function activate(locator) {
    await locator.waitFor();
    await locator.evaluate(element => {
      element.scrollIntoView({ block: 'center' });
      element.click();
    });
  }
  const modes = {
    practice: 'Adaptive Practice', nclex: 'Short Adaptive Assessment', mock: 'Full-Length Adaptive Mock',
    remediation: 'Targeted Remediation Practice', assessment: 'Initial Baseline Assessment'
  };
  async function load(query, config = {}) {
    await page.addInitScript(value => { window.__ASSESSMENT_UI_TEST__ = value; }, config);
    await page.goto(`${origin}/diagnostic.html${query}`);
  }
  try {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [mode, label] of Object.entries(modes)) {
      await load(`?mode=${mode}`, { stage: mode === 'assessment' ? 'assessment' : 'active', result: 'PASS' });
      const begin = page.getByRole('button', { name: `Begin ${label} →`, exact: true });
      await begin.waitFor();
      check(await begin.isEnabled(), `${mode}: begin disabled`);
      if (mode !== 'assessment') {
        check(await page.getByRole('button', { name: new RegExp(`^${label}`) }).getAttribute('aria-pressed') === 'true', `${mode}: wrong selection`);
      } else {
        check(await page.locator('.mode-options').count() === 0, 'Baseline exposed mode selector');
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode}: horizontal overflow at ${width}`);
      await activate(begin);
      await page.getByText('Synthetic interface question', { exact: true }).waitFor();
      await activate(page.getByText('Choice A', { exact: true }));
      await activate(page.getByRole('button', { name: /Submit/ }));
      await activate(page.getByRole('button', { name: /Results/ }));
      await page.getByText(`${label} Complete`, { exact: true }).waitFor();
      const text = await page.locator('#root').innerText();
      if (mode === 'nclex') {
        check(text.includes('Above Study Benchmark') && !/\bPASS\b|\bFAIL\b/.test(text), 'Short result exposes PASS/FAIL');
      } else if (mode === 'mock') {
        check(text.includes('PASS') && text.includes('not an official NCLEX outcome'), 'Mock disclosure missing');
      } else {
        check(!/\bPASS\b|\bFAIL\b/.test(text) && text.includes('0%'), `${mode}: unexpected classification`);
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Result overflow at ${width}`);
      const calls = await page.evaluate(() => window.__assessmentCalls);
      check(calls.find(call => call.action === 'start')?.mode === mode, 'Display label changed transport mode');
      results.push(`${width}px ${mode}: launch, answer, result`);
    }
  }
  for (const [mode, result, expected, allCorrect] of [
    ['nclex', 'FAIL', 'Below Study Benchmark', true],
    ['nclex', null, 'Insufficient Evidence', true],
    ['mock', 'FAIL', 'FAIL', true],
    ['mock', null, 'Insufficient Evidence', true]
  ]) {
    await load(`?mode=${mode}`, { result, allCorrect, ngn: !result, reason: !result ? 'insufficient-items' : null });
    await activate(page.getByRole('button', { name: `Begin ${modes[mode]} →`, exact: true }));
    await activate(page.getByText('Choice A', { exact: true }));
    await activate(page.getByRole('button', { name: /Submit/ }));
    await activate(page.getByRole('button', { name: /Results/ }));
    await page.getByText(`${modes[mode]} Complete`, { exact: true }).waitFor();
    const text = await page.locator('#root').innerText();
    check(text.includes(expected), `${mode}: ${result} changed by percentage`);
    if (!result) check(text.includes('no further eligible questions'), 'Missing pool completion reason');
    results.push(`${mode}: ${result || 'no result'} preserved`);
  }
  for (const query of ['', '?mode=unknown', '?mode=constructor']) {
    await load(query);
    await page.getByRole('button', { name: 'Begin Adaptive Practice →', exact: true }).waitFor();
    results.push(`${query || 'default'}: practice fallback`);
  }
  for (const mode of Object.keys(modes)) {
    await load(`?mode=${mode}`, { resume: true, savedMode: mode, stage: mode === 'assessment' ? 'assessment' : 'active' });
    await activate(page.getByRole('button', { name: 'Continue Assessment →', exact: true }));
    await page.getByText('Synthetic interface question', { exact: true }).waitFor();
    check(await page.getByRole('button', { name: /Submit/ }).isEnabled(), `${mode}: saved draft lost`);
    const calls = await page.evaluate(() => window.__assessmentCalls);
    check(!calls.some(call => call.action === 'start'), `${mode}: resume started a new attempt`);
    results.push(`${mode}: saved attempt and draft resumed without restart`);
  }
  await load('?mode=assessment', { stage: 'active' });
  await page.waitForURL(`${origin}/student-dashboard.html`);
  results.push('Unauthorized baseline: dashboard redirect');
  await load('?mode=assessment', { signedOut: true });
  await page.waitForURL(`${origin}/student-login.html`);
  results.push('Signed-out baseline: sign-in redirect');
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  check(unexpected.length === 0, 'Unexpected production Supabase request');
  return { passed: results.length, results, pageErrors: errors, productionRequests: unexpected };
  } finally {
    await page.unroute('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    await page.unroute('**/*.supabase.co/**');
    await page.unroute(`${origin}/student-login.html`);
    await page.unroute(`${origin}/student-dashboard.html`);
    page.removeListener('pageerror', recordError);
  }
}

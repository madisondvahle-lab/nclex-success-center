// Synthetic builder checks; no authentication, student data, or live database.
async function runPracticeBuilderBrowserChecks(page, origin) {
  const [html, selection] = await page.evaluate(async origin => Promise.all([
    fetch(origin + '/supplemental-practice.html').then(response => response.text()),
    fetch(origin + '/question-bank-selection.js').then(response => response.text())
  ]), origin);
  const render = html.slice(html.indexOf('function renderNclexLibrary(){'), html.indexOf('function renderLibrary(){'));
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const fixture = `
    const $=id=>document.getElementById(id);
    const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const questionTopicsError='',questionCaseWarning='',questionHistoryError='',questionHistoryById=new Map();
    const questionCatalog=[
      {id:'one',itemType:'mcq',nclexCategory:'Management of Care',studyArea:'Leadership',topic:'Delegation'},
      {id:'two',itemType:'sata',nclexCategory:'Psychosocial Integrity',studyArea:'Mental Health',topic:'Communication'},
      {id:'three',itemType:'mcq',nclexCategory:'Management of Care',studyArea:'Leadership',topic:'Communication'}
    ];
    const questionStudyAreas=[{name:'Leadership',count:2},{name:'Mental Health',count:1}];
    const questionCategories=[{value:'Management of Care',label:'Management of Care',count:2},{value:'Psychosocial Integrity',label:'Psychosocial Integrity',count:1}];
    const questionTopics=[{name:'Delegation',count:1},{name:'Communication',count:2}];
    function buildMixedReview(...args){window.__buildArgs=args;}
    ${render}
    renderNclexLibrary();
  `;
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*.supabase.co/**', route => { remote.push(route.request().url()); return route.abort(); });
  await page.route(origin + '/__practice-builder-check', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style>
      <main class="shell"><h1 id="page-title"></h1><p id="page-summary"></p><div id="sets"></div></main>
      <script>${selection}</script><script>${fixture}</script>`
  }));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const click = selector => page.evaluate(selector => document.querySelector(selector).click(), selector);
  const count = selector => page.locator(selector).count();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/__practice-builder-check');
    await page.locator('#start-custom-review').waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Builder overflow at ' + width);
    check(await page.locator('.custom-builder').evaluate(el => getComputedStyle(el).borderRadius) === '18px', 'Builder card styling missing');
    check(await page.locator('.builder-section').first().evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)', 'Section surfaces missing');
    check(await count('[data-category-choice]:checked') === 0, 'Initial focus changed');
    check(await page.locator('#tutor-mode-choice').isChecked(), 'Tutor default changed');
    check(!await page.locator('#timed-mode-choice').isChecked(), 'Timed default changed');
    check(await page.locator('[data-item-type-choice="case"]').isChecked(), 'Published cases are not included by default');
    await click('[data-select-all="category"]');
    check(await count('[data-category-choice]:checked') === 2, 'Client Needs select all failed');
    check(await page.locator('[data-select-all="category"]').isDisabled(), 'Select all state not updated');
    await click('[data-category-tab="study-areas"]');
    await click('[data-select-all="study-area"]');
    check(await count('[data-study-area-choice]:checked') === 2, 'Study Areas select all failed');
    check(await count('[data-category-choice]:checked') === 2, 'Switching tabs lost selections');
    await click('[data-clear-all="study-area"]');
    await click('[data-category-tab="client-needs"]');
    await click('[data-clear-all="category"]');
    check(await count('[data-category-choice]:checked') === 0, 'Client Needs clear all failed');
    check(await page.locator('#custom-review-status').textContent().then(text => text.includes('3 questions across')), 'Clearing optional filters no longer restores mixed practice');
    await page.locator('.custom-topic-picker').evaluate(el => { el.open = true; });
    await page.locator('#custom-topic-search').fill('Delegation');
    check(await page.locator('.custom-topic-option:visible').count() === 1, 'Topic search not applied');
    await click('[data-select-all="topic"]');
    check(await count('[data-topic-choice]:checked') === 2, 'Topic select all omitted hidden topics');
    await click('[data-clear-all="topic"]');
    check(await count('[data-topic-choice]:checked') === 0, 'Topic clear all failed');
    await page.locator('#custom-topic-search').fill('');
    await click('[data-clear-all="item-type"]');
    check(await page.locator('#start-custom-review').isDisabled(), 'Start allowed with no question type');
    await click('[data-select-all="item-type"]');
    await click('[data-clear-all="question-mode"]');
    check(await page.locator('#start-custom-review').isDisabled(), 'Start allowed with no question history mode');
    await click('[data-select-all="question-mode"]');
    await click('[data-category-choice]');
    check(await page.locator('[data-selection-count="category"]').textContent() === '1 of 2 selected', 'Manual checkbox selection count stale');
    await click('#timed-mode-choice');
    await page.locator('#custom-count').selectOption('10');
    await click('#start-custom-review');
    const args = await page.evaluate(() => window.__buildArgs);
    check(args[0] === 10 && args[3][0] === 'Management of Care', 'Builder did not pass selected count/focus');
    check(args[6].length === 3 && args[7].length === 5, 'Bulk types/history did not reach practice selection');
    check(args[8].tutorMode && args[8].timedMode, 'Mode settings changed');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded builder overflow at ' + width);
  }
  check(!errors.length, 'Browser errors: ' + errors.join('; '));
  check(!remote.length, 'Unexpected live database requests');
  return 'Passed builder layout and bulk-selection checks at 1440px, 390px, and 320px, topic search, tab persistence, counts, disabled states, and practice settings; no live data.';
}

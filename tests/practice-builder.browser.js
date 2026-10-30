// Synthetic builder checks; no authentication, student data, or live database.
async function runPracticeBuilderBrowserChecks(page, origin) {
  const [html, selection, topicGroups] = await page.evaluate(async origin => Promise.all([
    fetch(origin + '/supplemental-practice.html').then(response => response.text()),
    fetch(origin + '/question-bank-selection.js').then(response => response.text()),
    fetch(origin + '/practice-topic-groups.js').then(response => response.text())
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
      {id:'three',itemType:'mcq',nclexCategory:'Management of Care',studyArea:'Leadership',topic:'Communication'},
      {id:'case-one',itemType:'case',nclexCategory:'Management of Care',studyArea:'Leadership',topic:'Delegation',questionCount:6,childIds:['c1','c2','c3','c4','c5','c6']}
    ];
    const topicSummary=PracticeTopicGroups.summarize(questionCatalog);
    const questionTopicGroups=topicSummary.groups;
    const questionTopicIssues=topicSummary.unmappedTopics;
    const questionTopicCoverage={totalQuestionCount:topicSummary.totalQuestionCount,mappedQuestionCount:topicSummary.mappedQuestionCount,fallbackQuestionCount:topicSummary.fallbackQuestionCount,unmappedQuestionCount:topicSummary.unmappedQuestionCount};
    const questionStudyAreas=[{name:'Leadership',count:8},{name:'Mental Health',count:1}];
    const questionCategories=[{value:'Management of Care',label:'Management of Care',count:8},{value:'Psychosocial Integrity',label:'Psychosocial Integrity',count:1}];
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
      <script>${selection}</script><script>${topicGroups}</script><script>${fixture}</script>`
  }));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const click = selector => page.evaluate(selector => document.querySelector(selector).click(), selector);
  const count = selector => page.locator(selector).count();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + '/__practice-builder-check');
    await page.locator('#start-custom-review').waitFor();
    await page.locator('[data-type-count="case"]').evaluate(el => { el.textContent = '3 cases · 18 questions'; });
    const layoutIssues = await page.locator('#mixed-item-type-choice').evaluate(input => {
      const cards = input.closest('.builder-choices').querySelectorAll('.builder-choice');
      const issues = [];
      for (const card of cards) {
        const bounds = card.getBoundingClientRect();
        const title = card.querySelector('span');
        const detail = card.querySelector('small');
        for (const el of card.children) {
          const rect = el.getBoundingClientRect();
          if (rect.left < bounds.left || rect.right > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom || el.scrollWidth > el.clientWidth) {
            issues.push(title.textContent + ': content outside card');
          }
        }
        const titleBounds = title.getBoundingClientRect(), detailBounds = detail.getBoundingClientRect();
        if (detailBounds.top < titleBounds.bottom) issues.push(title.textContent + ': description overlaps title');
        for (const match of title.textContent.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(title.firstChild, match.index);
          range.setEnd(title.firstChild, match.index + match[0].length);
          if (range.getClientRects().length > 1) issues.push(title.textContent + ': word split across lines');
        }
      }
      return issues;
    });
    check(!layoutIssues.length, 'Question-type layout at ' + width + ': ' + layoutIssues.join('; '));
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Builder overflow at ' + width);
    check(await page.locator('.custom-builder').evaluate(el => getComputedStyle(el).borderRadius) === '18px', 'Builder card styling missing');
    check(await page.locator('.builder-section').first().evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)', 'Section surfaces missing');
    check(await count('[data-category-choice]:checked') === 0, 'Initial focus changed');
    check(await page.locator('#tutor-mode-choice').isChecked(), 'Tutor default changed');
    check(!await page.locator('#timed-mode-choice').isChecked(), 'Timed default changed');
    check(await page.locator('#mixed-item-type-choice').isChecked(), 'Mixed question-type mode is not the default');
    check(await count('[data-item-type-choice]:checked') === 0, 'Individual types are selected while Mixed is active');
    await click('[data-item-type-choice][value="mcq"]');
    check(!await page.locator('#mixed-item-type-choice').isChecked(), 'Selecting an individual type did not leave Mixed mode');
    check(await count('[data-item-type-choice]:checked') === 1, 'Selecting an individual type selected extra types');
    await click('#mixed-item-type-choice');
    check(await page.locator('#mixed-item-type-choice').isChecked(), 'Mixed mode could not be restored');
    check(await count('[data-item-type-choice]:checked') === 0, 'Mixed mode did not clear individual selections');
    check((await page.locator('[data-type-count="case"]').textContent()).includes('1 case · 6 questions'), 'Published case inventory is not shown');
    check(await count('[data-topic-group-choice]') === 16, 'Student topic list does not show the 15 broad categories and Other Topics fallback');
    check((await page.locator('label.custom-topic-option').filter({ hasText: 'Other Topics' }).textContent()).includes('(2)'), 'Unverified topics are not counted in Other Topics');
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
    check(await page.locator('#custom-review-status').textContent().then(text => text.includes('9 questions across 4 bank entries')), 'Clearing optional filters no longer restores mixed practice');
    await page.locator('.custom-topic-picker').evaluate(el => { el.open = true; });
    await page.locator('.custom-topic-warning').evaluate(el => { el.open = true; });
    check((await page.locator('.custom-topic-warning').textContent()).includes('Communication (2)'), 'Other Topics fallback did not identify unverified detailed topics');
    check((await page.locator('.custom-topic-warning').textContent()).includes('pending question-content review'), 'Fallback is not clearly described as pending content review');
    await page.locator('#custom-topic-search').fill('Other Topics');
    await click('[data-topic-group-choice][value="Other Topics"]');
    check(await page.locator('#custom-review-status').textContent().then(text => text.includes('2 questions across 2 bank entries')), 'Other Topics did not filter to the unverified questions');
    await click('[data-clear-all="topic-group"]');
    await page.locator('#custom-topic-search').fill('Leadership');
    check(await page.locator('.custom-topic-option:visible').count() === 1, 'Topic search not applied');
    await click('[data-select-all="topic-group"]');
    check(await count('[data-topic-group-choice]:checked') === 16, 'Topic select all omitted hidden broad groups');
    await click('[data-clear-all="topic-group"]');
    check(await count('[data-topic-group-choice]:checked') === 0, 'Topic clear all failed');
    await page.locator('#custom-topic-search').fill('');
    await click('[data-topic-group-choice][value="Leadership & Professional Practice"]');
    await click('[data-clear-all="item-type"]');
    check(await page.locator('#start-custom-review').isDisabled(), 'Start allowed with no question type');
    await click('[data-select-all="item-type"]');
    check(!await page.locator('#mixed-item-type-choice').isChecked(), 'Select all did not leave Mixed mode');
    check(await count('[data-item-type-choice]:checked') === 3, 'Select all did not select all individual question types');
    await click('[data-clear-all="question-mode"]');
    check(await page.locator('#start-custom-review').isDisabled(), 'Start allowed with no question history mode');
    await click('[data-select-all="question-mode"]');
    await click('[data-category-choice]');
    check(await page.locator('[data-selection-count="category"]').textContent() === '1 of 2 selected', 'Manual checkbox selection count stale');
    await click('#timed-mode-choice');
    await page.locator('#custom-count').fill('13');
    await click('#start-custom-review');
    const args = await page.evaluate(() => window.__buildArgs);
    check(args[0] === 13 && args[2][0] === 'Leadership & Professional Practice' && args[3][0] === 'Management of Care', 'Builder did not pass selected count/focus');
    check(args[6].length === 3 && args[7].length === 5, 'Bulk types/history did not reach practice selection');
    check(args[8].tutorMode && args[8].timedMode, 'Mode settings changed');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded builder overflow at ' + width);
  }
  check(!errors.length, 'Browser errors: ' + errors.join('; '));
  check(!remote.length, 'Unexpected live database requests');
  return 'Passed builder layout and bulk-selection checks at 1440px, 1024px, 768px, 390px, and 320px, question-type text containment and wrapping, topic search, tab persistence, counts, disabled states, and practice settings; no live data.';
}

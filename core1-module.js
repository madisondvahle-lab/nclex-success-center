(function () {
  'use strict';

  const moduleKey = 'core-safety-priority';
  const topicKeys = ['priority-frameworks', 'delegation', 'blood-administration', 'infection-prevention', 'procedure-safety'];
  const diagramTypes = ['flow', 'decision', 'response', 'layers', 'checkpoint'];
  const diagramSizes = [3, 2, 4, 2, 1];
  const practiceUrl = 'supplemental-practice.html?set=safety-priority-01';

  function isText(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 5000;
  }

  function validate(content) {
    if (!content || content.version !== 1 || content.moduleKey !== moduleKey ||
        !isText(content.intro) || !Array.isArray(content.lessons) || content.lessons.length !== topicKeys.length) {
      throw new Error('Core 1 lesson file is invalid. Contact Madison for help.');
    }
    for (const [index, lesson] of content.lessons.entries()) {
      if (!lesson || lesson.key !== topicKeys[index] ||
          !['title', 'nav', 'lead', 'recognize', 'action', 'trap', 'review'].every(key => isText(lesson[key])) ||
          !Array.isArray(lesson.body) || !lesson.body.length || !lesson.body.every(isText) ||
          !lesson.diagram || lesson.diagram.type !== diagramTypes[index] ||
          !isText(lesson.diagram.title) || !isText(lesson.diagram.caption) ||
          !Array.isArray(lesson.diagram.items) || lesson.diagram.items.length !== diagramSizes[index] ||
          !lesson.diagram.items.every(item => item && isText(item.title) && isText(item.text)) ||
          (lesson.example && (!isText(lesson.example.prompt) || !isText(lesson.example.reasoning))) ||
          (lesson.precautions && (!Array.isArray(lesson.precautions) || !lesson.precautions.length || !lesson.precautions.every(row =>
            row && ['name', 'protection', 'examples'].every(key => isText(row[key]))))) ||
          (lesson.memory && !isText(lesson.memory)) ||
          (lesson.mnemonic && (!isText(lesson.mnemonic.title) || !isText(lesson.mnemonic.caution) ||
            !Array.isArray(lesson.mnemonic.entries) || !lesson.mnemonic.entries.length ||
            !lesson.mnemonic.entries.every(entry => entry && isText(entry.letter) && isText(entry.text))))) {
        throw new Error('Core 1 lesson file is incomplete. Contact Madison for help.');
      }
    }
    return content;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(text, href, className) {
    const node = el('a', className, text);
    node.href = href;
    return node;
  }

  function diagram(data) {
    const figure = el('figure', 'diagram');
    figure.append(el('div', 'diagram-title', data.title));
    const list = el('ol', `teaching-graphic ${data.type}`);
    for (const [index, item] of data.items.entries()) {
      const row = el('li');
      const marker = el('span', 'graphic-marker', data.type === 'checkpoint' ? 'Ⅱ' : String(index + 1));
      marker.setAttribute('aria-hidden', 'true');
      const text = el('div');
      text.append(el('strong', '', item.title), el('p', '', item.text));
      row.append(marker, text);
      list.append(row);
    }
    figure.append(list, el('figcaption', '', data.caption));
    return figure;
  }

  function render(content, root) {
    root.querySelector('#core1-state').remove();
    const main = el('div', 'core1-content');
    main.append(link('Skip to lessons', '#priority-frameworks', 'skip'));
    const hero = el('section', 'hero');
    const intro = el('div');
    intro.append(el('h1', '', 'Safe Care, Priorities & Delegation'), el('p', '', content.intro));
    const start = el('div', 'start-row');
    start.append(link('Start refresher →', '#priority-frameworks', 'button'), el('span', '', 'Jump to any topic. No locked steps.'));
    intro.append(start);
    const habit = el('aside', 'hero-art');
    habit.setAttribute('aria-label', 'Clinical reasoning reminder');
    habit.append(el('h2', '', 'One habit. Safer decisions.'));
    const steps = el('ol', 'reasoning');
    for (const [heading, prompt] of [
      ['Notice the cue', 'What is new or different?'],
      ['Identify the risk', 'What could happen if this waits?'],
      ['Choose the safe action', 'What needs to happen now?'],
      ['Reassess', "Did the client's response change?"]
    ]) {
      const row = el('li');
      row.append(el('strong', '', heading), el('span', '', prompt));
      steps.append(row);
    }
    habit.append(steps, el('p', 'sub', 'A reasoning habit, not a substitute for emergency protocols.'));
    hero.append(intro, habit);
    main.append(hero);
    const layout = el('div', 'body-layout');
    const nav = el('nav', 'outline');
    nav.setAttribute('aria-label', 'Core 1 topics');
    nav.append(el('h2', '', 'In this module'));
    const outline = el('ol');
    const lessons = el('div', 'lessons');
    for (const [index, lesson] of content.lessons.entries()) {
      const item = el('li');
      item.append(link(lesson.nav, `#${lesson.key}`));
      outline.append(item);
      const section = el('section', 'lesson');
      section.id = lesson.key;
      section.setAttribute('aria-labelledby', `${lesson.key}-title`);
      const heading = el('h2', '', lesson.title);
      heading.id = `${lesson.key}-title`;
      section.append(heading, el('p', 'lead', lesson.lead));
      for (const paragraph of lesson.body) section.append(el('p', '', paragraph));
      section.append(diagram(lesson.diagram));
      if (lesson.precautions) {
        const comparison = el('div', 'precautions-comparison');
        comparison.setAttribute('role', 'region');
        comparison.setAttribute('aria-label', 'Precautions comparison');
        comparison.tabIndex = 0;
        const table = el('table');
        table.append(el('caption', '', 'Precautions at a glance'));
        const head = el('thead');
        const headRow = el('tr');
        for (const text of ['Precaution', 'Protection / room', 'Examples']) {
          const cell = el('th', '', text);
          cell.scope = 'col';
          headRow.append(cell);
        }
        head.append(headRow);
        const body = el('tbody');
        for (const row of lesson.precautions) {
          const tr = el('tr');
          const name = el('th', '', row.name);
          name.scope = 'row';
          tr.append(name, el('td', '', row.protection), el('td', '', row.examples));
          body.append(tr);
        }
        table.append(head, body);
        comparison.append(table);
        section.append(comparison);
      }
      if (lesson.memory) section.append(el('p', 'memory', lesson.memory));
      if (lesson.mnemonic) {
        const details = el('details', 'mnemonic');
        details.append(el('summary', '', lesson.mnemonic.title));
        const entries = el('ul', 'mnemonic-entries');
        for (const entry of lesson.mnemonic.entries) {
          const item = el('li');
          item.append(el('strong', 'mnemonic-letter', entry.letter), el('span', '', entry.text));
          entries.append(item);
        }
        details.append(entries, el('p', 'trap', lesson.mnemonic.caution));
        section.append(details);
      }
      const actions = el('div', 'actions');
      for (const [label, text] of [['Recognize this', lesson.recognize], ['Do this', lesson.action]]) {
        const action = el('div');
        action.append(el('h3', '', label), el('p', '', text));
        actions.append(action);
      }
      const trap = el('p', 'trap');
      trap.append(el('strong', '', "Don't fall for this: "), document.createTextNode(lesson.trap));
      section.append(actions, trap);
      if (lesson.example) {
        const details = el('details');
        details.append(el('summary', '', lesson.example.prompt), el('p', '', lesson.example.reasoning));
        section.append(details);
      }
      const previous = index ? content.lessons[index - 1] : null;
      const next = content.lessons[index + 1];
      const navigation = el('nav', 'lesson-navigation');
      navigation.setAttribute('aria-label', `${lesson.nav} lesson navigation`);
      if (previous) navigation.append(link(`← ${previous.nav}`, `#${previous.key}`));
      navigation.append(link(next ? `Next: ${next.nav} →` : 'Next: Knowledge check →', next ? `#${next.key}` : '#knowledge-check'));
      section.append(navigation);
      lessons.append(section);
    }
    for (const [id, title] of [['knowledge-check', 'Short knowledge check →'], ['review', 'What to revisit']]) {
      const item = el('li');
      item.append(link(title, `#${id}`));
      outline.append(item);
    }
    nav.append(outline);
    const practice = el('section', 'practice');
    practice.id = 'knowledge-check';
    practice.append(el('h2', '', 'A little practice. A clearer next step.'),
      el('p', '', "Try the existing 5-question safety check. Read the rationales, then revisit the topic you couldn't confidently explain."),
      link('Open knowledge check →', practiceUrl, 'button'),
      el('small', '', 'Use Back to return to this module. Covers selected priorities, delegation, falls, bleeding, and fire safety—not every topic in this module.'));
    lessons.append(practice);
    const review = el('section', 'lesson');
    review.id = 'review';
    review.append(el('h2', '', 'What needs another look?'), el('p', '', "You don't need to reread everything. Choose the decision you couldn't explain."));
    const reviews = el('ul', 'review-list');
    for (const lesson of content.lessons) {
      const item = el('li');
      item.append(link(lesson.review, `#${lesson.key}`));
      reviews.append(item);
    }
    review.append(reviews);
    lessons.append(review);
    layout.append(nav, lessons);
    main.append(layout);
    root.append(main);
    const fragment = window.location.hash.slice(1);
    const target = topicKeys.includes(fragment) || ['knowledge-check', 'review'].includes(fragment) ?
      document.getElementById(fragment) : null;
    if (target) target.scrollIntoView();
  }

  async function mount(root) {
    document.body.classList.add('core1-page');
    root.className = 'core1';
    root.replaceChildren();
    const header = el('header', 'top');
    header.append(el('span', 'brand', 'Study With Madison, RN'), link('Learning Library', 'student-dashboard.html'));
    root.append(header);
    const state = el('section', 'state');
    state.id = 'core1-state';
    state.setAttribute('role', 'status');
    const showState = (title, message, retry) => {
      root.querySelector('.core1-content')?.remove();
      root.querySelector('.skip')?.remove();
      state.replaceChildren(el('h1', '', title), el('p', '', message));
      if (retry) {
        const button = el('button', 'button', 'Try again');
        button.type = 'button';
        button.addEventListener('click', load, { once: true });
        state.append(button);
      }
      state.append(link('Sign in', 'student-login.html', 'signin-link'));
      if (!state.isConnected) root.append(state);
    };
    root.append(state);
    if (!window.supabase) {
      showState('Core 1 could not load', 'The sign-in service is unavailable. Reload this page to try again.', false);
      return;
    }
    const db = window.supabase.createClient('https://pmjwwktwlsqpetwfvolb.supabase.co', 'sb_publishable_MDgerX5UJd44TlYgMOalDw_DqNMvxfT');
    let generation = 0;
    const { data: authListener } = db.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        generation++;
        showState('Please sign in', 'Your session has ended. Sign in to continue Core 1.', false);
      }
    });
    window.addEventListener('pagehide', () => {
      generation++;
      authListener.subscription.unsubscribe();
      root.querySelector('.core1-content')?.remove();
    }, { once: true });
    window.addEventListener('pageshow', event => {
      if (event.persisted) window.location.reload();
    });

    async function load() {
      const request = ++generation;
      showState('Opening Core 1', 'Checking your sign-in and loading your refresher…', false);
      try {
        const { data: sessionData, error: sessionError } = await db.auth.getSession();
        if (request !== generation) return;
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          window.location.replace('student-login.html');
          return;
        }
        const { data: userData, error: userError } = await db.auth.getUser();
        if (request !== generation) return;
        if (userError) throw userError;
        if (!userData.user) throw new Error('Please sign in again to open Core 1.');
        const { data: file, error: fileError } = await db.storage.from('module-lessons').download(`${moduleKey}.json`);
        if (request !== generation) return;
        if (fileError) throw fileError;
        if (!file || file.size > 524288) throw new Error('Core 1 lesson file could not be read.');
        const content = validate(JSON.parse(await file.text()));
        if (request !== generation) return;
        render(content, root);
      } catch (error) {
        if (request !== generation) return;
        console.error('Core 1 module load failed:', error);
        showState('Core 1 could not load', 'Please try again. If it still will not open, contact Madison; the lesson file may not be available yet.', true);
      }
    }
    await load();
  }

  window.Core1Module = { mount, validate };
})();

(function () {
  'use strict';

  const form = document.getElementById('assessment-form');
  if (!form || !window.ArcherCAT || !window.AssessmentImport) return;

  const platform = document.getElementById('platform');
  const panel = document.getElementById('archer-panel');
  const scoreInputs = document.getElementById('scores');
  const saveButton = document.getElementById('save');
  const status = document.getElementById('status');
  const ocrReview = document.getElementById('archer-ocr-reviewed');
  const ocrReviewWrap = document.getElementById('archer-ocr-review-wrap');
  const files = { classic: [], ngn: [] };
  const uploaded = new Set();
  let savedAssessment = null;
  let archerHistoryLoaded = false;
  let pendingOcr = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const keyFor = (section, file) => `${section}|${file.name}|${file.size}|${file.lastModified}`;
  const inputFor = (section, category, field) => form.querySelector(
    `[data-archer-view="client_need"][data-archer-section="${section}"][data-archer-category="${CSS.escape(category)}"][data-archer-field="${field}"]`
  );
  const subjectInputFor = (section, subject, field) => form.querySelector(
    `[data-archer-view="subject_lesson"][data-archer-section="${section}"][data-archer-subject="${CSS.escape(subject)}"][data-archer-field="${field}"]`
  );

  function buildCategoryRows() {
    document.getElementById('archer-category-rows').innerHTML = ArcherCAT.categories.map(category => {
      const fields = [
        ['classic', 'score', 'Classic percentage', '0.1', '0-100'],
        ['classic', 'peer_score', 'Classic peer value', '0.1', 'Reported value'],
        ['classic', 'peer_score_unit', 'Classic peer unit', '1', ''],
        ['classic', 'question_count', 'Classic questions', '1', 'Count'],
        ['classic', 'earned_points', 'Classic earned points', '0.01', 'Optional'],
        ['classic', 'possible_points', 'Classic possible points', '0.01', 'Optional'],
        ['ngn', 'score', 'NGN percentage', '0.1', '0-100'],
        ['ngn', 'peer_score', 'NGN peer value', '0.1', 'Reported value'],
        ['ngn', 'peer_score_unit', 'NGN peer unit', '1', ''],
        ['ngn', 'question_count', 'NGN questions', '1', 'Count'],
        ['ngn', 'earned_points', 'NGN earned points', '0.01', 'Optional'],
        ['ngn', 'possible_points', 'NGN possible points', '0.01', 'Optional']
      ];
      return `<tr><th scope="row">${esc(category)}</th>${fields.map(([section, field, label, step, placeholder]) => {
        const attrs = `aria-label="${esc(label)} · ${esc(category)}" data-archer-view="client_need" data-archer-section="${section}" data-archer-category="${esc(category)}" data-archer-field="${field}"`;
        const control = field === 'peer_score_unit'
          ? `<select ${attrs}><option value="">Unclear</option><option value="percent">Percent</option><option value="points">Points</option></select>`
          : `<input type="number" min="0" ${field === 'score' || (field === 'peer_score' && section === 'classic') ? 'max="100"' : ''} step="${step}" placeholder="${placeholder}" ${attrs}>`;
        return `<td>${control}</td>`;
      }).join('')}</tr>`;
    }).join('');
  }

  function collectSubjectSection(section) {
    const subjects = {};
    [...document.querySelectorAll('#archer-subject-rows [data-archer-subject-name]')].forEach(row => {
      const subject = row.dataset.archerSubjectName;
      const scoreInput = subjectInputFor(section, subject, 'score');
      const peerInput = subjectInputFor(section, subject, 'peer_score');
      const unitInput = subjectInputFor(section, subject, 'peer_score_unit');
      const countInput = subjectInputFor(section, subject, 'question_count');
      const score = numeric(scoreInput, `${subject} ${section} score`, { maximum: 100 });
      const peerUnit = unitInput.value;
      const peer = numeric(peerInput, `${subject} ${section} peer score`,
        peerUnit === 'percent' ? { maximum: 100 } : {});
      const questionCount = numeric(countInput, `${subject} ${section} question count`, { integer: true });
      if (peer != null && !['percent', 'points'].includes(peerUnit)) {
        throw new Error(`${subject} ${section} peer value needs an explicitly selected unit.`);
      }
      if (score != null || peer != null || questionCount != null) {
        subjects[subject] = {
          score_percent: score,
          ...(peer == null ? {} : { peer_score: peer, peer_score_unit: peerUnit }),
          question_count: questionCount
        };
      }
    });
    return { subjects };
  }

  function ensureSubjectRow(subject) {
    const target = document.getElementById('archer-subject-rows');
    if ([...target.querySelectorAll('[data-archer-subject-name]')].some(row => row.dataset.archerSubjectName === subject)) return;
    const escapeSelector = value => CSS.escape(value);
    const makeFields = section => [
      ['score', 'Score %', '0.1', '0-100'],
      ['peer_score', 'Peer value', '0.1', 'Reported value'],
      ['peer_score_unit', 'Peer unit', '1', ''],
      ['question_count', 'Questions', '1', 'Count']
    ].map(([field, label, step, placeholder]) => {
      const input = field === 'peer_score_unit'
        ? `<select aria-label="${esc(section.toUpperCase())} ${esc(label)} · ${esc(subject)}" data-archer-view="subject_lesson" data-archer-section="${section}" data-archer-subject="${esc(subject)}" data-archer-field="${field}"><option value="">Unclear</option><option value="percent">Percent</option><option value="points">Points</option></select>`
        : `<input type="number" min="0" ${field === 'score' ? 'max="100"' : ''} step="${step}" placeholder="${placeholder}" aria-label="${esc(section.toUpperCase())} ${esc(label)} · ${esc(subject)}" data-archer-view="subject_lesson" data-archer-section="${section}" data-archer-subject="${esc(subject)}" data-archer-field="${field}">`;
      return `<td>${input}</td>`;
    }).join('');
    const row = document.createElement('tr');
    row.dataset.archerSubjectName = subject;
    row.innerHTML = `<th scope="row">${esc(subject)}</th>${makeFields('classic')}${makeFields('ngn')}`;
    target.appendChild(row);
  }

  function isArcher() {
    return /^archer(?:\s|$|-)/i.test(platform.value.trim());
  }

  function toggleArcher() {
    if (savedAssessment && !isArcher()) platform.value = 'Archer';
    const active = isArcher();
    panel.hidden = !active;
    scoreInputs.hidden = active;
    ['assessment-name', 'taken-at'].forEach(id => {
      document.getElementById(id).required = active;
    });
    ['overall-score', 'readiness', 'notes'].forEach(id => {
      const element = document.getElementById(id);
      element.closest('div').hidden = active;
    });
    updateOcrReviewRequirement();
  }

  function updateOcrReviewRequirement() {
    const hasScreenshots = files.classic.length > 0 || files.ngn.length > 0;
    const hasOcrCandidates = Boolean(form.querySelector('[data-archer-field][data-ocr-candidate="true"]'));
    const needsReview = isArcher() && (hasScreenshots || hasOcrCandidates);
    ocrReview.required = needsReview;
    ocrReviewWrap.hidden = !needsReview;
    if (!needsReview) ocrReview.checked = false;
  }

  function updateTotalFromSections() {
    const total = document.getElementById('archer-total-questions');
    if (!total.dataset.derived) return;
    const classic = document.getElementById('archer-classic-questions').value;
    const ngn = document.getElementById('archer-ngn-questions').value;
    total.value = classic !== '' && ngn !== '' ? String(Number(classic) + Number(ngn)) : '';
  }

  function drawPreviews(section) {
    const target = document.getElementById(`archer-${section}-previews`);
    target.innerHTML = files[section].map((entry, index) => `
      <div class="archer-preview">
        <img src="${entry.url}" alt="${esc(section.toUpperCase())} screenshot preview: ${esc(entry.file.name)}">
        <div title="${esc(entry.file.name)}">${esc(entry.file.name)}</div>
        <button type="button" data-remove-section="${section}" data-remove-index="${index}" ${uploaded.has(keyFor(section, entry.file)) ? 'disabled' : ''}>${uploaded.has(keyFor(section, entry.file)) ? 'Uploaded' : 'Remove'}</button>
      </div>`).join('');
    target.querySelectorAll('[data-remove-section]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.removeIndex);
      const [removed] = files[section].splice(index, 1);
      URL.revokeObjectURL(removed.url);
      updateOcrReviewRequirement();
      drawPreviews(section);
    }));
  }

  function addValue(section, category, field, value, view = 'client_need') {
    if (value == null || value === '') return 'missing';
    const input = view === 'subject_lesson'
      ? subjectInputFor(section, category, field)
      : inputFor(section, category, field);
    return addInputValue(input, value);
  }

  function addInputValue(input, value) {
    if (value == null || value === '') return 'missing';
    if (!input) return 'missing';
    if (input.dataset.userEdited === 'true') return 'conflict';
    if (input.value !== '') {
      const current = Number(input.value), candidate = Number(value);
      return Number.isFinite(current) && Number.isFinite(candidate)
        ? current === candidate ? 'same' : 'conflict'
        : input.value === String(value) ? 'same' : 'conflict';
    }
    input.value = value;
    input.dataset.ocrCandidate = 'true';
    updateOcrReviewRequirement();
    ocrReview.checked = false;
    return 'added';
  }

  async function readScreenshots(section, newEntries) {
    const target = document.getElementById(`archer-${section}-message`);
    pendingOcr++;
    saveButton.disabled = true;
    target.textContent = 'Reading screenshot text in this browser. Review every detected value.';
    let found = 0, conflicts = 0, warnings = [];
    try {
      for (const entry of newEntries) {
        try {
          const result = await AssessmentImport.readArcherStats(entry.file, section);
          if (result.section !== section) {
            warnings.push(`${entry.file.name}: selected as ${String(result.section || 'unknown').toUpperCase()}, expected ${section.toUpperCase()}; no values imported.`);
            continue;
          }
          entry.view = result.view;
          if (result.view === 'client_need') {
            Object.entries(result.categories || {}).forEach(([category, values]) => {
              const canonical = ArcherCAT.categoryName(category);
              if (!canonical) return;
              ['score', 'peer_score', 'question_count'].forEach(field => {
                const state = addValue(section, canonical, field, values[field], 'client_need');
                if (state === 'added') found++;
                if (state === 'conflict') conflicts++;
              });
              const unitState = addValue(section, canonical, 'peer_score_unit', values.peer_score_unit, 'client_need');
              if (unitState === 'added') found++;
              if (unitState === 'conflict') conflicts++;
            });
          } else if (result.view === 'subject_lesson') {
            Object.entries(result.subjects || {}).forEach(([subject, values]) => {
              ensureSubjectRow(subject);
              ['score', 'peer_score', 'peer_score_unit', 'question_count'].forEach(field => {
                const state = addValue(section, subject, field, values[field], 'subject_lesson');
                if (state === 'added') found++;
                if (state === 'conflict') conflicts++;
              });
            });
          } else {
            warnings.push(`${entry.file.name}: report view is ambiguous; no values imported.`);
            continue;
          }
          const topFields = section === 'classic'
            ? [
                ['archer-classic-overall', result.overall_percent],
                ['archer-classic-questions', result.question_count],
                ['archer-classic-correct', result.result_counts?.correct],
                ['archer-classic-incorrect', result.result_counts?.incorrect],
                ['archer-classic-omitted', result.result_counts?.omitted]
              ]
            : [
                ['archer-ngn-overall', result.overall_percent],
                ['archer-ngn-questions', result.question_count],
                ['archer-ngn-earned', result.overall_points?.earned_points],
                ['archer-ngn-possible', result.overall_points?.possible_points]
              ];
          if (result.view === 'client_need') topFields.forEach(([id, value]) => {
            const state = addInputValue(document.getElementById(id), value);
            if (state === 'added') found++;
            if (state === 'conflict') conflicts++;
          });
          if (result.view === 'subject_lesson' && section === 'ngn') {
            [['archer-ngn-overall', result.overall_percent], ['archer-ngn-questions', result.question_count],
              ['archer-ngn-earned', result.overall_points?.earned_points], ['archer-ngn-possible', result.overall_points?.possible_points]]
              .forEach(([id, value]) => {
                const state = addInputValue(document.getElementById(id), value);
                if (state === 'added') found++;
                if (state === 'conflict') conflicts++;
              });
          }
          if (result.warning) warnings.push(`${entry.file.name}: ${result.warning}`);
        } catch (error) {
          target.textContent = `OCR could not read ${entry.file.name}: ${error.message || 'review the screenshot and enter values manually'}`;
          return;
        }
      }
      updateTotalFromSections();
      const summary = found
        ? `OCR filled ${found} candidate field(s); verify them against the screenshot before saving.${conflicts ? ` ${conflicts} conflicting field(s) were left unchanged.` : ''}`
        : 'No values were recognized. Review the screenshot and enter verified values manually.';
      target.textContent = [summary, ...warnings].join(' ');
    } finally {
      pendingOcr--;
      saveButton.disabled = pendingOcr > 0;
    }
  }

  function handleFiles(section, input) {
    const incoming = [...input.files];
    input.value = '';
    const added = [];
    const message = document.getElementById(`archer-${section}-message`);
    incoming.forEach(file => {
      const isSupported = ['image/png', 'image/jpeg'].includes(file.type) || /\.(png|jpe?g)$/i.test(file.name);
      if (!isSupported) {
        message.textContent = `${file.name} is not a PNG or JPEG image.`;
        return;
      }
      if (file.size > 10485760) {
        message.textContent = `${file.name} exceeds the 10 MB upload limit.`;
        return;
      }
      if (files[section].some(entry => keyFor(section, entry.file) === keyFor(section, file))) return;
      const entry = { file, url: URL.createObjectURL(file) };
      files[section].push(entry);
      added.push(entry);
    });
    drawPreviews(section);
    if (added.length) {
      ocrReview.checked = false;
      updateOcrReviewRequirement();
      readScreenshots(section, added);
    }
  }

  function numeric(field, label, options = {}) {
    const input = typeof field === 'string' ? document.getElementById(field) : field;
    const raw = input.value.trim();
    if (raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < (options.minimum || 0) ||
        (options.maximum != null && value > options.maximum) ||
        (options.integer && !Number.isInteger(value))) {
      throw new Error(`${label} is invalid.`);
    }
    return value;
  }

  function pair(earnedId, possibleId, label) {
    const earned = numeric(earnedId, `${label} earned points`);
    const possible = numeric(possibleId, `${label} possible points`);
    if ((earned == null) !== (possible == null)) throw new Error(`Enter both ${label} earned and possible points, or leave both blank.`);
    if (earned == null) return null;
    if (possible <= 0 || earned > possible) throw new Error(`${label} point totals are inconsistent.`);
    return { earned_points: earned, possible_points: possible };
  }

  function collectSection(section) {
    const isClassic = section === 'classic';
    const overallId = isClassic ? 'archer-classic-overall' : 'archer-ngn-overall';
    const points = pair(
      isClassic ? 'archer-classic-earned' : 'archer-ngn-earned',
      isClassic ? 'archer-classic-possible' : 'archer-ngn-possible',
      `${section.toUpperCase()} overall`
    );
    const reportedOverall = numeric(overallId, `${section.toUpperCase()} overall percentage`, { maximum: 100 });
    const categories = {};
    ArcherCAT.categories.forEach(category => {
      const score = numeric(inputFor(section, category, 'score'), `${category} ${section} score`, { maximum: 100 });
      const peerUnit = inputFor(section, category, 'peer_score_unit').value;
      const peer = numeric(inputFor(section, category, 'peer_score'), `${category} ${section} peer score`,
        peerUnit === 'percent' ? { maximum: 100 } : {});
      if (peer != null && !['percent', 'points'].includes(peerUnit)) {
        throw new Error(`${category} ${section} peer value needs an explicitly selected unit.`);
      }
      const questionCount = numeric(inputFor(section, category, 'question_count'), `${category} ${section} question count`, { integer: true });
      const categoryPoints = pair(
        inputFor(section, category, 'earned_points'),
        inputFor(section, category, 'possible_points'),
        `${category} ${section}`
      );
      if (score != null || peer != null || questionCount != null || categoryPoints) {
        if (questionCount === 0 && (score != null || categoryPoints)) {
          throw new Error(`${category} ${section} has a score but zero reported questions.`);
        }
        categories[category] = {
          score_percent: score,
          calculated_score_percent: categoryPoints
            ? Math.round((categoryPoints.earned_points / categoryPoints.possible_points) * 10000) / 100
            : null,
          score_source: score == null
            ? categoryPoints ? 'earned-points-over-possible-points' : null
            : 'archer-reported',
          ...(peer == null ? {} : peerUnit === 'percent' ? { peer_score_percent: peer } : { peer_average_points: peer }),
          question_count: questionCount,
          earned_points: categoryPoints?.earned_points ?? null,
          possible_points: categoryPoints?.possible_points ?? null,
          status: questionCount === 0 ? 'not-tested' : score == null && !categoryPoints ? 'not-reported' : 'reported'
        };
      }
    });
    const count = numeric(isClassic ? 'archer-classic-questions' : 'archer-ngn-questions',
      `${section.toUpperCase()} question count`, { integer: true });
    const calculatedOverall = points
      ? Math.round((points.earned_points / points.possible_points) * 10000) / 100
      : null;
    const resultCounts = isClassic ? {
    correct: numeric('archer-classic-correct', 'Classic correct count', { integer: true }),
    incorrect: numeric('archer-classic-incorrect', 'Classic incorrect count', { integer: true }),
    omitted: numeric('archer-classic-omitted', 'Classic omitted count', { integer: true })
    } : null;
    if (resultCounts && Object.values(resultCounts).some(value => value != null)) {
    if (Object.values(resultCounts).some(value => value == null)) {
      throw new Error('Enter all three Classic correct, incorrect, and omitted counts, or leave them all blank.');
    }
    if (count != null && resultCounts.correct + resultCounts.incorrect + resultCounts.omitted !== count) {
      throw new Error('Classic correct, incorrect, and omitted counts must equal the Classic question count.');
    }
    }
    return {
      overall_percent: reportedOverall,
      calculated_overall_percent: calculatedOverall,
      overall_score_source: reportedOverall == null
        ? calculatedOverall == null ? null : 'earned-points-over-possible-points'
        : 'archer-reported',
      overall_points: points,
      question_count: count,
      categories,
      ...(resultCounts && Object.values(resultCounts).every(value => value != null) ? { result_counts: resultCounts } : {})
    };
  }

  function collectRecord() {
    const classic = collectSection('classic');
    const ngn = collectSection('ngn');
    const subjectClassic = collectSubjectSection('classic');
    const subjectNgn = collectSubjectSection('ngn');
    const combined = ArcherCAT.combine(classic, ngn);
    const total = numeric('archer-total-questions', 'Total question count', { integer: true });
    const derivedTotal = classic.question_count != null && ngn.question_count != null
      ? classic.question_count + ngn.question_count
      : null;
    const result = document.getElementById('archer-result').value;
    if (!result) throw new Error('Select Pass or Fail for this Archer CAT.');
    const assessmentName = document.getElementById('assessment-name').value.trim();
    const takenAt = document.getElementById('taken-at').value;
    if (!assessmentName) throw new Error('Enter the CAT name or number.');
    if (!takenAt) throw new Error('Enter the assessment date.');
    if (total != null && derivedTotal != null && total !== derivedTotal) {
      throw new Error('Total questions do not equal Classic plus NGN questions. Correct the counts before saving.');
    }
    const categoryScores = {}, categoryCounts = {};
    ArcherCAT.categories.forEach(category => {
      const score = combined.categories[category]?.score;
      if (score != null) categoryScores[category] = score;
      const classicCount = classic.categories[category]?.question_count;
      const ngnCount = ngn.categories[category]?.question_count;
      if (classicCount != null && ngnCount != null) categoryCounts[category] = classicCount + ngnCount;
    });
    const screenshots = [
      ...files.classic.map(entry => ({ section: 'classic', view: entry.view, file: entry.file })),
      ...files.ngn.map(entry => ({ section: 'ngn', view: entry.view, file: entry.file }))
    ];
    return {
      result,
      classic,
      ngn,
      subjectLesson: {
        classic: subjectClassic,
        ngn: subjectNgn
      },
      combined,
      totalQuestions: total ?? derivedTotal,
      categoryScores,
      categoryCounts,
      screenshots
    };
  }

  async function uploadFile(file, assessment, section, view) {
    if (file.size > 10485760) throw new Error(`${file.name} exceeds the 10 MB upload limit.`);
    const extension = file.name.toLowerCase();
    const mime = file.type || (extension.endsWith('.png') ? 'image/png'
      : extension.endsWith('.pdf') ? 'application/pdf'
        : extension.endsWith('.csv') ? 'text/csv'
          : extension.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    const allowed = section === 'report'
      ? ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv']
      : ['image/jpeg', 'image/png'];
    if (!allowed.includes(mime)) throw new Error(`${file.name} has an unsupported file type.`);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${assessment.student_id}/${assessment.id}/${section}-${Date.now()}-${safe}`;
    const { error: uploadError } = await db.storage.from('assessment-reports').upload(path, file, {
      contentType: mime,
      upsert: false
    });
    if (uploadError) throw uploadError;
    const { error: metadataError } = await db.from('assessment_report_files').insert({
      assessment_id: assessment.id,
      student_id: assessment.student_id,
      storage_path: path,
      original_filename: file.name,
      mime_type: mime,
      byte_size: file.size,
      uploaded_by: currentUser.id,
      section,
      report_view: view || 'not_applicable'
    });
    if (metadataError) {
      const { error: cleanupError } = await db.storage.from('assessment-reports').remove([path]);
      if (cleanupError) throw new Error(`${metadataError.message}; the uploaded file could not be cleaned up: ${cleanupError.message}`);
      throw metadataError;
    }
  }

  async function submitArcher() {
    saveButton.disabled = true;
    try {
      if (!savedAssessment) {
          const record = collectRecord();
        const rawOverallPoints = record.combined.overall;
        const payload = {
          student_id: document.getElementById('student').value,
          platform: 'Archer',
          assessment_name: document.getElementById('assessment-name').value.trim(),
          taken_at: document.getElementById('taken-at').value,
          overall_score: rawOverallPoints.score,
          readiness_level: record.result,
          category_scores: record.categoryScores,
          category_counts: record.categoryCounts,
          archer_cat_data: {
            version: 1,
            result: record.result,
            total_questions: record.totalQuestions,
            classic: record.classic,
            ngn: record.ngn,
            subject_lesson: record.subjectLesson,
            combined: record.combined,
            capture_method: form.querySelector('[data-ocr-candidate="true"]')
              ? 'browser-ocr-reviewed'
              : record.screenshots.length ? 'screenshot-manual-review' : 'manual-entry',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
          },
          entered_by: currentUser.id,
          notes: ''
        };
        const { data, error } = await db.from('external_assessments').insert(payload).select('id,student_id').single();
        if (error) throw error;
        savedAssessment = data;
        form.dataset.savedArcherAssessment = data.id;
      }

      const pending = [
        ...files.classic.map(entry => ({ section: 'classic', view: entry.view, file: entry.file })),
        ...files.ngn.map(entry => ({ section: 'ngn', view: entry.view, file: entry.file }))
      ];
      const report = document.getElementById('report-file').files[0];
      if (report) pending.push({ section: 'report', view: 'not_applicable', file: report });
      for (const item of pending) {
        const key = keyFor(item.section, item.file);
        if (uploaded.has(key)) continue;
        await uploadFile(item.file, savedAssessment, item.section, item.view);
        uploaded.add(key);
        if (item.section === 'classic' || item.section === 'ngn') drawPreviews(item.section);
      }

      const assessmentId = savedAssessment.id;
      const hasFiles = uploaded.size > 0;
      form.reset();
      form.querySelectorAll('[data-ocr-candidate], [data-user-edited]').forEach(input => {
        delete input.dataset.ocrCandidate;
        delete input.dataset.userEdited;
      });
      Object.values(files).flat().forEach(entry => URL.revokeObjectURL(entry.url));
      files.classic = [];
      files.ngn = [];
      uploaded.clear();
      savedAssessment = null;
      delete form.dataset.savedArcherAssessment;
      toggleArcher();
      drawPreviews('classic');
      drawPreviews('ngn');
      status.textContent = `Archer CAT saved as one assessment${hasFiles ? ' with its uploaded reports' : ''}. Combined scores use actual earned/possible points only.`;
      status.className = 'status success';
      if (typeof window.loadHistory === 'function') await window.loadHistory();
      return assessmentId;
    } catch (error) {
      status.textContent = savedAssessment
        ? `Assessment ${savedAssessment.id} is already saved, but an attachment failed: ${error.message || 'retry to upload the remaining files; do not save another CAT.'}`
        : error.message || 'Could not save this Archer CAT.';
      status.className = 'status error';
    } finally {
      saveButton.disabled = false;
    }
  }

  buildCategoryRows();
  platform.addEventListener('input', toggleArcher);
  platform.addEventListener('change', toggleArcher);
  ['archer-classic-questions', 'archer-ngn-questions'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateTotalFromSections);
  });
  document.getElementById('archer-total-questions').addEventListener('input', event => {
    event.target.dataset.derived = '';
  });
  form.addEventListener('input', event => {
    const overallFields = [
      'archer-classic-overall', 'archer-ngn-overall',
      'archer-classic-questions', 'archer-ngn-questions',
      'archer-classic-earned', 'archer-classic-possible',
      'archer-ngn-earned', 'archer-ngn-possible',
      'archer-classic-correct', 'archer-classic-incorrect', 'archer-classic-omitted'
    ];
    if (!event.target.matches('[data-archer-field]') && !overallFields.includes(event.target.id)) return;
    event.target.dataset.userEdited = 'true';
    if (ocrReview.checked) ocrReview.checked = false;
  });
  document.getElementById('archer-total-questions').dataset.derived = 'true';
  ['classic', 'ngn'].forEach(section => {
    document.getElementById(`archer-${section}-files`).addEventListener('change', event => handleFiles(section, event.currentTarget));
  });

  form.addEventListener('submit', event => {
    if (!isArcher() && !savedAssessment) return;
    if (isArcher() && pendingOcr) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status.textContent = 'Wait for screenshot reading to finish before saving.';
      status.className = 'status error';
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void submitArcher();
  }, true);

  const originalRenderHistory = window.renderHistory;
  const originalLoadHistory = window.loadHistory;
  if (typeof originalRenderHistory === 'function' && typeof originalLoadHistory === 'function') {
    let archerData = new Map();
    window.renderHistory = function (rows) {
      originalRenderHistory(rows);
      const visibleRows = (rows || []).filter(row => {
        const studentId = document.getElementById('student').value;
        return !studentId || row.student_id === studentId;
      });
      const cards = document.querySelectorAll('#history article.entry');
      cards.forEach((card, index) => {
        const row = visibleRows[index];
        const detail = row && archerData.get(row.id);
        if (!detail || !detail.classic || !detail.ngn) return;
        const combinedScore = detail.combined?.overall?.score;
        const cell = (section, category) => {
          const value = detail[section]?.categories?.[category];
          const count = value?.question_count;
          const score = value?.score_percent ?? value?.calculated_score_percent;
          const peerValue = value?.peer_score_percent ?? value?.peer_average_points;
          const peerUnit = value?.peer_score_percent != null ? '%' : value?.peer_average_points != null ? ' points' : '';
          const peer = peerValue == null ? '' : ` · peer ${Number(peerValue)}${peerUnit}`;
          if (score != null) return `${Number(score)}%${value.score_source === 'earned-points-over-possible-points' ? ' points-based' : ''}${peer}${count == null ? '' : ` · ${count} q${count < 3 ? ' · limited exposure' : ''}`}`;
          if (count === 0) return 'Not Tested';
          return 'Not Reported';
        };
        const rowsHtml = ArcherCAT.categories.map(category => `
          <tr><th scope="row">${esc(category)}</th><td>${esc(cell('classic', category))}</td><td>${esc(cell('ngn', category))}</td>
          <td>${detail.combined?.categories?.[category] ? `${Number(detail.combined.categories[category].score)}% (${Number(detail.combined.categories[category].earned_points)}/${Number(detail.combined.categories[category].possible_points)} pts)` : 'Insufficient Data'}</td></tr>`).join('');
        const subjectRows = section => Object.entries(detail.subject_lesson?.[section]?.subjects || {}).map(([subject, value]) => {
          const peer = value.peer_score == null ? 'Not Reported'
            : `${Number(value.peer_score)}${value.peer_score_unit === 'percent' ? '%' : value.peer_score_unit === 'points' ? ' points' : ' · unit unclear'}`;
          return `<tr><th scope="row">${esc(subject)}</th><td>${value.score_percent == null ? 'Not Reported' : `${esc(value.score_percent)}%`}</td><td>${esc(peer)}</td><td>${value.question_count == null ? 'Not Reported' : `${esc(value.question_count)} q`}</td></tr>`;
        }).join('');
        const subjectTables = ['classic', 'ngn'].map(section => {
          const rows = subjectRows(section);
          return rows ? `<h4>Subject/Lesson · ${section.toUpperCase()}</h4><div class="archer-matrix-wrap"><table class="archer-matrix"><thead><tr><th>Reported subject</th><th>Score</th><th>Peer value</th><th>Questions</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
        }).join('');
        const summary = document.createElement('div');
        summary.className = 'archer-assessment-detail';
        const combinedDetail = detail.combined?.overall;
        const combinedSummary = combinedScore == null ? 'Insufficient Data'
          : `${combinedScore}% (${combinedDetail.earned_points}/${combinedDetail.possible_points} points)`;
        summary.innerHTML = `
          <p><strong>${esc(detail.result || 'Result not recorded')}</strong>
          · Classic ${esc(detail.classic.overall_percent ?? detail.classic.calculated_overall_percent ?? 'Not Reported')}${detail.classic.overall_percent != null || detail.classic.calculated_overall_percent != null ? '%' : ''}${detail.classic.overall_score_source === 'earned-points-over-possible-points' ? ' (calculated from points)' : detail.classic.overall_score_source ? ' (provider-reported)' : ''}
          · NGN ${esc(detail.ngn.overall_percent ?? detail.ngn.calculated_overall_percent ?? 'Not Reported')}${detail.ngn.overall_percent != null || detail.ngn.calculated_overall_percent != null ? '%' : ''}${detail.ngn.overall_score_source === 'earned-points-over-possible-points' ? ' (calculated from points)' : detail.ngn.overall_score_source ? ' (provider-reported)' : ''}
          · Combined ${esc(combinedSummary)}</p>
          <p>Questions: ${esc(detail.total_questions ?? 'Not reported')} total · ${esc(detail.classic.question_count ?? 'Not reported')} Classic · ${esc(detail.ngn.question_count ?? 'Not reported')} NGN</p>
          <div class="archer-matrix-wrap"><table class="archer-matrix"><thead><tr><th>Client Needs</th><th>Classic % · peer value · #</th><th>NGN % · peer value · #</th><th>Combined %</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
          ${subjectTables}
          <p class="file-note">Classic and NGN percentages are provider-reported; combined values are calculated from actual point totals only.</p>
          ${detail.attachments?.length ? `<p class="file-note"><strong>Attached screenshots/reports:</strong> ${detail.attachments.map((file, fileIndex) => `<button class="top" type="button" data-archer-open="${fileIndex}">${esc(file.section === 'classic' ? 'Classic' : file.section === 'ngn' ? 'NGN' : 'Report')} · ${esc(file.report_view === 'subject_lesson' ? 'Subject/Lesson' : file.report_view === 'client_need' ? 'Client Need' : 'Report')}: ${esc(file.original_filename)}</button>`).join(' · ')}</p>` : ''}`;
        card.appendChild(summary);
        summary.querySelectorAll('[data-archer-open]').forEach(button => button.addEventListener('click', () => {
          const file = detail.attachments[Number(button.dataset.archerOpen)];
          if (file?.storage_path) window.openReport(file.storage_path);
        }));
      });
    };
    window.loadHistory = async function () {
      await originalLoadHistory();
      const { data, error } = await db.from('external_assessments')
        .select('id,archer_cat_data,assessment_report_files(section,report_view,storage_path,original_filename)')
        .not('archer_cat_data', 'is', null);
      if (error) {
        status.textContent = 'Archer detail history is unavailable. Confirm the Archer CAT migration has been applied.';
        status.className = 'status error';
        return;
      }
      archerData = new Map((data || []).map(row => [row.id, {
        ...row.archer_cat_data,
        attachments: row.assessment_report_files || []
      }]));
      archerHistoryLoaded = true;
      if (typeof assessmentRows !== 'undefined') window.renderHistory(assessmentRows);
    };
    const app = document.getElementById('app');
    if (app && !archerHistoryLoaded && !app.classList.contains('hidden')) {
      void window.loadHistory();
    } else if (app && !archerHistoryLoaded) {
      const observer = new MutationObserver(() => {
        if (app.classList.contains('hidden') || archerHistoryLoaded) return;
        observer.disconnect();
        void window.loadHistory();
      });
      observer.observe(app, { attributes: true, attributeFilter: ['class'] });
    }
  }

  toggleArcher();
}());

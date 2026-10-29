(function (root) {
  'use strict';
  const methods = {
    license: 'Public nursing license verification',
    official: 'Official examination result documentation',
    quick_results: 'Pearson Quick Results (unofficial)',
    student_report: 'Student-reported outcome',
    none: 'No documentation available'
  };
  const levels = {
    unverified: 'Unverified', student_reported: 'Student-reported',
    documented: 'Documentation-supported', independent: 'Independently checked'
  };
  const statuses = {
    pass: 'Passed', fail: 'Failed', awaiting_exam: 'Awaiting examination',
    pending_result: 'Pending result', unknown: 'Unknown / unconfirmed outcome',
    review_required: 'Eligibility / examination history needs review'
  };
  function date(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function verification(attempt, evidence) {
    const rank = { unverified: 0, student_reported: 1, documented: 2, independent: 3 };
    const supported = evidence.filter(e => e.attempt_id === attempt.id && !e.revoked_at &&
      date(e.checked_on) && e.checked_on >= attempt.test_date &&
      e.supports_attempt && e.observed_result === attempt.result &&
      e.exam_date === attempt.test_date && e.exam_type === attempt.exam_type);
    let level = 'unverified';
    const matching = [];
    for (const e of supported) {
      let candidate = 'unverified';
      if (e.method === 'student_report') candidate = 'student_reported';
      if (e.method === 'official' || e.method === 'quick_results') candidate = 'documented';
      if (e.method === 'license' && e.observed_result === 'pass' && e.identity_checked && e.licensing_board && e.license_type) candidate = 'independent';
      if (candidate !== 'unverified') matching.push(e);
      if (rank[candidate] > rank[level]) level = candidate;
    }
    return { level, matching };
  }
  function buildRows(data, today) {
    if (!date(today)) throw new Error('A valid reporting date is required.');
    const students = new Map(data.students.map(s => [s.id, s]));
    const intakes = new Map(data.intakes.map(i => [i.id, i]));
    const bookings = new Map(data.bookings.map(b => [b.id, b]));
    const owner = a => a.student_id || intakes.get(a.consult_intake_id)?.student_id;
    return data.tracking.map(tracking => {
      const student = students.get(tracking.student_id);
      if (!student) throw new Error('A tracked student could not be loaded. Reporting has stopped.');
      const purchases = data.purchases.filter(p => p.student_id === student.id);
      const completions = [];
      for (const purchase of purchases) {
        if (purchase.payment_status !== 'verified' || !date(purchase.purchased_on) ||
          purchase.purchased_on > today || !purchase.payment_reference || !date(purchase.payment_verified_on)) continue;
        for (const session of data.sessions.filter(s => s.purchase_id === purchase.id)) {
          if (session.status !== 'completed' || !date(session.completed_on) || session.completed_on > today ||
            session.completed_on < purchase.purchased_on) continue;
          if (session.consultation_id) {
            const b = bookings.get(session.consultation_id);
            if (!b || b.consult_type !== 'tutoring_session' || b.status !== 'completed' || owner(b) !== student.id) continue;
          }
          completions.push({ ...session, purchase });
        }
      }
      completions.sort((a, b) => a.completed_on.localeCompare(b.completed_on) || a.id.localeCompare(b.id));
      const attempts = data.attempts.filter(a => owner(a) === student.id);
      const post = completions.length ? attempts.filter(a => date(a.test_date) && a.test_date > completions[0].completed_on)
        .sort((a, b) => a.test_date.localeCompare(b.test_date) || a.attempt_number - b.attempt_number) : [];
      const primary = post.find(a => a.exam_taken !== false) || post[0] || null;
      const tested = !!primary && primary.exam_taken === true && primary.test_date <= today;
      const reasons = [];
      if (!tracking.history_reviewed) reasons.push('Confirm examination history and the first post-coaching attempt.');
      if (attempts.some(a => a.exam_taken !== false && !date(a.test_date))) reasons.push('Resolve undated attempts before reporting a pass rate.');
      if (new Set(attempts.map(a => a.attempt_number)).size !== attempts.length) reasons.push('Resolve duplicate lifetime attempt numbers across intake profiles.');
      if (completions.length && attempts.some(a => a.exam_taken !== false && a.test_date === completions[0].completed_on)) {
        reasons.push('Same-day coaching/examination needs timing review; date-only records cannot establish sequence.');
      }
      if (primary) {
        if (primary.exam_taken == null) reasons.push('Confirm whether this examination was actually taken; a scheduled date alone is not attendance.');
        if (!primary.exam_type || !primary.candidate_type) reasons.push('Record RN/PN and first-time/retaker classification.');
        if (attempts.filter(a => a.test_date === primary.test_date).length > 1) reasons.push('Resolve duplicate examination dates.');
        if ((primary.candidate_type === 'first_time' && primary.attempt_number !== 1) ||
          (primary.candidate_type === 'retaker' && primary.attempt_number < 2)) reasons.push('Resolve candidate/attempt-number mismatch.');
        if (primary.test_date > today && (primary.result || primary.exam_taken)) reasons.push('A future examination cannot already have been taken or have a result.');
      }
      const verified = primary ? verification(primary, data.evidence) : { level: 'unverified', matching: [] };
      let status = 'awaiting_exam';
      if (reasons.length) status = tested ? 'unknown' : 'review_required';
      else if (tested) status = !primary.result ? 'pending_result' :
        ['pass', 'fail'].includes(primary.result) && verified.level !== 'unverified' ? primary.result : 'unknown';
      const qualifying = primary ? completions.filter(s => s.completed_on < primary.test_date) : completions;
      return {
        student, tracking, purchases, completions, qualifying, attempts, primary, tested, reasons,
        eligible: completions.length > 0, status, verification: verified,
        packages: [...new Set(qualifying.map(s => s.purchase.package_name))].sort()
      };
    });
  }
  function filterRows(rows, filters = {}) {
    if (filters.from && !date(filters.from) || filters.to && !date(filters.to) ||
      filters.from && filters.to && filters.from > filters.to) throw new Error('Choose a valid examination date range.');
    return rows.filter(r => r.eligible &&
      (!filters.package || r.packages.includes(filters.package)) &&
      (!filters.exam || (r.primary?.exam_type || r.tracking.planned_exam_type) === filters.exam) &&
      (!filters.candidate || (r.primary?.candidate_type || r.tracking.planned_candidate_type) === filters.candidate) &&
      (!r.tested || (!filters.from || r.primary.test_date >= filters.from) &&
        (!filters.to || r.primary.test_date <= filters.to)));
  }
  const rate = (passes, failures) => passes + failures ? passes / (passes + failures) : null;
  function summarize(rows) {
    const tested = rows.filter(r => r.tested);
    const passes = rows.filter(r => r.status === 'pass').length;
    const failures = rows.filter(r => r.status === 'fail').length;
    const documentation = rows.filter(r => ['pass', 'fail'].includes(r.status) &&
      ['documented', 'independent'].includes(r.verification.level));
    return {
      eligible: rows.length, tested: tested.length, awaiting: rows.filter(r => r.status === 'awaiting_exam').length,
      review: rows.filter(r => r.reasons.length).length, known: passes + failures, passes, failures,
      unknown: tested.filter(r => r.status === 'unknown').length,
      pending: tested.filter(r => r.status === 'pending_result').length,
      passRate: rate(passes, failures), documentation: documentation.length,
      independentlyChecked: documentation.filter(r => r.verification.level === 'independent').length,
      verificationCoverage: tested.length ? documentation.length / tested.length : null,
      documentedPassRate: rate(documentation.filter(r => r.status === 'pass').length,
        documentation.filter(r => r.status === 'fail').length)
    };
  }
  const percent = value => value === null ? 'Insufficient data' :
    `${(value * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  const rules = [
    'Paid NCLEX coaching only; payment verified; at least one completed paid NCLEX coaching/tutoring session beyond a Strategy Session.',
    'Free consultations, standalone Strategy Sessions, academic tutoring, unpaid or incomplete coaching, cancelled sessions and no-shows excluded.',
    'Primary attempt: earliest examination strictly after first qualifying completed session; selected before date/package/type/candidate filters.',
    'One student per cohort. Later attempts never replace the primary result. Archived/completed student profiles retained.',
    'Primary known-outcome pass rate = passes / (passes + failures), including explicitly student-reported outcomes; unverified results excluded.',
    'Documentation coverage = documentation-supported or independently checked known outcomes / total eligible tested students.',
    'License-only findings do not establish an examination attempt. Nursys absence is never treated as failure.',
    'Unreviewed/undated/ambiguous histories remain visible and cannot contribute a pass or failure to the primary rate.',
    'Date filter uses primary examination date for tested students. Untested/review-needed students shown separately, not date-cohort members.',
    'Package/type/candidate filters never promote a later examination. Multiple qualifying packages may overlap; do not sum package cohorts.',
    'Pending means awaiting examination or awaiting a result. Unknown means tested but result is unknown, unverified, or requires review.',
    'A scheduled examination never becomes a tested student automatically; actual examination attendance must be explicitly recorded.',
    'Future follow-up consent is not collected by this version and no messages are sent.'
  ];
  function reviewerReport(rows, filters, today) {
    const selected = filterRows(rows, filters);
    const tested = selected.filter(r => r.tested);
    const cohort = summarize(tested);
    return {
      reportVersion: 1, generatedOn: today, filters: {
        from: filters.from || null, to: filters.to || null, exam: filters.exam || null,
        candidate: filters.candidate || null, package: filters.package ? 'Selected package (private label omitted)' : null
      }, eligibilityAndCalculationRules: rules,
      privacyNotice: 'Controlled de-identified reviewer report; exact dates may permit re-identification. No names, contact details, private notes, document links or payment references.',
      summary: cohort, awaitingOrReviewOutsideDateCohort: selected.filter(r => !r.tested).length,
      students: selected.map(r => ({
        reportStudentId: r.tracking.report_id,
        cohortMember: r.tested, actualExaminationTaken: r.primary?.exam_taken === true,
        status: r.status, needsHistoryReview: r.reasons.length > 0,
        paymentVerified: true, completedSessionsBeforePrimary: r.qualifying.length,
        coaching: r.qualifying.map(s => ({ purchasedOn: s.purchase.purchased_on, completedOn: s.completed_on })),
        primaryExaminationDate: r.primary?.test_date || null,
        examType: r.primary?.exam_type || r.tracking.planned_exam_type || null,
        candidateType: r.primary?.candidate_type || r.tracking.planned_candidate_type || null,
        result: r.status === 'pass' || r.status === 'fail' ? r.status :
          r.status === 'pending_result' || r.status === 'awaiting_exam' ? 'pending' : 'unknown',
        verificationLevel: r.verification.level,
        verification: r.verification.matching.map(e => ({ method: e.method, checkedOn: e.checked_on }))
      }))
    };
  }
  function csv(report) {
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [
      ['NCLEX coaching reviewer report', report.reportVersion, report.generatedOn],
      ['Privacy', report.privacyNotice],
      ...report.eligibilityAndCalculationRules.map(rule => ['Rule', rule]),
      ['Filters', JSON.stringify(report.filters)],
      ...Object.entries(report.summary).map(([key, value]) => ['Summary', key, value === null ? 'Insufficient data' : value]),
      ['Awaiting/review outside date cohort', report.awaitingOrReviewOutsideDateCohort],
      ['Report student ID', 'Date cohort member', 'Actual examination taken', 'Status', 'Needs history review', 'Payment verified',
        'Completed sessions before primary', 'Purchase/completion dates', 'Primary exam date', 'Exam type',
        'Candidate type', 'Result', 'Verification level', 'Verification methods/dates'],
      ...report.students.map(s => [s.reportStudentId, s.cohortMember, s.actualExaminationTaken, s.status, s.needsHistoryReview,
        s.paymentVerified, s.completedSessionsBeforePrimary, JSON.stringify(s.coaching), s.primaryExaminationDate,
        s.examType, s.candidateType, s.result, s.verificationLevel, JSON.stringify(s.verification)])
    ];
    return rows.map(row => row.map(cell).join(',')).join('\r\n');
  }
  const api = { methods, levels, statuses, date, verification, buildRows, filterRows, summarize, percent, reviewerReport, csv, rules };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoachingOutcomesData = api;
})(typeof window !== 'undefined' ? window : globalThis);

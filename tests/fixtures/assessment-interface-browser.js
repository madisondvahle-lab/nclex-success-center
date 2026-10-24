// Synthetic, local-only transport fixture. No production credentials or requests.
(function () {
  const config = window.__ASSESSMENT_UI_TEST__ || {};
  const calls = window.__assessmentCalls = [];
  const question = {
    id: 'synthetic-question', type: 'mcq', stem: 'Synthetic interface question',
    options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'], correct: [0],
    blueprint: 'Physiological Integrity', difficulty: 2
  };
  let mode = config.savedMode, revision = 0;
  let checkpoint = mode ? {
    mode, schemaVersion: config.ngn ? 4 : 3,
    scoringModel: config.ngn ? 'in-house-ngn-v1' : undefined,
    currentItemId: question.id, draft: { selected: [1] }, profile: { mode }
  } : null;
  function attempt() {
    return {
      id: 'synthetic-attempt', session_key: 'synthetic-session',
      assessment_key: mode === 'assessment' ? 'readiness-assessment' : `diagnostic-${mode}`,
      mode: mode === 'assessment' ? 'practice' : mode,
      checkpoint, checkpoint_revision: revision, currentItem: question,
      target_questions: mode === 'mock' ? 150 : mode === 'nclex' ? 45 : mode === 'assessment' ? 85 : 10,
      responses: [], ability_estimate: 0.5, total_questions: 0
    };
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: config.signedOut ? null : { user: { id: 'synthetic-user' } } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: { id: 'synthetic-student', name: 'Test Student', portal_stage: config.stage || 'active' }, error: null }),
        order: async () => ({ data: [], error: null })
      };
      if (!['students', 'external_assessments'].includes(table)) throw new Error(`Unexpected fixture table: ${table}`);
      return query;
    },
    functions: { invoke: async (name, { body }) => {
      if (name !== 'diagnostic-assessment') throw new Error('Unexpected fixture function');
      calls.push(body);
      if (body.action === 'resume') {
        return { data: config.resume && checkpoint && body.assessmentKey === attempt().assessment_key
          ? { attempt: attempt(), currentItem: question, currentItemId: question.id, responses: [] }
          : { attempt: null } };
      }
      if (body.action === 'start') {
        mode = body.mode;
        checkpoint = {
          mode, schemaVersion: config.ngn ? 4 : 3,
          scoringModel: config.ngn ? 'in-house-ngn-v1' : undefined,
          currentItemId: question.id, draft: {}, profile: body.profile
        };
        return { data: { attempt: attempt(), currentItemId: question.id, currentItem: question, responses: [] } };
      }
      if (body.action === 'checkpoint') {
        checkpoint = { ...checkpoint, ...body.checkpoint };
        return { data: { checkpointRevision: ++revision } };
      }
      if (body.action !== 'answer') throw new Error(`Unexpected fixture action: ${body.action}`);
      const total = config.total || (mode === 'mock' ? 85 : mode === 'nclex' ? 30 : mode === 'assessment' ? 85 : 10);
      return { data: {
        completed: true, result: config.result ?? null, abilityEstimate: 0.5,
        checkpointRevision: ++revision, completionReason: config.reason || null,
        responses: Array.from({ length: total }, (_, i) => ({
          item_id: `synthetic-${i}`, question_type: 'mcq', is_correct: Boolean(config.allCorrect),
          selected_answer: config.ngn ? [0] : 0, correct_answer: 0,
          ...(config.ngn ? { interaction: question, credit: { earned: 1, max: 1, rule: 'zero-one' }, scoringVersion: 'ngn-v1' } : {}),
          scoringModel: config.ngn ? 'in-house-ngn-v1' : undefined,
          blueprint: question.blueprint, difficulty: 2
        })),
        outcomes: [{ item_id: question.id, correct_answer: 0, is_correct: true, rationale: 'Synthetic explanation.' }]
      } };
    } }
  };
  window.supabase = { createClient: () => client };
}());

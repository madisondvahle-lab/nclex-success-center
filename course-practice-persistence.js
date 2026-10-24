/* Persistence for the assigned NUR 312 parallel practice set. */
(function (global) {
  async function save(supabase, body) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('Your session has expired. Sign in again to save this test.');
    const { data, error } = await supabase.rpc('save_nur312_parallel_practice', body);
    if (error) throw new Error(`Your practice could not be saved: ${error.message}`);
    return data;
  }

  global.NCLEX_COURSE_PRACTICE = {
    createAttempt: ({ supabase, sessionKey }) => save(supabase, {
      p_action: 'start-mcq-order-v1', p_session_key: sessionKey
    }),
    recordResponse: ({ supabase, attemptId, expectedRevision, itemId, displayAnswer }) => save(supabase, {
      p_action: 'answer-mcq-order-v1', p_attempt_id: attemptId, p_expected_revision: expectedRevision,
      p_item_id: itemId, p_answer: displayAnswer
    }),
    finalizeAttempt: ({ supabase, attemptId }) => save(supabase, {
      p_action: 'finish', p_attempt_id: attemptId
    })
  };
}(window));

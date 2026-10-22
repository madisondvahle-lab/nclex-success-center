/* Shared persistence for portal-generated diagnostic assessment attempts. */
(function (global) {
  const CLIENT_PROTOCOL = 'ngn-cat-v1';
  function clientProtocol() {
    const requested = global.document?.querySelector('meta[name="nclex-cat-protocol"]')?.content;
    if (requested !== CLIENT_PROTOCOL) return undefined;
    if (global.NGNScoring?.VERSION !== 'ngn-v1' || global.ExamUI?.CLIENT_PROTOCOL !== CLIENT_PROTOCOL) {
      throw new Error('The updated CAT modules could not load. Refresh the portal before starting or resuming; your saved progress is unchanged.');
    }
    return CLIENT_PROTOCOL;
  }
  async function invokeAssessment(supabase, body) {
    const protocol = clientProtocol();
    if (!supabase) throw new Error('Supabase client is unavailable');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('Your session has expired. Sign in again to continue.');
    const { data, error } = await supabase.functions.invoke('diagnostic-assessment', {
      body: { ...body, ...(protocol ? { clientProtocol: protocol } : {}) }
    });
    if (error) {
      if (error.context?.status === 409 && typeof error.context.json === 'function') {
        const failure = await error.context.json();
        if (typeof failure?.error === 'string') throw new Error(failure.error);
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function createAttempt({ supabase, sessionKey, profile }) {
    if (!sessionKey) throw new Error('Assessment session key is required');
    const data = await invokeAssessment(supabase, {
      action: 'start',
      mode: profile.mode,
      sessionKey,
      profile
    });
    if (!data?.attempt?.id || !data.currentItemId) {
      throw new Error('The assessment service did not return an active question');
    }
    return {
      ...data.attempt,
      currentItemId: data.currentItemId,
      currentItem: data.currentItem || null,
      responses: data.responses || []
    };
  }

  async function checkpointAttempt({ supabase, attemptId, expectedRevision, checkpoint }) {
    const data = await invokeAssessment(supabase, {
      action: 'checkpoint',
      attemptId,
      expectedRevision,
      checkpoint
    });
    if (!Number.isInteger(Number(data?.checkpointRevision))) {
      throw new Error('The assessment service did not return the saved checkpoint');
    }
    return Number(data.checkpointRevision);
  }

  async function recordResponse({ supabase, attemptId, expectedRevision, itemId, answer, caseAnswers, examTimer }) {
    const data = await invokeAssessment(supabase, {
      action: 'answer',
      attemptId,
      expectedRevision,
      itemId,
      answer,
      caseAnswers,
      examTimer
    });
    if (!Number.isInteger(Number(data?.checkpointRevision)) || typeof data.completed !== 'boolean') {
      throw new Error('The assessment service did not return the scored response');
    }
    return data;
  }

  async function resumeAttempt({ supabase, assessmentKey }) {
    const data = await invokeAssessment(supabase, { action: 'resume', assessmentKey });
    if (!data?.attempt) return null;
    return {
      ...data.attempt,
      currentItemId: data.currentItemId,
      currentItem: data.currentItem || null,
      responses: data.responses || []
    };
  }

  async function abandonAttempt({ supabase, attemptId }) {
    const data = await invokeAssessment(supabase, { action: 'abandon', attemptId });
    return data?.abandoned === true;
  }

  global.NCLEX_ASSESSMENT_PERSISTENCE = {
    CLIENT_PROTOCOL,
    createAttempt,
    checkpointAttempt,
    recordResponse,
    resumeAttempt,
    abandonAttempt
  };
}(window));

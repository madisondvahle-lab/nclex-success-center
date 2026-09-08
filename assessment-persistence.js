/* Shared persistence for portal-generated assessment attempts. */
(function (global) {
  function canonicalize(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) {
      return value.map(canonicalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    if (typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function answersEqual(selected, correct) {
    if (selected === null || selected === undefined || correct === null || correct === undefined) {
      return false;
    }
    return JSON.stringify(canonicalize(selected)) === JSON.stringify(canonicalize(correct));
  }

  async function saveAttempt({
    supabase,
    studentId,
    sessionKey,
    assessmentKey,
    assessmentTitle,
    assessmentVersion = 'in-house-core-v1',
    mode,
    result = null,
    abilityEstimate = null,
    responses,
    completedAt = new Date().toISOString()
  }) {
    if (!supabase) throw new Error('Supabase client is unavailable');
    if (!Array.isArray(responses) || responses.length === 0) throw new Error('At least one response is required');
    if (!sessionKey) throw new Error('Assessment session key is required');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('Your session has expired. Sign in again to save this result.');

    let resolvedStudentId = studentId;
    if (!resolvedStudentId) {
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student) throw new Error('No student profile is linked to this account');
      resolvedStudentId = student.id;
    }

    const { data: attemptId, error } = await supabase.rpc('save_in_house_assessment_attempt', {
      p_student_id: resolvedStudentId,
      p_session_key: sessionKey,
      p_assessment_key: assessmentKey,
      p_assessment_title: assessmentTitle,
      p_assessment_version: assessmentVersion,
      p_mode: mode,
      p_result: result,
      p_ability_estimate: abilityEstimate,
      p_total_questions: responses.length,
      p_correct_questions: responses.filter(response => response.isCorrect).length,
      p_completed_at: completedAt,
      p_responses: responses.map(response => ({
        item_id: response.itemId,
        item_source: response.itemSource,
        blueprint: response.blueprint,
        nclex_category: response.nclexCategory,
        system: response.system,
        topic: response.topic,
        cognitive_level: response.cognitiveLevel,
        difficulty: response.difficulty,
        question_type: response.questionType,
        selected_answer: response.selectedAnswer === undefined ? null : response.selectedAnswer,
        correct_answer: response.correctAnswer === undefined ? null : response.correctAnswer,
        is_correct: response.isCorrect,
        answered_at: response.answeredAt || completedAt
      }))
    });
    if (error) throw error;
    if (!attemptId) throw new Error('Supabase did not return the new attempt ID');
    return attemptId;
  }

  async function getStudentId(supabase, studentId) {
    if (studentId) return studentId;
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('Your session has expired. Sign in again to continue.');
    const { data: student, error } = await supabase
      .from('students')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!student) throw new Error('No student profile is linked to this account');
    return student.id;
  }

  async function createAttempt({
    supabase,
    studentId,
    sessionKey,
    assessmentKey,
    assessmentTitle,
    assessmentVersion = 'in-house-core-v1',
    targetQuestions,
    qaMode = false,
    checkpoint
  }) {
    if (!supabase) throw new Error('Supabase client is unavailable');
    if (!sessionKey) throw new Error('Assessment session key is required');
    const resolvedStudentId = await getStudentId(supabase, studentId);
    const { data, error } = await supabase.rpc('create_in_house_assessment_attempt', {
      p_student_id: resolvedStudentId,
      p_session_key: sessionKey,
      p_assessment_key: assessmentKey,
      p_assessment_title: assessmentTitle,
      p_assessment_version: assessmentVersion,
      p_target_questions: targetQuestions,
      p_qa_mode: qaMode,
      p_checkpoint: checkpoint || {}
    });
    if (error) throw error;
    const attempt = Array.isArray(data) ? data[0] : data;
    if (!attempt?.attempt_id) throw new Error('Supabase did not return the assessment attempt');
    const { data: persistedAttempt, error: persistedAttemptError } = await supabase
      .from('in_house_assessment_attempts')
      .select('id,session_key,assessment_key,checkpoint,checkpoint_revision,target_questions,qa_mode,status,total_questions,updated_at')
      .eq('id', attempt.attempt_id)
      .single();
    if (persistedAttemptError) throw persistedAttemptError;
    return {
      ...attempt,
      ...persistedAttempt,
      attempt_id: persistedAttempt.id,
      student_id: resolvedStudentId
    };
  }

  async function checkpointAttempt({ supabase, attemptId, expectedRevision, checkpoint }) {
    const { data, error } = await supabase.rpc('checkpoint_in_house_assessment_attempt', {
      p_attempt_id: attemptId,
      p_expected_revision: expectedRevision,
      p_checkpoint: checkpoint
    });
    if (error) throw error;
    return Number(data);
  }

  function responsePayload(response) {
    return {
      item_id: response.id || response.itemId,
      item_source: response.source || response.itemSource || 'nclex-success-center-original',
      blueprint: response.blueprint || null,
      nclex_category: response.nclexCategory || null,
      system: response.system || null,
      topic: response.topic || null,
      cognitive_level: response.cognitiveLevel || null,
      difficulty: response.difficulty,
      question_type: response.type || response.questionType || null,
      selected_answer: response.selectedAnswer === undefined ? null : response.selectedAnswer,
      correct_answer: response.correctAnswer === undefined ? null : response.correctAnswer,
      is_correct: Boolean(response.correct),
      answered_at: response.answeredAt || new Date().toISOString()
    };
  }

  async function recordResponse({
    supabase,
    attemptId,
    expectedRevision,
    response,
    checkpoint,
    abilityEstimate
  }) {
    const { data, error } = await supabase.rpc('record_in_house_assessment_response', {
      p_attempt_id: attemptId,
      p_expected_revision: expectedRevision,
      p_response: responsePayload(response),
      p_checkpoint: checkpoint,
      p_ability_estimate: abilityEstimate
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new Error('Supabase did not return the saved response state');
    return {
      checkpointRevision: Number(result.checkpoint_revision),
      totalQuestions: Number(result.total_questions),
      correctQuestions: Number(result.correct_questions)
    };
  }

  async function loadAttemptResponses(supabase, attemptId) {
    const { data, error } = await supabase
      .from('in_house_assessment_item_responses')
      .select('item_id,item_source,blueprint,nclex_category,system,topic,cognitive_level,difficulty,question_type,selected_answer,correct_answer,is_correct,answered_at')
      .eq('attempt_id', attemptId)
      .order('answered_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function resumeAttempt({ supabase, studentId, assessmentKey }) {
    if (!supabase) throw new Error('Supabase client is unavailable');
    const resolvedStudentId = await getStudentId(supabase, studentId);
    const { data, error } = await supabase.rpc('resume_in_house_assessment_attempt', {
      p_student_id: resolvedStudentId,
      p_assessment_key: assessmentKey
    });
    if (error) throw error;
    const attempt = Array.isArray(data) ? data[0] : data;
    if (!attempt) return null;
    const responses = await loadAttemptResponses(supabase, attempt.id);
    return { ...attempt, responses, student_id: resolvedStudentId };
  }

  async function abandonAttempt({ supabase, attemptId }) {
    const { data, error } = await supabase.rpc('abandon_in_house_assessment_attempt', {
      p_attempt_id: attemptId
    });
    if (error) throw error;
    return Boolean(data);
  }

  async function finalizeAttempt({ supabase, attemptId, result, abilityEstimate }) {
    const { data, error } = await supabase.rpc('finalize_in_house_assessment_attempt', {
      p_attempt_id: attemptId,
      p_result: result,
      p_ability_estimate: abilityEstimate
    });
    if (error) throw error;
    if (!data) throw new Error('Supabase did not return the finalized attempt ID');
    return data;
  }

  global.NCLEX_ASSESSMENT_PERSISTENCE = {
    answersEqual,
    saveAttempt,
    createAttempt,
    checkpointAttempt,
    recordResponse,
    resumeAttempt,
    abandonAttempt,
    finalizeAttempt,
    responsePayload
  };
}(window));

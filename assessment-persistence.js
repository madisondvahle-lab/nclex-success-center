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

  global.NCLEX_ASSESSMENT_PERSISTENCE = { answersEqual, saveAttempt };
}(window));

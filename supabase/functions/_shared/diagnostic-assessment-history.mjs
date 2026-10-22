// Use only on the server, with the student ID resolved from the authenticated user.
export async function previouslyAnsweredItemIds(service, studentId, keys, currentAttemptId = null) {
  const byId = new Map(keys.map(item => [item.item_id, item]));
  keys.filter(item => item.ngn_entry?.kind === 'case').forEach(item => {
    item.ngn_entry.items.forEach(child => byId.set(`${item.item_id}:${child.id}`, { parent_item_id: item.item_id }));
  });
  const answeredIds = new Set();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = service
      .from('in_house_assessment_item_responses')
      .select('id,item_id,in_house_assessment_attempts!inner(student_id)')
      .eq('in_house_assessment_attempts.student_id', studentId);
    if (currentAttemptId) query = query.neq('attempt_id', currentAttemptId);
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data || []) {
      const key = byId.get(row.item_id);
      if (key) answeredIds.add(key.parent_item_id || key.item_id);
    }
    if (!data || data.length < pageSize) return answeredIds;
  }
}

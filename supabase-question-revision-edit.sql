-- Run after supabase-question-bulk-import.sql.
-- Updates only an existing correction draft; never applies question content.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_question_revision_draft(
  p_revision_id uuid,
  p_expected_proposed_at timestamptz,
  p_expected_status text,
  p_proposed_content jsonb,
  p_change_summary text
)
RETURNS public.question_revision_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision public.question_revision_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Only an app admin can edit a question correction.' USING ERRCODE = '42501';
  END IF;
  IF p_proposed_content IS NULL OR jsonb_typeof(p_proposed_content) <> 'object'
    OR p_change_summary IS NULL OR length(btrim(p_change_summary)) = 0 THEN
    RAISE EXCEPTION 'A correction requires proposed content and a change summary.';
  END IF;

  UPDATE public.question_revision_drafts
  SET proposed_content = p_proposed_content,
      change_summary = btrim(p_change_summary),
      status = 'pending_review',
      proposed_by = auth.uid(),
      proposed_at = clock_timestamp(),
      reviewed_by = NULL,
      reviewed_at = NULL
  WHERE id = p_revision_id
    AND status IN ('pending_review', 'approved')
    AND status = p_expected_status
    AND proposed_at = p_expected_proposed_at
  RETURNING * INTO v_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This correction changed or is no longer open. Copy your unsaved edits, then cancel and reopen the draft.';
  END IF;
  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.update_question_revision_draft(uuid,timestamptz,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_question_revision_draft(uuid,timestamptz,text,jsonb,text) TO authenticated;

COMMIT;

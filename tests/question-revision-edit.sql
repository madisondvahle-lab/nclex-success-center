-- Run after supabase-question-revision-edit.sql.
-- All draft edits and review actions below are rolled back.
BEGIN;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT user_id::text FROM public.app_admins LIMIT 1), true);
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  original public.question_revision_drafts%ROWTYPE;
  saved public.question_revision_drafts%ROWTYPE;
  bank_before jsonb;
  bank_after jsonb;
  refused boolean;
BEGIN
  SELECT * INTO STRICT original FROM public.question_revision_drafts
  WHERE status IN ('pending_review', 'approved')
  ORDER BY proposed_at DESC LIMIT 1;
  SELECT to_jsonb(q) INTO bank_before FROM public.questions q WHERE id=original.question_id;

  saved := public.update_question_revision_draft(original.id,original.proposed_at,original.status,
    original.proposed_content, original.change_summary || ' [rolled-back validation]');
  IF saved.id <> original.id OR saved.base_content IS DISTINCT FROM original.base_content
    OR saved.status <> 'pending_review' OR saved.reviewed_by IS NOT NULL OR saved.reviewed_at IS NOT NULL
    OR saved.proposed_at = original.proposed_at THEN
    RAISE EXCEPTION 'Draft identity, base snapshot, approval reset, or version token failed';
  END IF;

  refused := false;
  BEGIN
    PERFORM public.update_question_revision_draft(original.id,original.proposed_at,original.status,
      original.proposed_content,original.change_summary);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Stale version was accepted'; END IF;

  PERFORM public.approve_question_revision(saved.id);
  refused := false;
  BEGIN
    PERFORM public.update_question_revision_draft(saved.id,saved.proposed_at,'pending_review',
      saved.proposed_content,saved.change_summary);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Stale approval status was accepted'; END IF;

  saved := public.update_question_revision_draft(saved.id,saved.proposed_at,'approved',
    original.proposed_content,original.change_summary);
  IF saved.status <> 'pending_review' OR saved.reviewed_by IS NOT NULL OR saved.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Approved edit did not require fresh review';
  END IF;

  PERFORM public.reject_question_revision(saved.id);
  refused := false;
  BEGIN
    PERFORM public.update_question_revision_draft(saved.id,saved.proposed_at,'rejected',
      saved.proposed_content,saved.change_summary);
  EXCEPTION WHEN raise_exception THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Closed draft was edited'; END IF;

  SELECT to_jsonb(q) INTO bank_after FROM public.questions q WHERE id=original.question_id;
  IF bank_after IS DISTINCT FROM bank_before THEN RAISE EXCEPTION 'Live question changed'; END IF;

  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  refused := false;
  BEGIN
    PERFORM public.update_question_revision_draft(saved.id,saved.proposed_at,'pending_review',
      saved.proposed_content,saved.change_summary);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Non-admin edit was accepted'; END IF;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('anon','public.update_question_revision_draft(uuid,timestamptz,text,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role has edit permission';
  END IF;
END;
$$;
ROLLBACK;

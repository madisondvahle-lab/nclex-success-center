-- Apply only after approval, before deploying the class-assignment UI.
-- Existing enabled access is conservatively retained as an independent source.
BEGIN;

ALTER TABLE public.student_module_access
  ADD COLUMN IF NOT EXISTS independent_enabled boolean;
UPDATE public.student_module_access SET independent_enabled = enabled
WHERE independent_enabled IS NULL;
ALTER TABLE public.student_module_access
  ALTER COLUMN independent_enabled SET DEFAULT false,
  ALTER COLUMN independent_enabled SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.student_class_module_assignments') IS NULL THEN
    CREATE TABLE public.student_class_module_assignments (
      student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
      class_code text NOT NULL CHECK (btrim(class_code) <> ''),
      module_key text NOT NULL REFERENCES public.modules(module_key),
      PRIMARY KEY (student_id, class_code, module_key)
    );
    -- Import once: reapplying this migration must not restore removed assignments.
    INSERT INTO public.student_class_module_assignments (student_id, class_code, module_key)
    SELECT DISTINCT r.student_id, r.class_code, m.module_key
    FROM public.student_resources r
    JOIN public.modules m ON m.guide_url = r.url
    JOIN public.students s ON s.id = r.student_id AND s.student_type = 'nursing_student'
    WHERE r.resource_type = 'study_guide' AND btrim(coalesce(r.class_code, '')) <> ''
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
ALTER TABLE public.student_class_module_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_class_module_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_class_module_assignments TO authenticated;
DROP POLICY IF EXISTS "Read own class modules" ON public.student_class_module_assignments;
CREATE POLICY "Read own class modules" ON public.student_class_module_assignments
  FOR SELECT TO authenticated USING (
    public.is_app_admin() OR EXISTS (
      SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.preserve_independent_module_access()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.saving_course_modules', true) = 'on'
     AND current_user = pg_get_userbyid((
       SELECT proowner FROM pg_proc
       WHERE oid = 'public.save_nursing_class_modules(uuid,text,text[])'::regprocedure
     )) THEN
    NEW.independent_enabled := CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.independent_enabled END;
  ELSE
    NEW.independent_enabled := NEW.enabled;
  END IF;
  NEW.enabled := NEW.independent_enabled OR EXISTS (
    SELECT 1 FROM public.student_class_module_assignments a
    WHERE a.student_id = NEW.student_id AND a.module_key = NEW.module_key
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_nursing_class_modules(
  p_student uuid, p_class text, p_modules text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  affected text[];
  previous_mode text := current_setting('app.saving_course_modules', true);
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_class IS NULL OR btrim(p_class) = '' OR p_class <> btrim(p_class) THEN
    RAISE EXCEPTION 'Choose a valid class';
  END IF;
  IF p_modules IS NULL OR EXISTS (
    SELECT 1 FROM unnest(p_modules) k
    LEFT JOIN public.modules m ON m.module_key = k
    WHERE m.module_key IS NULL OR coalesce(m.guide_url, '') = ''
  ) THEN RAISE EXCEPTION 'Choose valid modules with student guide links'; END IF;

  -- Serialize complete class snapshots, including saves to different classes.
  PERFORM 1 FROM public.students
  WHERE id = p_student AND student_type = 'nursing_student' AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active nursing-school student required'; END IF;

  SELECT array_agg(DISTINCT module_key) INTO affected FROM (
    SELECT module_key FROM public.student_class_module_assignments
    WHERE student_id = p_student AND class_code = p_class
    UNION SELECT unnest(p_modules)
  ) keys;

  DELETE FROM public.student_class_module_assignments
  WHERE student_id = p_student AND class_code = p_class
    AND NOT (module_key = ANY(p_modules));
  INSERT INTO public.student_class_module_assignments (student_id, class_code, module_key)
  SELECT p_student, p_class, k FROM (SELECT DISTINCT unnest(p_modules) k) keys
  ON CONFLICT DO NOTHING;

  PERFORM set_config('app.saving_course_modules', 'on', true);
  INSERT INTO public.student_module_access (student_id, module_key, enabled)
  SELECT p_student, k, false FROM unnest(affected) k
  ON CONFLICT (student_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
  PERFORM set_config('app.saving_course_modules', coalesce(previous_mode, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION public.save_nursing_class_modules(uuid,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_nursing_class_modules(uuid,text,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.preserve_independent_module_access() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS preserve_independent_module_access ON public.student_module_access;
CREATE TRIGGER preserve_independent_module_access
  BEFORE INSERT OR UPDATE ON public.student_module_access
  FOR EACH ROW EXECUTE FUNCTION public.preserve_independent_module_access();

-- Only imported links may need access initialized; existing independent grants survive.
DO $$
DECLARE previous_mode text := current_setting('app.saving_course_modules', true);
BEGIN
  PERFORM set_config('app.saving_course_modules', 'on', true);
  INSERT INTO public.student_module_access (student_id, module_key, enabled)
  SELECT DISTINCT student_id, module_key, false FROM public.student_class_module_assignments
  ON CONFLICT (student_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
  PERFORM set_config('app.saving_course_modules', coalesce(previous_mode, ''), true);
END;
$$;
COMMIT;

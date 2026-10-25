-- Approved catalog prerequisite only; does not rebuild content or change grants.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.modules WHERE module_number = 4 AND module_key <> 'm4')
     OR EXISTS (SELECT 1 FROM public.modules WHERE module_key = 'm4'
       AND (module_number <> 4 OR guide_url IS DISTINCT FROM 'module4-guide.html')) THEN
    RAISE EXCEPTION 'Conflicting M4 catalog entry; review without overwriting existing content';
  END IF;
END;
$$;
INSERT INTO public.modules (module_key,module_number,name,description,guide_url,is_available)
VALUES ('m4',4,'Module 4 · Cardiac','Cardiac study guide.','module4-guide.html',true)
ON CONFLICT (module_key) DO UPDATE SET is_available = true;
COMMIT;

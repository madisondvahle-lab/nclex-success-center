\set ON_ERROR_STOP on
CREATE FUNCTION public.test_assert(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT test_assert((SELECT count(*) = 2 FROM nursing_module_classes('00000000-0000-0000-0000-000000000001')), 'only enrolled classes returned');
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 321',ARRAY['m4']);
    RAISE EXCEPTION 'unenrolled class accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Student is not actively enrolled in this class' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
INSERT INTO student_courses (student_id,course_key,course_name)
VALUES ('00000000-0000-0000-0000-000000000001','nur321-ob','NUR 321 OB');
SET ROLE authenticated;
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 321',ARRAY['m4']);
SELECT test_assert((SELECT count(*)=1 FROM student_class_module_assignments
WHERE student_id='00000000-0000-0000-0000-000000000001' AND class_code='NUR 321' AND module_key='m4'),
  'newly enrolled class can receive existing Cardiac module');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 321',ARRAY[]::text[]);
RESET ROLE;
DELETE FROM student_courses WHERE student_id='00000000-0000-0000-0000-000000000001' AND course_key='nur321-ob';
SET ROLE authenticated;
SELECT test_assert((SELECT count(*) = 1 FROM student_class_module_assignments WHERE student_id = '00000000-0000-0000-0000-000000000003'), 'legacy deduplication');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m4','m5','m4']);
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 416',ARRAY['m4']);
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 416',ARRAY['m4']);
SELECT test_assert((SELECT count(*) = 3 FROM student_class_module_assignments WHERE student_id = '00000000-0000-0000-0000-000000000001'), 'different classes, shared module, repeated save');
SELECT test_assert((SELECT enabled AND NOT independent_enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm4'), 'course-only access provenance');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m5']);
RESET ROLE;
UPDATE student_courses SET active=false WHERE student_id='00000000-0000-0000-0000-000000000001' AND course_key='nur312';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m4']);
    RAISE EXCEPTION 'inactive enrollment accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Student is not actively enrolled in this class' THEN RAISE; END IF;
  END;
END $$;
-- Retired courses can still be cleared without revoking independent grants.
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
RESET ROLE;
UPDATE student_courses SET active=true WHERE student_id='00000000-0000-0000-0000-000000000001' AND course_key='nur312';
SET ROLE authenticated;
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m5']);
SELECT test_assert((SELECT enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm4'), 'other class keeps access');
SELECT test_assert((SELECT count(*) = 1 FROM student_class_module_assignments WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm4'), 'remove only one class');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 416',ARRAY[]::text[]);
SELECT test_assert((SELECT NOT enabled AND NOT independent_enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm4'), 'last class revokes only course-owned access');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
SELECT test_assert((SELECT count(*) = 0 FROM student_class_module_assignments WHERE student_id = '00000000-0000-0000-0000-000000000001'), 'zero modules clears class');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m3','m4']);
-- A later independent assignment is retained even if access was already enabled.
INSERT INTO student_module_access (student_id,module_key,enabled)
VALUES ('00000000-0000-0000-0000-000000000001','m4',true)
ON CONFLICT (student_id,module_key) DO UPDATE SET enabled = true;
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
SELECT test_assert((SELECT bool_and(enabled AND independent_enabled) FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key IN ('m3','m4')), 'legacy and later independent access survive');
SELECT test_assert((SELECT enabled AND independent_enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000002' AND module_key = 'm4'), 'NCLEX unchanged');
UPDATE student_module_access SET enabled = false
WHERE student_id = '00000000-0000-0000-0000-000000000002' AND module_key = 'm4';
SELECT test_assert((SELECT NOT enabled AND NOT independent_enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000002' AND module_key = 'm4'), 'NCLEX independent disable unchanged');
UPDATE student_module_access SET enabled = true
WHERE student_id = '00000000-0000-0000-0000-000000000002' AND module_key = 'm4';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m5']);
UPDATE student_module_access SET enabled = false
WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm5';
SELECT test_assert((SELECT enabled AND NOT independent_enabled FROM student_module_access WHERE student_id = '00000000-0000-0000-0000-000000000001' AND module_key = 'm5'), 'independent revoke does not revoke a class');
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',NULL);
    RAISE EXCEPTION 'null selection accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Choose valid modules%' THEN RAISE; END IF;
  END;
END $$;
-- Invalid input must leave the previous snapshot untouched.
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['missing']);
    RAISE EXCEPTION 'invalid module accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Choose valid modules%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000002','NUR 312',ARRAY['m4']);
    RAISE EXCEPTION 'NCLEX course mutation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Active nursing-school student required' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001',' ',ARRAY[]::text[]);
    RAISE EXCEPTION 'empty class accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Choose a valid class' THEN RAISE; END IF;
  END;
END $$;
-- Remove the imported assignment so rerunning migration must not resurrect it.
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 312',ARRAY[]::text[]);
RESET ROLE;
SELECT test_assert((SELECT count(*) = 3 FROM student_resources), 'unrelated and legacy resources untouched');
-- Force failure after class links change to prove transaction rollback.
CREATE FUNCTION public.test_access_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic access failure'; END $$;
CREATE TRIGGER test_access_failure BEFORE INSERT OR UPDATE ON student_module_access
FOR EACH ROW EXECUTE FUNCTION test_access_failure();
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m5']);
    RAISE EXCEPTION 'failure injection did not fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'synthetic access failure' THEN RAISE; END IF;
  END;
END $$;
SELECT test_assert((SELECT count(*) = 0 FROM student_class_module_assignments WHERE student_id = '00000000-0000-0000-0000-000000000001'), 'transaction rollback retained previous snapshot');
RESET ROLE;
DROP TRIGGER test_access_failure ON student_module_access;
-- Non-admin students can read only their own assignments, and cannot mutate them.
SET ROLE authenticated;
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m5']);
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 312',ARRAY['m4']);
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
SELECT test_assert((SELECT count(*)=0 FROM nursing_module_classes('00000000-0000-0000-0000-000000000003')), 'cannot read other enrollment');
SELECT test_assert((SELECT count(*)=2 FROM nursing_module_classes('00000000-0000-0000-0000-000000000001')), 'can read own enrollments');
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m4']);
    RAISE EXCEPTION 'student mutation accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Admin access required' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO student_class_module_assignments VALUES ('00000000-0000-0000-0000-000000000001','NUR 312','m4');
    RAISE EXCEPTION 'direct mutation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT test_assert((SELECT count(*) = 0 FROM student_class_module_assignments WHERE student_id <> '00000000-0000-0000-0000-000000000001'), 'student RLS');
SELECT test_assert((SELECT count(*) = 1 FROM student_class_module_assignments), 'student can read own class modules');
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY[]::text[]);
SELECT save_nursing_class_modules('00000000-0000-0000-0000-000000000003','NUR 312',ARRAY[]::text[]);
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM save_nursing_class_modules('00000000-0000-0000-0000-000000000001','NUR 312',ARRAY['m4']);
    RAISE EXCEPTION 'anonymous execute accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM student_class_module_assignments;
    RAISE EXCEPTION 'anonymous read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

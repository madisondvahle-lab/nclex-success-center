-- Jack — NUR 312 Exam 2 resource-set import
--
-- Review this artifact before running it in the Supabase SQL Editor.
-- It intentionally fails until the tutor replaces the NULL below with Jack's
-- student UUID. It does not change RLS, storage policies, or NCLEX records.
--
-- The nine graphics are committed under:
--   assets/jack-nur312-exam2/
-- They are referenced as portal-relative URLs so the existing
-- student_resources/student-dashboard workflow can render them.

DO $$
DECLARE
  target_student_id uuid := NULL; -- Replace with Jack's students.id.
  resource_label constant text := 'Jack — NUR 312 Exam 2';
BEGIN
  IF target_student_id IS NULL THEN
    RAISE EXCEPTION
      'Set target_student_id to Jack''s students.id before running this import';
  END IF;

  INSERT INTO public.student_resources
    (student_id, title, resource_type, url, note)
  SELECT
    target_student_id,
    resource_label || ' · ' || item.filename,
    'document',
    item.url,
    'Exam 2 respiratory/cardiac study graphic. Imported from the supplied source file.'
  FROM (VALUES
    ('Pneumo vs tension pneumo.png', 'assets/jack-nur312-exam2/Pneumo%20vs%20tension%20pneumo.png'),
    ('Flail chest.png', 'assets/jack-nur312-exam2/Flail%20chest.png'),
    ('Pneumo:hemo:effusion.png', 'assets/jack-nur312-exam2/Pneumo%3Ahemo%3Aeffusion.png'),
    ('PEs.png', 'assets/jack-nur312-exam2/PEs.png'),
    ('Chest Tubes.png', 'assets/jack-nur312-exam2/Chest%20Tubes.png'),
    ('Vent settings.png', 'assets/jack-nur312-exam2/Vent%20settings.png'),
    ('Bipap vs CPAP.png', 'assets/jack-nur312-exam2/Bipap%20vs%20CPAP.png'),
    ('Oxygen delivery.png', 'assets/jack-nur312-exam2/Oxygen%20delivery.png'),
    ('Whiteboard.png', 'assets/jack-nur312-exam2/Whiteboard.png')
  ) AS item(filename, url)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.student_resources existing
    WHERE existing.student_id = target_student_id
      AND existing.title = resource_label || ' · ' || item.filename
      AND existing.url = item.url
  );
END $$;

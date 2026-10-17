-- Core 1 lesson payloads must not be committed as public static assets.
-- Upload the reviewed core-safety-priority.json to this private bucket.
-- Run after the module catalog and is_app_admin() migrations.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('module-lessons', 'module-lessons', false, 524288, ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "available core1 lessons for signed in users" ON storage.objects;
CREATE POLICY "available core1 lessons for signed in users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'module-lessons'
  AND name = 'core-safety-priority.json'
  AND EXISTS (
    SELECT 1 FROM public.modules
    WHERE module_key = 'core-safety-priority' AND is_available = true
  )
);

DROP POLICY IF EXISTS "admins manage module lesson files" ON storage.objects;
CREATE POLICY "admins manage module lesson files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'module-lessons' AND public.is_app_admin())
WITH CHECK (bucket_id = 'module-lessons' AND public.is_app_admin());

COMMIT;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'module-lessons';

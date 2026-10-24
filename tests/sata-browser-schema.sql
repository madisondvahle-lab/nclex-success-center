-- Disposable browser fixture only; not a release migration.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_type text DEFAULT 'nclex'
  CHECK (student_type IN ('nclex', 'nursing_student'));
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS public.student_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('study_guide', 'practice_set', 'video', 'link', 'document')),
  url text, note text, due_on date, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "synthetic own resource read" ON public.student_resources;
CREATE POLICY "synthetic own resource read" ON public.student_resources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_user_id = auth.uid()));

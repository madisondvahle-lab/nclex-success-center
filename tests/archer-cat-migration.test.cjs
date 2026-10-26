const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

// Optional isolated PostgreSQL/WASM check, never a connection to Supabase.
test('Archer migration is additive, repeatable, constrained, and preserves RLS', {
  skip: !process.env.ARCHER_PGLITE_MODULE
}, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.ARCHER_PGLITE_MODULE).href);
  const migration = readFileSync(join(__dirname, '..', 'supabase-archer-cat-assessment-migration.sql'), 'utf8');
  const db = new PGlite();
  const setup = `
    CREATE TABLE public.external_assessments (
      id integer PRIMARY KEY,
      category_counts jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.assessment_report_files (
      id integer PRIMARY KEY,
      assessment_id integer REFERENCES public.external_assessments(id),
      storage_path text UNIQUE
    );
    ALTER TABLE public.external_assessments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.assessment_report_files ENABLE ROW LEVEL SECURITY;
    CREATE POLICY synthetic_assessment_policy ON public.external_assessments FOR SELECT USING (true);
    CREATE POLICY synthetic_file_policy ON public.assessment_report_files FOR SELECT USING (true);
    INSERT INTO public.external_assessments VALUES (1, '{"Management of Care": 7}');
    INSERT INTO public.assessment_report_files VALUES (1, 1, 'synthetic/legacy');
  `;
  try {
    await db.exec(setup);
    const policiesBefore = (await db.query("SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname='public' ORDER BY tablename")).rows;
    await db.exec(migration);
    await db.exec(migration);
    const legacy = (await db.query('SELECT * FROM public.external_assessments WHERE id=1')).rows[0];
    assert.deepEqual(legacy, { id: 1, category_counts: { 'Management of Care': 7 }, archer_cat_data: null });
    const file = (await db.query('SELECT section, report_view FROM public.assessment_report_files WHERE id=1')).rows[0];
    assert.deepEqual(file, { section: 'report', report_view: 'not_applicable' });
    for (const sql of [
      "UPDATE public.external_assessments SET category_counts='[]'::jsonb WHERE id=1",
      "UPDATE public.external_assessments SET category_counts='2'::jsonb WHERE id=1",
      "UPDATE public.external_assessments SET archer_cat_data='[]'::jsonb WHERE id=1",
      "UPDATE public.external_assessments SET archer_cat_data='true'::jsonb WHERE id=1",
      "UPDATE public.assessment_report_files SET section='unknown' WHERE id=1",
      "UPDATE public.assessment_report_files SET report_view='unknown' WHERE id=1"
    ]) {
      await assert.rejects(db.exec(sql), error => error.code === '23514');
    }
    await db.exec(`
      UPDATE public.external_assessments SET archer_cat_data='{"version":1}'::jsonb WHERE id=1;
      INSERT INTO public.assessment_report_files (id, assessment_id, storage_path, section, report_view) VALUES
        (2, 1, 'synthetic/classic-client', 'classic', 'client_need'),
        (3, 1, 'synthetic/classic-subject', 'classic', 'subject_lesson'),
        (4, 1, 'synthetic/ngn-client', 'ngn', 'client_need'),
        (5, 1, 'synthetic/ngn-subject', 'ngn', 'subject_lesson');
    `);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.assessment_report_files WHERE assessment_id=1')).rows[0].count, 5);
    const rls = (await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.external_assessments'::regclass, 'public.assessment_report_files'::regclass)")).rows;
    assert.equal(rls.length, 2);
    assert.ok(rls.every(row => row.relrowsecurity));
    assert.deepEqual((await db.query("SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname='public' ORDER BY tablename")).rows, policiesBefore);
  } finally {
    await db.close();
  }
  const invalid = new PGlite();
  try {
    await invalid.exec(setup);
    await invalid.exec("UPDATE public.external_assessments SET category_counts='[]'::jsonb WHERE id=1");
    await assert.rejects(invalid.exec(`BEGIN; ${migration} COMMIT;`), error => error.code === '23514');
    await invalid.exec('ROLLBACK');
    assert.deepEqual((await invalid.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('archer_cat_data','report_view')")).rows, []);
  } finally {
    await invalid.close();
  }
});

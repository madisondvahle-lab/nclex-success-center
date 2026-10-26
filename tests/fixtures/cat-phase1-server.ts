// Disposable loopback integration only; never load a production environment file.
const sourcePath = Deno.env.get('CAT_TEST_SOURCE')!;
const sourceUrl = new URL(`file://${sourcePath}`);
let source = await Deno.readTextFile(sourceUrl);
source = source.replaceAll(/from '(\.\.\/_shared\/[^']+)'/g,
  (_, dependency) => `from '${new URL(dependency, new URL('../../supabase/functions/diagnostic-assessment/index.ts', import.meta.url)).href}'`);
const handler = (await import(`data:application/typescript;base64,${btoa(source)}`)).default;
Deno.serve({ hostname: '127.0.0.1', port: Number(Deno.env.get('CAT_TEST_PORT')) }, handler.fetch);

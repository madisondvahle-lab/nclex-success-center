import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentTiming } from '../supabase/functions/_shared/diagnostic-timing.mjs';

test('timing reports durations only and records failed operations without masking their errors', async () => {
  const timing = assessmentTiming();
  assert.equal(await timing.measure('auth', async () => 'PRIVATE TOKEN'), 'PRIVATE TOKEN');
  await assert.rejects(timing.measure('commit', async () => { throw new Error('private failure'); }), /private failure/);
  const result = timing.finish();
  assert.deepEqual(result.stages.map(s => s.name), ['auth', 'commit']);
  assert.ok(result.totalMs >= 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private failure/);
  assert.match(result.header, /^auth;dur=[\d.]+, commit;dur=[\d.]+, total;dur=[\d.]+$/);
});

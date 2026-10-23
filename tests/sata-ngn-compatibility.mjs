import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canonicalAnswer, presentation } from '../supabase/functions/_shared/sata-presentation.mjs';

// Read the held scorer without modifying or incorporating the separate Phase 2 release.
const context = {};
runInNewContext(readFileSync(process.argv[2], 'utf8'), context);
const scorer = context.NGNScoring;
assert.equal(scorer.VERSION, 'ngn-v1');
function permutations(values) {
  return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];
}
let comparisons = 0;
for (const correctCount of [3, 4, 5]) for (const order of permutations([0, 1, 2, 3, 4, 5])) {
  const saved = { ...presentation.create(6), order };
  const item = { type: 'sata', scoringVersion: 'ngn-v1', options: order.map((_, i) => `Synthetic choice ${i}`),
    correct: order.map((_, i) => i).slice(0, correctCount), presentation: saved };
  for (let mask = 1; mask < 64; mask++) {
    const canonical = order.filter((_, display) => mask & (1 << display));
    const answer = canonicalAnswer({ synthetic: saved }, 'synthetic', presentation.encode(item, canonical));
    for (const scoring of [undefined, 'zero-one']) {
      const original = scorer.score({ ...item, scoring }, canonical);
      const decoded = scorer.score({ ...item, scoring }, answer);
      assert.deepEqual(decoded, original);
      const hits = canonical.filter(i => i < correctCount).length, wrong = canonical.length - hits;
      assert.equal(decoded.score, scoring === 'zero-one' ? +(hits === correctCount && wrong === 0) : Math.max(0, hits - wrong) / correctCount);
      comparisons++;
    }
  }
}
console.log(JSON.stringify({ comparisons, permutations: 720, correctCounts: [3, 4, 5], rules: ['plus-minus', 'all-or-nothing'], passed: true }));

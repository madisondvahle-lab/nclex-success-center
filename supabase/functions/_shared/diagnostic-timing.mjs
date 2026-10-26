export function assessmentTiming() {
  const started = performance.now();
  const stages = [];
  return {
    /**
     * @template T
     * @param {string} name
     * @param {() => PromiseLike<T>} operation
     * @returns {Promise<T>}
     */
    async measure(name, operation) {
      const start = performance.now();
      try { return await operation(); }
      finally { stages.push({ name, ms: Number((performance.now() - start).toFixed(2)) }); }
    },
    finish() {
      const totalMs = Number((performance.now() - started).toFixed(2));
      return {
        totalMs, stages: stages.slice(),
        header: [...stages.map(s => `${s.name};dur=${s.ms}`), `total;dur=${totalMs}`].join(', '),
      };
    },
  };
}

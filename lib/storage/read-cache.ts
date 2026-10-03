/** Short, blocking cache: expired values are never served during a refresh. */
export function createReadCache<T>(ttlMs: number) {
  let generation = 0;
  let scope = "";
  let cached: { value: T; expiresAt: number } | undefined;
  let pending: Promise<{ value: T; expiresAt: number }> | undefined;
  function invalidate() {
    generation++;
    cached = undefined;
    pending = undefined;
  }
  return {
    invalidate,
    async read(key: string, load: () => Promise<T>) {
      if (scope !== key) {
        invalidate();
        scope = key;
      }
      if (cached && Date.now() < cached.expiresAt) return cached;
      if (pending) return pending;
      const expiresAt = Date.now() + ttlMs;
      const startedGeneration = generation;
      const operation = load().then((value) => {
        const snapshot = { value, expiresAt };
        if (generation === startedGeneration && Date.now() < expiresAt)
          cached = snapshot;
        return snapshot;
      });
      pending = operation;
      try {
        return await operation;
      } finally {
        if (pending === operation) pending = undefined;
      }
    },
  };
}

export type RateLimiter = { take(key: string): boolean; reset(): void };

/**
 * Per-instance, in-memory, best-effort. With ~11 users and a serverless runtime this
 * is the boring right size: it slows a password guesser without adding a store.
 */
export function makeRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    take(key: string): boolean {
      const cutoff = now() - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      hits.set(key, recent);
      return true;
    },
    reset(): void {
      hits.clear();
    },
  };
}

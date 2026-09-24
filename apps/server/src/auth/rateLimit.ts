export type RateLimiter = { take(key: string): boolean; reset(): void; size(): number };

/** Enough for any real install many times over; a flood of made-up usernames stops here. */
const DEFAULT_MAX_KEYS = 10_000;

/**
 * Per-instance, in-memory, best-effort. With ~11 users and a serverless runtime this
 * is the boring right size: it slows a password guesser without adding a store.
 *
 * Bounded (Phase 1B review): every `take` drops the keys whose whole window has expired,
 * and when `maxKeys` distinct keys are live the oldest-inserted is evicted. A Map
 * iterates in insertion order, so the first key is the oldest. Eviction forgets that
 * key's attempts, which is the accepted cost of a bounded, store-free limiter.
 */
export function makeRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const hits = new Map<string, number[]>();

  const sweep = (cutoff: number): void => {
    for (const [key, times] of hits) {
      // Timestamps are appended in order, so the newest is the last one.
      if (times.length === 0 || times[times.length - 1]! <= cutoff) hits.delete(key);
    }
  };

  return {
    take(key: string): boolean {
      const cutoff = now() - options.windowMs;
      sweep(cutoff);
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now());
      if (!hits.has(key) && hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      hits.set(key, recent);
      return true;
    },
    reset(): void {
      hits.clear();
    },
    size(): number {
      return hits.size;
    },
  };
}

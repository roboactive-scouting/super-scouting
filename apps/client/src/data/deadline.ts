/**
 * Races `work` against a deadline of `timeoutMs`, aborting `signal` when it expires.
 * Racing (rather than only signalling) is what guarantees the deadline even if something
 * downstream ignores the signal — e.g. a body read that never notices the abort.
 *
 * Shared between `rpc.ts` and `api.ts` (phase 1C follow-up): the two transports differ
 * only in what they throw when the deadline expires, so the caller supplies `onExpire`.
 * `undefined` means "no deadline" — the original behaviour before either transport had one.
 */
export function deadline<E>(
  timeoutMs: number | undefined,
  onExpire: () => E,
): {
  signal: AbortSignal | undefined;
  race: <T>(work: Promise<T>) => Promise<T>;
  done: () => void;
} {
  if (timeoutMs === undefined) {
    return { signal: undefined, race: (work) => work, done: () => {} };
  }
  const controller = new AbortController();
  let expire!: () => void;
  const expired = new Promise<never>((_, reject) => {
    expire = () => reject(onExpire());
  });
  expired.catch(() => {}); // never an unhandled rejection when nobody is racing
  const timer = setTimeout(() => {
    controller.abort();
    expire();
  }, timeoutMs);
  return {
    signal: controller.signal,
    race: (work) => Promise.race([work, expired]),
    done: () => clearTimeout(timer),
  };
}

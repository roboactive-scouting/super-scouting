/** How many store calls run at once when a use case has many independent ones. */
const WAVE = 20;

/**
 * `fn` over every item, WAVE at a time, results in input order. For a bulk create or a
 * batch of lookups: one round trip after another would be seconds at a venue, and all of
 * them at once would open hundreds of connections.
 */
export async function inWaves<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += WAVE) {
    results.push(...(await Promise.all(items.slice(i, i + WAVE).map(fn))));
  }
  return results;
}

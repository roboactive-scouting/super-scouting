import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { PURGE_ORDER, SEED_PREFIX, strayIds, type PurgeTable } from './strays';

/**
 * Removes rows the app or a test created in the DEV project, leaving the deterministic
 * seed untouched.
 *
 * Every seeded row uses the fixed `00000000-0000-4000-8000-…` id space (see
 * `fixtures.ts`), so anything with a random uuid was written by a real push, a
 * rehearsal or a smoke run. Offline rehearsals and the smoke suite both leave litter
 * behind — stray bare matches and their entries, and stray users (e.g. a disabled
 * `probe_*` account from a role probe) — and by the time the ranking table lands
 * (phase 1 I) that litter is visible in the product. Since task 1.18 the admin use cases
 * create seasons and events too, and from task 1.19 teams, rosters and match slots, so a
 * dev proof leaves those behind as well.
 *
 * DEV ONLY. The guard below refuses to run against anything but the dev project, and
 * production is never migrated or seeded from a script (SPEC-FINAL 19.4).
 *
 * Deletes in foreign-key order, children first (`PURGE_ORDER` in strays.ts, unit-tested):
 * entries, match slots, matches, rosters, events, seasons, users, and teams last, because
 * every reference to a team is `on delete restrict`. Deleting a stray event or season
 * cascades to what hangs off it (conflicts, forms, alliance rows); `app_settings` is
 * `on delete set null`, so if the active context named a stray season or event it reads as
 * nothing set up until `pnpm seed` restores the seed's. `sync_conflicts` and
 * `do_not_pick` also reference users but are not "litter" this script purges — if a
 * stray user or team is still referenced from a table outside the list, its delete fails
 * and this script reports which table blocked it rather than silently leaving the row
 * behind or purging tables outside its remit.
 *
 * Deliberately leaves `applied_operations` alone. Those rows are the idempotency
 * ledger; clearing them would let an already-applied operation replay as a new write.
 * An orphaned ledger row is harmless — it only ever causes a noop.
 */

loadEnv({ path: fileURLToPath(new URL('../../../../apps/server/.env', import.meta.url)) });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must name the DEV project.');
}

const PROD_REF = 'ezrgtroyofuxkkktnino';
if (url.includes(PROD_REF)) {
  throw new Error('refusing to run: SUPABASE_URL names the production project.');
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF;
if (ref && !url.includes(ref)) {
  throw new Error(
    `refusing to run: SUPABASE_URL does not contain SUPABASE_DEV_PROJECT_REF (${ref}).`,
  );
}

const db = createClient<Database>(url, key, { auth: { persistSession: false } });

async function purge(table: PurgeTable): Promise<number> {
  const { data, error } = await db.from(table).select('id');
  if (error) throw new Error(`${table}: ${error.message}`);
  const strays = strayIds(
    (data ?? []).map((r) => String(r.id)),
    SEED_PREFIX,
  );
  if (strays.length === 0) return 0;
  const { error: delError } = await db.from(table).delete().in('id', strays);
  if (delError) throw new Error(`${table}: ${delError.message}`);
  return strays.length;
}

const removed: string[] = [];
for (const table of PURGE_ORDER) {
  removed.push(`${await purge(table)} ${table}`);
}
console.warn(`dev database cleaned: removed ${removed.join(', ')}`);

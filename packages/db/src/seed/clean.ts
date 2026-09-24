import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { SEED_PREFIX, strayIds } from './strays';

/**
 * Removes rows the app or a test created in the DEV project, leaving the deterministic
 * seed untouched.
 *
 * Every seeded row uses the fixed `00000000-0000-4000-8000-…` id space (see
 * `fixtures.ts`), so anything with a random uuid was written by a real push, a
 * rehearsal or a smoke run. Offline rehearsals and the smoke suite both leave litter
 * behind — stray bare matches and their entries, and stray users (e.g. a disabled
 * `probe_*` account from a role probe) — and by the time the ranking table lands
 * (phase 1 I) that litter is visible in the product.
 *
 * DEV ONLY. The guard below refuses to run against anything but the dev project, and
 * production is never migrated or seeded from a script (SPEC-FINAL 19.4).
 *
 * Deletes in foreign-key order: entries reference both matches and users, so entries
 * go first, then matches, then users. `sync_conflicts` and `do_not_pick` also reference
 * users but are not "litter" this script purges (they hold no stray rows yet — nothing
 * writes them outside the entries/matches path) — if a stray user is still referenced
 * from one of those tables, the user delete fails and this script reports which table
 * blocked it rather than silently leaving the user behind or purging tables outside its
 * remit.
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

async function purge(table: 'scouting_entries' | 'matches' | 'users'): Promise<number> {
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

const entries = await purge('scouting_entries');
const matches = await purge('matches');
const users = await purge('users');
console.warn(
  `dev database cleaned: removed ${entries} entries, ${matches} matches, and ${users} users`,
);

import bcrypt from 'bcryptjs';
import { afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/database.types';
import {
  BootstrapRefusal,
  bootstrapAdmin,
  type BootstrapDeps,
  type BootstrapTerminal,
} from '../src/bootstrap/bootstrapAdmin';
import { supabaseBootstrapStore } from '../src/bootstrap/store';
import { serviceClient, uuid } from './client';

/**
 * The bootstrap script against the real DEV project, through the real Supabase store.
 *
 * The refusal path is proven for real: dev holds the three seed users, so a run must
 * stop and name them. The empty-install path cannot be proven for real on dev without
 * deleting the seed users (entries reference them), so it runs with ONE thing faked —
 * `listUsers` reports an empty table — and everything else real: the insert goes to
 * dev through the same adapter production will use, and the row is read back and its
 * hash verified. The row is deleted afterwards (and `pnpm db:clean` would remove it too:
 * its id is outside the seed id space).
 */

const db = serviceClient() as SupabaseClient<Database>;
const url = process.env.SUPABASE_URL!;
const ref = /^https:\/\/([a-z0-9]{20})\./.exec(url)![1]!;
const password = `itest-${uuid()}`;
const username = `itest_bootstrap_${uuid().slice(0, 8)}`;
const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) await db.from('users').delete().in('id', createdIds);
});

function terminal(said: string[]): BootstrapTerminal {
  const hidden = [password, password];
  return {
    interactive: true,
    say: (line) => said.push(line),
    ask: async () => ref,
    askHidden: async () => hidden.shift() ?? '',
  };
}

function deps(said: string[], store = supabaseBootstrapStore(db)): BootstrapDeps {
  return {
    env: {
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: 'unused-here',
      BOOTSTRAP_ADMIN_USERNAME: username,
      BOOTSTRAP_ADMIN_FULL_NAME: 'Bootstrap Itest',
    },
    store,
    terminal: terminal(said),
    hash: (plain, cost) => bcrypt.hash(plain, cost),
    newId: () => {
      const id = uuid();
      createdIds.push(id);
      return id;
    },
  };
}

describe('bootstrap admin against the dev project', () => {
  it('refuses while the seed users exist, and names them', async () => {
    const said: string[] = [];
    const error = await bootstrapAdmin(deps(said)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BootstrapRefusal);
    const message = (error as Error).message;
    for (const name of ['seed_scouter', 'seed_lead', 'seed_admin']) {
      expect(message).toContain(name);
    }
    const { data } = await db.from('users').select('id').eq('username', username);
    expect(data).toEqual([]);
  });

  it('with only emptiness faked, writes a real admin row that can sign in', async () => {
    const real = supabaseBootstrapStore(db);
    const said: string[] = [];
    const created = await bootstrapAdmin(
      deps(said, { listUsers: async () => [], insertAdmin: real.insertAdmin }),
    );

    const { data, error } = await db
      .from('users')
      .select('username, full_name, role, must_change_password, disabled_at, password_hash')
      .eq('id', created.id)
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      username,
      full_name: 'Bootstrap Itest',
      role: 'admin',
      must_change_password: true,
      disabled_at: null,
    });
    expect(bcrypt.getRounds(data!.password_hash)).toBe(10);
    expect(await bcrypt.compare(password, data!.password_hash)).toBe(true);
    expect(said.join('\n')).not.toContain(password);
  });
});

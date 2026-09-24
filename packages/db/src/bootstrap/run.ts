import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseEnv } from 'dotenv';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import {
  BootstrapRefusal,
  ENV_FILE_NAME,
  REQUIRED_ENV,
  bootstrapAdmin,
  type BootstrapEnv,
  type BootstrapStore,
} from './bootstrapAdmin';
import { supabaseBootstrapStore } from './store';
import { PromptCancelled, processTerminal } from './terminal';

/**
 * `pnpm bootstrap:admin` — creates the first admin of an EMPTY install. Meant for
 * PRODUCTION, run by hand, once. See `bootstrapAdmin.ts` for why this script, unlike
 * every other one in `packages/db`, does not refuse production.
 *
 * The environment comes ONLY from `packages/db/.env.bootstrap`, parsed here into a
 * private object — never `process.env`, never `apps/server/.env` (which names DEV), and
 * never a shell `source` (BUILD-CONTEXT §3). A stray SUPABASE_URL exported in the shell
 * therefore cannot redirect the write.
 */

const envPath = fileURLToPath(new URL('../../.env.bootstrap', import.meta.url));

async function main(): Promise<string | null> {
  if (!existsSync(envPath)) {
    return (
      `refusing to run: ${ENV_FILE_NAME} does not exist. Create it with these lines ` +
      '(values from the Supabase dashboard of the project you mean to bootstrap):\n' +
      REQUIRED_ENV.map((name) => `  ${name}=`).join('\n')
    );
  }
  const env: BootstrapEnv = parseEnv(readFileSync(envPath));
  // Built on first use: createClient throws on an empty URL, and bootstrapAdmin should
  // be the one to say which variable is missing.
  let store: BootstrapStore | undefined;
  const lazy = (): BootstrapStore =>
    (store ??= supabaseBootstrapStore(
      createClient<Database>(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false },
      }),
    ));
  try {
    await bootstrapAdmin({
      env,
      store: { listUsers: () => lazy().listUsers(), insertAdmin: (row) => lazy().insertAdmin(row) },
      terminal: processTerminal(),
      hash: (plain, cost) => bcrypt.hash(plain, cost),
      newId: () => crypto.randomUUID(),
    });
    return null;
  } catch (error) {
    if (error instanceof BootstrapRefusal) return error.message;
    if (error instanceof PromptCancelled) return 'cancelled. Nothing was written.';
    // The message only, never the error object (which can carry request details).
    // Nothing on this path ever holds the password.
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const failure = await main();
if (failure !== null) {
  process.stderr.write(`\n${failure}\n`);
  process.exitCode = 1;
}

import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// fileURLToPath, never new URL(...).pathname: this repository lives on a Windows drive
// under a path with spaces and Hebrew characters, and .pathname mangles both.
loadEnv({ path: fileURLToPath(new URL('../../../apps/server/.env', import.meta.url)) });

/**
 * Integration tests run against the DEV Supabase project only. If SUPABASE_URL
 * ever names the production project, that is a bug in your local .env, not here.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Integration tests need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/server/.env ' +
        '(the DEV project). See docs/ops/ENVIRONMENT.md §5.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const uuid = (): string => crypto.randomUUID();

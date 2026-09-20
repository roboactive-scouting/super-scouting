import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { seedDevDatabase } from './seed';

loadEnv({ path: fileURLToPath(new URL('../../../../apps/server/.env', import.meta.url)) });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must name the DEV project.');
}

const ref = process.env.SUPABASE_DEV_PROJECT_REF;
if (ref && !url.includes(ref)) {
  throw new Error(
    `refusing to seed: SUPABASE_URL does not contain SUPABASE_DEV_PROJECT_REF (${ref}). ` +
      'The seed script never runs against production.',
  );
}

await seedDevDatabase(createClient<Database>(url, key, { auth: { persistSession: false } }));
console.warn('dev database seeded');

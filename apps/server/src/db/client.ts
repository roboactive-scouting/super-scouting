import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@frc/db';
import type { ServerConfig } from '../config.js';

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/** The service-role client. Server-side only; never reachable from a client bundle. */
export function getServiceClient(config: ServerConfig): Db {
  cached ??= createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

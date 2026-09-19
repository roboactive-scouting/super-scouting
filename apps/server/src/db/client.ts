import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config.js';

let cached: SupabaseClient | null = null;

/** The service-role client. Server-side only; never reachable from a client bundle. */
export function getServiceClient(config: ServerConfig): SupabaseClient {
  cached ??= createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

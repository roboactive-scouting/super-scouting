import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import type { BootstrapStore } from './bootstrapAdmin';

/** The service-role Supabase adapter behind `bootstrapAdmin`. Errors are thrown, never
 *  swallowed: a failed read must not look like "no users yet". */
export function supabaseBootstrapStore(db: SupabaseClient<Database>): BootstrapStore {
  return {
    async listUsers() {
      const { data, error } = await db
        .from('users')
        .select('username, role, disabled_at')
        .order('created_at');
      if (error) throw new Error(`reading users: ${error.message}`);
      if (!data) throw new Error('reading users: no data returned');
      return data;
    },
    async insertAdmin(row) {
      const { data, error } = await db
        .from('users')
        .insert(row)
        .select('id, username, full_name, role, must_change_password')
        .single();
      if (error) throw new Error(`creating the admin: ${error.message}`);
      return data;
    },
  };
}

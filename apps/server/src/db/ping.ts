import type { ServerConfig } from '../config';
import { getServiceClient } from './client';

/**
 * One trivial database read (SPEC-FINAL 19.6). This is what counts as activity
 * against the Supabase free-tier idle pause.
 */
export function makePingDatabase(config: ServerConfig): () => Promise<void> {
  return async () => {
    const { error } = await getServiceClient(config).from('app_settings').select('id').limit(1);
    if (error) throw new Error(error.message);
  };
}

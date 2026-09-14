import { z } from 'zod';

/**
 * The one place the client reads its environment (SPEC-FINAL Appendix B.1).
 * The client holds no Supabase credentials at all, not even the anon key.
 */
const schema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_DEVICE_WIPE_CODE: z.string().min(1),
  VITE_APP_VERSION: z.string().min(1).default('unknown'),
});

export type ClientConfig = {
  apiBaseUrl: string;
  /** Not a secret: it ships in the bundle and is an accident guard (SPEC-FINAL 9.9). */
  deviceWipeCode: string;
  appVersion: string;
};

export function loadClientConfig(env: Record<string, string | undefined>): ClientConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Client environment is not usable. Fix these variables (see docs/ops/ENVIRONMENT.md):\n${lines.join('\n')}`,
    );
  }
  return {
    apiBaseUrl: parsed.data.VITE_API_BASE_URL.replace(/\/+$/, ''),
    deviceWipeCode: parsed.data.VITE_DEVICE_WIPE_CODE,
    appVersion: parsed.data.VITE_APP_VERSION,
  };
}

let cached: ClientConfig | null = null;

export function clientConfig(): ClientConfig {
  cached ??= loadClientConfig(import.meta.env as unknown as Record<string, string | undefined>);
  return cached;
}

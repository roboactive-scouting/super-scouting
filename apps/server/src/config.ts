import { z } from 'zod';

/**
 * The one place the server reads its environment (SPEC-FINAL Appendix B).
 * Nothing else in apps/server may touch process.env.
 */
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  AUTH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_TOKEN_REFRESH_AFTER_DAYS: z.coerce.number().int().positive().default(7),
  ALLOWED_ORIGIN: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ServerConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  authJwtSecret: string;
  tokenTtlDays: number;
  tokenRefreshAfterDays: number;
  allowedOrigin: string;
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
};

export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Server environment is not usable. Fix these variables (see docs/ops/ENVIRONMENT.md):\n${lines.join('\n')}`,
    );
  }
  const v = parsed.data;
  return {
    supabaseUrl: v.SUPABASE_URL,
    supabaseServiceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY,
    authJwtSecret: v.AUTH_JWT_SECRET,
    tokenTtlDays: v.AUTH_TOKEN_TTL_DAYS,
    tokenRefreshAfterDays: v.AUTH_TOKEN_REFRESH_AFTER_DAYS,
    allowedOrigin: v.ALLOWED_ORIGIN,
    nodeEnv: v.NODE_ENV,
    isProduction: v.NODE_ENV === 'production',
  };
}

let cached: ServerConfig | null = null;

/** Loaded once per function instance; throws at first use if the environment is wrong. */
export function serverConfig(): ServerConfig {
  cached ??= loadServerConfig(process.env);
  return cached;
}

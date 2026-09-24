import { z } from 'zod';
import { USERNAME_MAX_LENGTH } from './users';

/**
 * The wire schemas of the two unauthenticated use cases (SPEC-FINAL 16.1, 16.5). They
 * live here, not in apps/server, so the typed client validates with the identical
 * objects the server does. Browser-safe: zod only.
 */
export const loginInput = z.object({
  // Capped at the length createUser allows (Phase 1B review): no longer name can exist,
  // and the login rate limiter keys on this string, so it must not be unbounded. The cap
  // is on the raw value, so the client should trim before sending.
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

/** Returned by both `login` and `refreshToken`. Never carries the password hash. */
export const loginOutput = z.object({
  token: z.string(),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    full_name: z.string(),
    role: z.enum(['scouter', 'lead', 'admin']),
    must_change_password: z.boolean(),
  }),
});
export type LoginOutput = z.infer<typeof loginOutput>;

export const refreshTokenInput = z.object({ token: z.string().min(1) });
export type RefreshTokenInput = z.infer<typeof refreshTokenInput>;

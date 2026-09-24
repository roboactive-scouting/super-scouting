import { z } from 'zod';

/**
 * The wire schemas of the two unauthenticated use cases (SPEC-FINAL 16.1, 16.5). They
 * live here, not in apps/server, so the typed client validates with the identical
 * objects the server does. Browser-safe: zod only.
 */
export const loginInput = z.object({
  username: z.string().min(1),
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

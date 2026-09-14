import { AppError } from './errors';

export type Role = 'scouter' | 'lead' | 'admin';

export type Caller =
  { kind: 'user'; userId: string; role: Role } | { kind: 'service'; label: string };

export function isUser(caller: Caller): caller is Extract<Caller, { kind: 'user' }> {
  return caller.kind === 'user';
}

export function isService(caller: Caller): caller is Extract<Caller, { kind: 'service' }> {
  return caller.kind === 'service';
}

/**
 * The single authorization primitive. It reads the caller argument and nothing else
 * (SPEC-FINAL 16.5). A service caller never satisfies a role requirement, which is
 * what makes every command use case read-only-hostile by construction.
 */
export function assertRole(
  caller: Caller,
  allowed: readonly Role[],
): asserts caller is Extract<Caller, { kind: 'user' }> {
  if (!isUser(caller)) {
    throw new AppError('forbidden', 'a service caller may not perform this operation');
  }
  if (!allowed.includes(caller.role)) {
    throw new AppError('forbidden', `role '${caller.role}' may not perform this operation`, {
      allowed: [...allowed],
    });
  }
}

import type { z } from 'zod';
import {
  changeOwnPasswordInput,
  createUserInput,
  disableUserInput,
  listUsersInput,
  listUsersOutput,
  loginInput,
  loginOutput,
  publicUser,
  refreshTokenInput,
  resetPasswordInput,
  setUserRoleInput,
  type Caller,
} from '@frc/shared';
import type { ServerConfig } from '../config.js';
import type { UseCaseContext } from '../core/context.js';
import { login } from '../core/commands/login.js';
import { refreshToken } from '../core/commands/refreshToken.js';
import {
  changeOwnPassword,
  createUser,
  disableUser,
  resetPassword,
  setUserRole,
} from '../core/commands/users.js';
import { listUsers } from '../core/queries/listUsers.js';

type EntryMeta = {
  kind: 'query' | 'command';
  /** Plain language, for a human reading the registry and for a future MCP tool list. */
  description: string;
  input: z.ZodType;
  output: z.ZodType;
};

/** Every use case but two: it takes the caller the HTTP edge built from the bearer. */
export type AuthenticatedEntry = EntryMeta & {
  unauthenticated?: never;
  handler: (
    caller: Caller,
    input: never,
    ctx: UseCaseContext,
    config: ServerConfig,
  ) => Promise<unknown>;
};

/**
 * login and refreshToken only (SPEC-FINAL 16.5). They take NO caller — they produce one —
 * so the handler has no caller parameter and nothing has to fabricate a `service` caller
 * to call it ("Nothing in v1 constructs one").
 */
export type UnauthenticatedEntry = EntryMeta & {
  unauthenticated: true;
  handler: (input: never, ctx: UseCaseContext, config: ServerConfig) => Promise<unknown>;
};

export type RegistryEntry = AuthenticatedEntry | UnauthenticatedEntry;

export const REGISTRY: Record<string, RegistryEntry> = {
  login: {
    kind: 'command',
    description:
      'Exchange a username and password for a 30-day session token. Takes no caller — it produces one. Rate-limited by username.',
    input: loginInput,
    output: loginOutput,
    unauthenticated: true,
    handler: login,
  },
  refreshToken: {
    kind: 'command',
    description:
      'Exchange a still-valid session token for a fresh one. Takes no caller — it produces one. Rate-limited by username.',
    input: refreshTokenInput,
    output: loginOutput,
    unauthenticated: true,
    handler: refreshToken,
  },
  changeOwnPassword: {
    kind: 'command',
    description:
      'Change your own password, given the current one. Acts on the caller only and clears the must-change flag. Rate-limited per user.',
    input: changeOwnPasswordInput,
    output: publicUser,
    handler: changeOwnPassword,
  },
  createUser: {
    kind: 'command',
    description:
      'Admin only: create a user with a username, full name, role and initial password. The full name is the only personal datum stored.',
    input: createUserInput,
    output: publicUser,
    handler: createUser,
  },
  setUserRole: {
    kind: 'command',
    description:
      "Admin only: change a user's role. Refuses to demote the last enabled admin. Takes effect on the user's next request.",
    input: setUserRoleInput,
    output: publicUser,
    handler: setUserRole,
  },
  resetPassword: {
    kind: 'command',
    description:
      'Admin only: set a new password for a user, optionally forcing a change at next login. Does not revoke tokens already issued.',
    input: resetPasswordInput,
    output: publicUser,
    handler: resetPassword,
  },
  disableUser: {
    kind: 'command',
    description:
      'Admin only: disable a user. The row and their authorship are kept forever; access ends on their next request. Refuses the last enabled admin.',
    input: disableUserInput,
    output: publicUser,
    handler: disableUser,
  },
  listUsers: {
    kind: 'query',
    description:
      'Users for the picker, the admin table and the offline cache, ordered by username and paginated. Excludes disabled users unless asked. Never returns a password hash.',
    input: listUsersInput,
    output: listUsersOutput,
    handler: listUsers,
  },
};

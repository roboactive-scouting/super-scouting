import type { z } from 'zod';
import { loginInput, loginOutput, refreshTokenInput, type Caller } from '@frc/shared';
import type { ServerConfig } from '../config.js';
import type { UseCaseContext } from '../core/context.js';
import { login } from '../core/commands/login.js';
import { refreshToken } from '../core/commands/refreshToken.js';

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
};

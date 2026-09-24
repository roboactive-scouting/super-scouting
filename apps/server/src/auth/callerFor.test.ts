import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../config.js';
import type { StoredUser } from '../core/context.js';
import { tokenAt } from '../test/tokens.js';
import { issueToken, verifyToken } from './token.js';
import { callerFor } from './callerFor.js';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});
const otherConfig = { ...config, authJwtSecret: 'a-different-secret-also-32-characters-long' };

const store = {
  async getUser(id: string): Promise<StoredUser | null> {
    if (id === 'u-disabled') {
      return { id, role: 'scouter' as const, disabled_at: '2026-01-01T00:00:00.000Z' };
    }
    if (id === 'u-1') return { id, role: 'lead' as const, disabled_at: null };
    return null;
  },
};

const DAY_MS = 86400 * 1000;

const bearer = (header: string) =>
  new Request('https://api.example.com/api/listUsers', { headers: { authorization: header } });

const withToken = async (userId: string, role: 'scouter' | 'lead' | 'admin') =>
  bearer(`Bearer ${await issueToken({ id: userId, username: 'u', role }, config)}`);

describe('callerFor (SPEC-FINAL 16.5)', () => {
  it('builds a user caller from a valid bearer token', async () => {
    const result = await callerFor(await withToken('u-1', 'lead'), config, store);
    expect(result.caller).toEqual({ kind: 'user', userId: 'u-1', role: 'lead' });
    expect(result.refreshedToken).toBeNull();
  });

  it('takes the role from the database, not from the token', async () => {
    const result = await callerFor(await withToken('u-1', 'admin'), config, store);
    expect(result.caller?.kind === 'user' && result.caller.role).toBe('lead');
  });

  it('returns no caller for a missing, malformed or unknown token', async () => {
    expect(
      (await callerFor(new Request('https://api.example.com/x'), config, store)).caller,
    ).toBeNull();
    expect((await callerFor(bearer('Bearer nonsense'), config, store)).caller).toBeNull();
    expect((await callerFor(bearer('Bearer '), config, store)).caller).toBeNull();
    expect(
      (await callerFor(await withToken('u-missing', 'lead'), config, store)).caller,
    ).toBeNull();
  });

  it('refuses a token signed with a different secret', async () => {
    const token = await issueToken({ id: 'u-1', username: 'u', role: 'lead' }, otherConfig);
    expect((await callerFor(bearer(`Bearer ${token}`), config, store)).caller).toBeNull();
  });

  it('refuses an expired token', async () => {
    const token = await tokenAt({ id: 'u-1', username: 'u', role: 'lead' }, config, {
      issuedDaysAgo: 31,
      expiresInDays: -1,
    });
    expect((await callerFor(bearer(`Bearer ${token}`), config, store)).caller).toBeNull();
  });

  it('refuses a disabled user', async () => {
    expect(
      (await callerFor(await withToken('u-disabled', 'scouter'), config, store)).caller,
    ).toBeNull();
  });

  it('accepts the Bearer scheme in any case, with exactly one space', async () => {
    const token = await issueToken({ id: 'u-1', username: 'u', role: 'lead' }, config);
    for (const scheme of ['Bearer', 'bearer', 'BEARER', 'bEaReR']) {
      expect(
        (await callerFor(bearer(`${scheme} ${token}`), config, store)).caller,
        scheme,
      ).not.toBeNull();
    }
    for (const header of [
      `Bearer  ${token}`,
      `Bearer\t${token}`,
      `Basic ${token}`,
      token,
      `Bearer ${token} x`,
    ]) {
      expect(
        (await callerFor(bearer(header), config, store)).caller,
        header.slice(0, 8),
      ).toBeNull();
    }
  });

  it('asks for a refreshed token once the bearer is older than seven days', async () => {
    const stale = await callerFor(await withToken('u-1', 'lead'), config, store, {
      now: () => Date.now() + 8 * DAY_MS,
    });
    expect(stale.refreshedToken).toBeTruthy();
  });

  it('reads token age from the injected clock alone', async () => {
    // A token eight real days old is fresh against a clock set to its issue time, and a
    // token minted now is stale against a clock eight days ahead: no second computation.
    const old = await tokenAt({ id: 'u-1', username: 'u', role: 'lead' }, config, {
      issuedDaysAgo: 8,
      expiresInDays: 22,
    });
    const atIssue = await callerFor(bearer(`Bearer ${old}`), config, store, {
      now: () => Date.now() - 8 * DAY_MS,
    });
    expect(atIssue.caller).not.toBeNull();
    expect(atIssue.refreshedToken).toBeNull();
    const sixDays = await callerFor(await withToken('u-1', 'lead'), config, store, {
      now: () => Date.now() + 6 * DAY_MS,
    });
    expect(sixDays.refreshedToken).toBeNull();
  });

  it('re-issues for the same user, with the database role and the claims username', async () => {
    const old = await tokenAt({ id: 'u-1', username: 'alice', role: 'admin' }, config, {
      issuedDaysAgo: 8,
      expiresInDays: 22,
    });
    const { refreshedToken } = await callerFor(bearer(`Bearer ${old}`), config, store);
    const claims = await verifyToken(refreshedToken as string, config);
    expect(claims).toMatchObject({ sub: 'u-1', role: 'lead', username: 'alice' });
    expect(claims.iat).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
  });

  it('propagates a database error instead of turning it into a missing caller', async () => {
    const broken = {
      async getUser(): Promise<StoredUser | null> {
        throw new Error('connection refused');
      },
    };
    await expect(callerFor(await withToken('u-1', 'lead'), config, broken)).rejects.toThrow(
      'connection refused',
    );
  });
});

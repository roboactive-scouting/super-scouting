import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadServerConfig } from '../../config.js';
import type { StoredFullUser } from '../context.js';
import { issueToken, verifyToken } from '../../auth/token.js';
import { tokenAt } from '../../test/tokens.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';
import { loginLimiter } from './login.js';
import { refreshToken } from './refreshToken.js';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});
const otherConfig = { ...config, authJwtSecret: 'a-different-secret-also-32-characters-long' };

const alice: StoredFullUser = {
  id: 'u-1',
  username: 'alice',
  full_name: 'Alice',
  role: 'lead',
  password_hash: '$2a$10$notarealhashnotarealhashnotarealhashnotarealhashnotar',
  must_change_password: false,
  disabled_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
};

let ctx: FakeContext;
beforeEach(() => {
  loginLimiter.reset();
  ctx = makeFakeContext();
  ctx.usersById.set(alice.id, alice);
});

const tokenFor = (user: { id: string; username: string }, cfg = config) =>
  issueToken({ id: user.id, username: user.username, role: 'scouter' }, cfg);

describe('refreshToken (SPEC-FINAL 7.5, 16.5)', () => {
  it('returns a fresh token for the same user, with the role from the database', async () => {
    const result = await refreshToken({ token: await tokenFor(alice) }, ctx, config);
    expect(result.user).toMatchObject({ id: 'u-1', username: 'alice', role: 'lead' });
    expect(await verifyToken(result.token, config)).toMatchObject({ sub: 'u-1', role: 'lead' });
    expect(JSON.stringify(result)).not.toContain('$2a$');
  });

  it('refuses a disabled user', async () => {
    ctx.usersById.set(alice.id, { ...alice, disabled_at: '2026-11-02T00:00:00.000Z' });
    await expect(refreshToken({ token: await tokenFor(alice) }, ctx, config)).rejects.toMatchObject(
      { code: 'forbidden' },
    );
  });

  it('refuses a deleted or unknown user', async () => {
    await expect(
      refreshToken({ token: await tokenFor({ id: 'u-gone', username: 'alice' }) }, ctx, config),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('refuses an expired token', async () => {
    const token = await tokenAt({ ...alice, role: 'lead' }, config, {
      issuedDaysAgo: 31,
      expiresInDays: -1,
    });
    await expect(refreshToken({ token }, ctx, config)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('refuses a token signed with another secret', async () => {
    await expect(
      refreshToken({ token: await tokenFor(alice, otherConfig) }, ctx, config),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('refreshes a renamed user as the ORIGINAL user, never as the new holder of the old name', async () => {
    const token = await tokenFor(alice); // claims.username is 'alice'
    ctx.usersById.set(alice.id, { ...alice, username: 'alicia' });
    const impostor: StoredFullUser = { ...alice, id: 'u-2', username: 'alice', role: 'admin' };
    ctx.usersById.set(impostor.id, impostor);
    ctx.usersByName.set('alice', impostor);

    const result = await refreshToken({ token }, ctx, config);
    expect(result.user).toMatchObject({ id: 'u-1', username: 'alicia', role: 'lead' });
    expect(await verifyToken(result.token, config)).toMatchObject({
      sub: 'u-1',
      username: 'alicia',
      role: 'lead',
    });
  });

  it('looks the user up by id, and never by username', async () => {
    const byName = vi.spyOn(ctx.store, 'getUserByUsername');
    const byId = vi.spyOn(ctx.store, 'getFullUser');
    await refreshToken({ token: await tokenFor(alice) }, ctx, config);
    expect(byId).toHaveBeenCalledWith('u-1');
    expect(byName).not.toHaveBeenCalled();
  });

  it('rate-limits by the token username, case-insensitively, before the lookup', async () => {
    for (let i = 0; i < 10; i += 1) {
      await refreshToken({ token: await tokenFor(alice) }, ctx, config);
    }
    const lookup = vi.spyOn(ctx.store, 'getFullUser');
    await expect(
      refreshToken({ token: await tokenFor({ id: alice.id, username: 'ALICE' }) }, ctx, config),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('does not let a badly signed token spend a user’s rate-limit bucket', async () => {
    for (let i = 0; i < 20; i += 1) {
      await refreshToken({ token: await tokenFor(alice, otherConfig) }, ctx, config).catch(
        () => undefined,
      );
    }
    await expect(
      refreshToken({ token: await tokenFor(alice) }, ctx, config),
    ).resolves.toMatchObject({ user: { id: 'u-1' } });
  });
});

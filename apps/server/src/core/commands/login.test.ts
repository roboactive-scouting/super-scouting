import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadServerConfig } from '../../config.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../auth/password.js';
import type * as PasswordModule from '../../auth/password.js';
import { verifyToken } from '../../auth/token.js';
import { login, loginLimiter } from './login.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

// A pass-through spy: every case still runs real bcrypt, but the unknown-user case can
// prove that a comparison really happened (the timing-equaliser, not just the message).
vi.mock('../../auth/password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PasswordModule>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});

let ctx: FakeContext;
beforeEach(async () => {
  loginLimiter.reset(); // a module singleton would otherwise leak between cases
  vi.mocked(verifyPassword).mockClear();
  ctx = makeFakeContext();
  ctx.usersByName.set('alice', {
    id: 'u-1',
    username: 'alice',
    full_name: 'Alice',
    role: 'lead',
    password_hash: await hashPassword('correct horse'),
    must_change_password: false,
    disabled_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
  });
});

describe('login (SPEC-FINAL 7.5)', () => {
  it('returns a token and the user for the right password', async () => {
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(result.user).toMatchObject({ id: 'u-1', username: 'alice', role: 'lead' });
    expect((await verifyToken(result.token, config)).sub).toBe('u-1');
  });

  it('matches the username case-insensitively', async () => {
    await expect(
      login({ username: 'ALICE', password: 'correct horse' }, ctx, config),
    ).resolves.toBeTruthy();
  });

  it('rejects the wrong password with the same message as an unknown user', async () => {
    // allSettled attaches a handler to both promises the moment they exist; awaiting one
    // while the other is still unobserved leaks an unhandled rejection when it settles.
    const [wrong, missing] = await Promise.allSettled([
      login({ username: 'alice', password: 'nope' }, ctx, config),
      login({ username: 'nobody', password: 'nope' }, ctx, config),
    ]);
    expect(wrong).toMatchObject({ status: 'rejected', reason: { code: 'unauthenticated' } });
    expect(missing).toMatchObject({ status: 'rejected', reason: { code: 'unauthenticated' } });
    expect((wrong as PromiseRejectedResult).reason.message).toBe(
      (missing as PromiseRejectedResult).reason.message,
    );
  });

  it('still runs a bcrypt comparison for an unknown user, against the dummy hash', async () => {
    await expect(
      login({ username: 'nobody', password: 'nope' }, ctx, config),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledWith('nope', DUMMY_PASSWORD_HASH);
  });

  it('refuses a disabled account', async () => {
    const user = ctx.usersByName.get('alice')!;
    ctx.usersByName.set('alice', { ...user, disabled_at: '2026-01-01T00:00:00.000Z' });
    await expect(
      login({ username: 'alice', password: 'correct horse' }, ctx, config),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('does not reveal that a disabled account exists to someone without its password', async () => {
    const user = ctx.usersByName.get('alice')!;
    ctx.usersByName.set('alice', { ...user, disabled_at: '2026-01-01T00:00:00.000Z' });
    await expect(login({ username: 'alice', password: 'nope' }, ctx, config)).rejects.toMatchObject(
      { code: 'unauthenticated' },
    );
  });

  it('reports must_change_password so the client can force a change', async () => {
    const user = ctx.usersByName.get('alice')!;
    ctx.usersByName.set('alice', { ...user, must_change_password: true });
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(result.user.must_change_password).toBe(true);
  });

  it('rate-limits by username', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login({ username: 'alice', password: 'nope' }, ctx, config).catch(() => undefined);
    }
    await expect(
      login({ username: 'alice', password: 'correct horse' }, ctx, config),
    ).rejects.toMatchObject({
      code: 'rate-limited',
    });
  });

  it('shares one rate-limit bucket across the case and whitespace variants of a username', async () => {
    const variants = ['alice', 'ALICE', ' Alice ', 'aLiCe', 'alice '];
    for (let i = 0; i < 10; i += 1) {
      await login(
        { username: variants[i % variants.length]!, password: 'nope' },
        ctx,
        config,
      ).catch(() => undefined);
    }
    await expect(
      login({ username: 'Alice', password: 'correct horse' }, ctx, config),
    ).rejects.toMatchObject({ code: 'rate-limited' });
  });

  it('refuses a rate-limited attempt before looking the user up or comparing a hash', async () => {
    for (let i = 0; i < 10; i += 1) {
      await login({ username: 'alice', password: 'nope' }, ctx, config).catch(() => undefined);
    }
    vi.mocked(verifyPassword).mockClear();
    const lookup = vi.spyOn(ctx.store, 'getUserByUsername');
    await expect(login({ username: 'alice', password: 'nope' }, ctx, config)).rejects.toMatchObject(
      { code: 'rate-limited' },
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('never returns the password hash', async () => {
    const result = await login({ username: 'alice', password: 'correct horse' }, ctx, config);
    expect(JSON.stringify(result)).not.toContain('$2a$');
  });
});

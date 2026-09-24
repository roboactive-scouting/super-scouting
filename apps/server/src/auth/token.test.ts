import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../config.js';
import { issueToken, shouldRefresh, verifyToken } from './token.js';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
});

const user = { id: 'u-1', username: 'alice', role: 'lead' as const };
const key = new TextEncoder().encode(config.authJwtSecret);

describe('session token (SPEC-FINAL 7.5)', () => {
  it('carries sub, role, username, iat and exp', async () => {
    const claims = await verifyToken(await issueToken(user, config), config);
    expect(claims).toMatchObject({ sub: 'u-1', role: 'lead', username: 'alice' });
    expect(typeof claims.iat).toBe('number');
    expect(typeof claims.exp).toBe('number');
  });

  it('lives 30 days', async () => {
    const claims = await verifyToken(await issueToken(user, config), config);
    const days = (claims.exp - claims.iat) / 86400;
    expect(Math.round(days)).toBe(30);
  });

  it('rejects a token signed with another secret', async () => {
    const other = loadServerConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      AUTH_JWT_SECRET: 'a-completely-different-secret-value-32!!',
      ALLOWED_ORIGIN: 'https://client.example.com',
    });
    const token = await issueToken(user, other);
    await expect(verifyToken(token, config)).rejects.toThrow();
  });

  it('rejects an expired token, even one signed with the right secret', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ role: 'lead', username: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setIssuedAt(now - 31 * 86400)
      .setExpirationTime(now - 86400)
      .sign(key);
    await expect(verifyToken(expired, config)).rejects.toThrow();
  });

  it('rejects an unsigned alg:none token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = new UnsecuredJWT({ role: 'admin', username: 'alice' })
      .setSubject('u-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 86400)
      .encode();
    expect(unsigned.split('.')[2]).toBe(''); // really unsigned
    await expect(verifyToken(unsigned, config)).rejects.toThrow();
  });

  it('rejects a correctly signed token that is missing role', async () => {
    const now = Math.floor(Date.now() / 1000);
    const roleless = await new SignJWT({ username: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 86400)
      .sign(key);
    await expect(verifyToken(roleless, config)).rejects.toThrow();
  });

  it('rejects a correctly signed token whose role is not one of the three', async () => {
    const now = Math.floor(Date.now() / 1000);
    const bogus = await new SignJWT({ role: 'superuser', username: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 86400)
      .sign(key);
    await expect(verifyToken(bogus, config)).rejects.toThrow();
  });

  it('rejects a correctly signed token with no iat', async () => {
    const now = Math.floor(Date.now() / 1000);
    const noIat = await new SignJWT({ role: 'lead', username: 'alice' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setExpirationTime(now + 86400)
      .sign(key);
    await expect(verifyToken(noIat, config)).rejects.toThrow();
  });

  it('returns only the five session claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    const extra = await new SignJWT({ role: 'lead', username: 'alice', admin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u-1')
      .setIssuedAt(now)
      .setExpirationTime(now + 86400)
      .sign(key);
    const claims = await verifyToken(extra, config);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'role', 'sub', 'username']);
  });

  it('asks for a refresh once the token is older than seven days, not before', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      shouldRefresh(
        { sub: 'u', role: 'lead', username: 'a', iat: now - 6 * 86400, exp: now },
        config,
      ),
    ).toBe(false);
    expect(
      shouldRefresh(
        { sub: 'u', role: 'lead', username: 'a', iat: now - 8 * 86400, exp: now },
        config,
      ),
    ).toBe(true);
  });

  it('measures token age against an injected clock when one is given', () => {
    const iat = 1_800_000_000;
    const claims = { sub: 'u', role: 'lead' as const, username: 'a', iat, exp: iat + 30 * 86400 };
    const at = (days: number) => () => (iat + days * 86400) * 1000;
    expect(shouldRefresh(claims, config, at(6.9))).toBe(false);
    expect(shouldRefresh(claims, config, at(7.1))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { loginInput, loginOutput, refreshTokenInput } from './auth';

describe('the auth wire schemas (SPEC-FINAL 7.5)', () => {
  it('require a non-empty username and password, and a non-empty token', () => {
    expect(loginInput.safeParse({ username: 'a', password: 'b' }).success).toBe(true);
    expect(loginInput.safeParse({ username: '', password: 'b' }).success).toBe(false);
    expect(loginInput.safeParse({ username: 'a' }).success).toBe(false);
    expect(refreshTokenInput.safeParse({ token: '' }).success).toBe(false);
  });

  it('strip anything but the five public user fields from a login result', () => {
    const parsed = loginOutput.parse({
      token: 't',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'a',
        full_name: 'A',
        role: 'lead',
        must_change_password: false,
        password_hash: '$2a$10$x',
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('password_hash');
  });
});

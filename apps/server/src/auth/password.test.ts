import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';

describe('password hashing (SPEC-FINAL 7.5)', () => {
  it('hashes with bcrypt at cost 10 and verifies only the right password', async () => {
    const hash = await hashPassword('correct horse');
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(BCRYPT_COST).toBe(10);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('correct horsf', hash)).toBe(false);
  });

  it('keeps a dummy hash at the same cost, so an unknown user costs the same as a wrong password', async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2a\$10\$[./A-Za-z0-9]{53}$/);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('seedpass1', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

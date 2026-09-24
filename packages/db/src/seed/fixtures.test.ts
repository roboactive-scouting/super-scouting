import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { SEED } from './fixtures';

/**
 * Regression test for a hand-typed hash that was never actually bcrypt('seedpass1').
 * Login didn't exist when the seed was written, so nothing caught it (commit e8da097).
 */
describe('SEED.passwordHash', () => {
  it('is a real cost-10 bcrypt hash of "seedpass1"', async () => {
    expect(SEED.passwordHash).toMatch(/^\$2[ab]\$10\$/);
    await expect(bcrypt.compare('seedpass1', SEED.passwordHash)).resolves.toBe(true);
  });
});

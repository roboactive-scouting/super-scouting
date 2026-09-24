import bcrypt from 'bcryptjs';

/** SPEC-FINAL 7.5 / D1: bcrypt cost 10 via bcryptjs — pure JS, no native build on Vercel. */
export const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A cost-10 bcrypt hash of a random string that was discarded the moment it was hashed:
 * no password verifies against it. `login` compares against it when the username is
 * unknown, so an unknown user costs the same bcrypt round as a wrong password and the
 * response time does not reveal which usernames exist.
 *
 * Hard-coded rather than generated at module load: generating one needs a secure random
 * source, and a load-time failure there would take the whole function down.
 */
export const DUMMY_PASSWORD_HASH = '$2a$10$7VlgGGLSP5BKhfpuSwH9tu9Fnsni7TeRAUC5VcJocBS2rWdIZotAm';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

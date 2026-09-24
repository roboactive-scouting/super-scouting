/**
 * No 0/O, 1/l/I: the admin reads this aloud or copies it onto paper for a student, and a
 * character that reads as another is a failed first sign-in.
 */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const GENERATED_PASSWORD_LENGTH = 12;

type FillRandom = (buffer: Uint8Array) => Uint8Array;

const cryptoFill: FillRandom = (buffer) => crypto.getRandomValues(buffer);

/**
 * A random password from `crypto.getRandomValues`, by rejection sampling: a byte at or
 * above the largest multiple of the alphabet's length is skipped, so every character is
 * equally likely. Never stored anywhere — the caller holds it in component state only.
 */
export function generatePassword(fill: FillRandom = cryptoFill): string {
  const n = PASSWORD_ALPHABET.length;
  const cutoff = 256 - (256 % n);
  let out = '';
  while (out.length < GENERATED_PASSWORD_LENGTH) {
    const bytes = fill(new Uint8Array(GENERATED_PASSWORD_LENGTH));
    for (const byte of bytes) {
      if (byte >= cutoff) continue;
      out += PASSWORD_ALPHABET[byte % n];
      if (out.length === GENERATED_PASSWORD_LENGTH) break;
    }
  }
  return out;
}

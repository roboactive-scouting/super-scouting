import { describe, expect, it, vi } from 'vitest';
import { GENERATED_PASSWORD_LENGTH, PASSWORD_ALPHABET, generatePassword } from './password';

describe('generatePassword', () => {
  it('is 12 characters from the unambiguous alphabet', () => {
    expect(GENERATED_PASSWORD_LENGTH).toBe(12);
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      for (const ch of p) expect(PASSWORD_ALPHABET).toContain(ch);
    }
  });

  it('never uses a character that reads as another: 0 O 1 l I', () => {
    for (const ch of '0O1lI') expect(PASSWORD_ALPHABET).not.toContain(ch);
    expect(new Set(PASSWORD_ALPHABET).size).toBe(PASSWORD_ALPHABET.length);
  });

  it('draws from crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generatePassword();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips the bytes that would bias the draw', () => {
    const cutoff = 256 - (256 % PASSWORD_ALPHABET.length);
    // The first byte sits in the biased tail and must be skipped; the rest map to index 0.
    const bytes = [cutoff, ...Array<number>(GENERATED_PASSWORD_LENGTH).fill(0)];
    const fill = (buf: Uint8Array): Uint8Array => {
      for (let i = 0; i < buf.length; i++) buf[i] = bytes.shift() ?? 0;
      return buf;
    };
    expect(generatePassword(fill)).toBe(PASSWORD_ALPHABET[0]!.repeat(GENERATED_PASSWORD_LENGTH));
  });
});

import { describe, expect, it, vi } from 'vitest';
import { passwordSchema } from '@frc/shared';
import {
  PASSWORD_WORDS,
  generatePassword,
  generatePasswordWith,
  randomIntFrom,
  suggestUsername,
} from './password';

describe('generated passwords and usernames', () => {
  it('is three parts, word-word-two digits, and passes the server rule', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(passwordSchema.safeParse(p).success).toBe(true);
    }
  });

  it('is deterministic with an injected random source', () => {
    expect(generatePassword(() => 0)).toBe(generatePassword(() => 0));
    expect(generatePassword(() => 0)).toBe(`${PASSWORD_WORDS[0]}-${PASSWORD_WORDS[0]}-00`);
  });

  it('suggests first name + first letter of the last name, unique', () => {
    expect(suggestUsername('Gal Levy', new Set())).toBe('gal.l');
    expect(suggestUsername('Gal Levy', new Set(['gal.l']))).toBe('gal.l2');
    expect(suggestUsername('Noa', new Set())).toBe('noa');
  });

  it('keeps only what a username may hold, and Hebrew names whole', () => {
    expect(suggestUsername('  Amit  Ben-David ', new Set())).toBe('amit.b');
    expect(suggestUsername("O'Brien Smith", new Set())).toBe('obrien.s');
    expect(suggestUsername('נועה לוי', new Set())).toBe('נועה.ל');
    expect(suggestUsername('   ', new Set())).toBe('');
    expect(suggestUsername('Gal Levy', new Set(['gal.l', 'gal.l2']))).toBe('gal.l3');
  });

  it('draws from a list of 256 distinct lowercase words', () => {
    expect(PASSWORD_WORDS).toHaveLength(256);
    expect(new Set(PASSWORD_WORDS).size).toBe(256);
    for (const w of PASSWORD_WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
  });
});

describe('generatePasswordWith (a byte source, as before RB.14)', () => {
  it('draws from crypto.getRandomValues by default', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    expect(generatePasswordWith()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips the bytes that would bias the draw', () => {
    // For the two digits (n = 100) bytes 200..255 are skipped: 250 is dropped, 7 is used.
    const bytes = [0, 1, 250, 7];
    const fill = (buf: Uint8Array): Uint8Array => {
      buf[0] = bytes.shift() ?? 0;
      return buf;
    };
    expect(generatePasswordWith(fill)).toBe(`${PASSWORD_WORDS[0]}-${PASSWORD_WORDS[1]}-07`);
    expect(randomIntFrom(() => new Uint8Array([255]))(256)).toBe(255);
  });
});

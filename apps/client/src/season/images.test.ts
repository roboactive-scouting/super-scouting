import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEASON_IMAGE_MANIFEST } from '@frc/shared';
import { imageUrlFor, isKnownSeasonImage } from './images';

describe('the season image manifest (SPEC-FINAL 16.7)', () => {
  it('names only files that are actually committed', () => {
    for (const path of SEASON_IMAGE_MANIFEST) {
      expect(existsSync(join(import.meta.dirname, '../../public', path)), path).toBe(true);
    }
  });

  it('recognises a committed path and rejects one that is not', () => {
    expect(isKnownSeasonImage(SEASON_IMAGE_MANIFEST[0]!)).toBe(true);
    expect(isKnownSeasonImage('seasons/1999/field.webp')).toBe(false);
    expect(isKnownSeasonImage('../../etc/passwd')).toBe(false);
  });

  it('serves the image from the app origin, so the service worker can precache it', () => {
    expect(imageUrlFor('seasons/2026/field.webp')).toBe('/seasons/2026/field.webp');
  });
});

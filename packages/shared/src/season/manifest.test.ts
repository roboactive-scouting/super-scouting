import { describe, expect, it } from 'vitest';
import { SEASON_IMAGE_MANIFEST } from './manifest';
import { SEASON_IMAGE_MANIFEST as fromIndex } from '../index';

describe('the season image manifest (SPEC-FINAL 6.4, 16.7; task 1.18)', () => {
  it('lists the committed 2026 game image', () => {
    expect(SEASON_IMAGE_MANIFEST).toContain('seasons/2026/field.webp');
  });

  it('lists only .webp files one level under seasons/<year>/, as the service worker precaches them', () => {
    for (const path of SEASON_IMAGE_MANIFEST) {
      expect(path).toMatch(/^seasons\/\d{4}\/[^/]+\.webp$/);
    }
  });

  it('is sorted and has no duplicates, so regenerating it is stable', () => {
    expect([...SEASON_IMAGE_MANIFEST]).toEqual([...new Set(SEASON_IMAGE_MANIFEST)].sort());
  });

  it('is exported from the package root, which is what both apps import', () => {
    expect(fromIndex).toBe(SEASON_IMAGE_MANIFEST);
  });
});

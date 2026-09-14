import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('PWA install identity (SPEC-FINAL 17.8)', () => {
  it('uses the exact manifest name and short name', () => {
    expect(viteConfig).toContain("name: 'ROBACTIVE Scouting'");
    expect(viteConfig).toContain("short_name: 'Scouting'");
  });

  it('is standalone, near-black, and orientation-unlocked', () => {
    expect(viteConfig).toContain("display: 'standalone'");
    expect(viteConfig).toContain("theme_color: '#0A0A0B'");
    expect(viteConfig).toContain("background_color: '#0A0A0B'");
    expect(viteConfig).toContain("orientation: 'any'");
  });

  it('ships the trefoil mark at 192, 512, maskable 512 and an Apple touch icon', () => {
    for (const file of [
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-512-maskable.png',
      'icons/apple-touch-icon-180.png',
    ]) {
      expect(existsSync(join(root, 'public', file)), file).toBe(true);
    }
    expect(viteConfig).toContain("purpose: 'maskable'");
  });

  it('ships the logo lockup and the mark as static assets', () => {
    expect(existsSync(join(root, 'public/brand/logo.png'))).toBe(true);
    expect(existsSync(join(root, 'public/brand/mark.png'))).toBe(true);
  });

  it('precaches the app shell, the fonts and the season game images', () => {
    expect(viteConfig).toContain('globPatterns');
    expect(viteConfig).toContain('woff2');
    expect(viteConfig).toContain('webp');
  });
});

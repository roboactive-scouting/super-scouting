import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { clearDevicePrefs } from '@/lib/devicePrefs';
import { applyDeviceLook, DEFAULT_THEME, textScale, theme } from './theme';

beforeEach(async () => {
  await db.delete();
  await db.open();
  // The choices live in localStorage (task 1.38: readable before the first paint).
  clearDevicePrefs();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('--text-scale');
});

describe('theme (SPEC-FINAL 17.4)', () => {
  it('defaults to light', async () => {
    expect(DEFAULT_THEME).toBe('light');
    expect(theme.get()).toBe('light');
    await theme.apply();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('offers exactly Light and the outdoor high-contrast theme (SPEC-FINAL 8.6)', () => {
    expect(theme.options).toEqual(['light', 'outdoor']);
  });

  it('refuses an unknown theme id and keeps the one in force', async () => {
    await theme.set('outdoor');
    await expect(theme.set('dark' as never)).rejects.toThrow();
    expect(theme.get()).toBe('outdoor');
    expect(document.documentElement.dataset.theme).toBe('outdoor');
  });

  it('persists the choice on this device and reapplies it after a reload', async () => {
    await theme.set('outdoor');
    await theme.apply();
    expect(document.documentElement.dataset.theme).toBe('outdoor');
  });

  it('applies the saved theme and size at start, with nothing else set (main.tsx)', async () => {
    await theme.set('outdoor');
    await textScale.set(1.5);
    // A reload: the page starts with nothing on <html>.
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--text-scale');
    applyDeviceLook();
    expect(document.documentElement.dataset.theme).toBe('outdoor');
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5');
  });

  it('switches the whole app the moment it is picked', async () => {
    await theme.set('outdoor');
    expect(document.documentElement.dataset.theme).toBe('outdoor');
    await theme.set('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to light when the stored value is not a theme', async () => {
    window.localStorage.setItem('device.theme', 'neon');
    expect(theme.get()).toBe('light');
  });
});

describe('text scale (SPEC-FINAL 8.6, 17.7)', () => {
  it('is a multiplier on top of the OS size, not a replacement', async () => {
    await textScale.set(1.3);
    await textScale.apply();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.3');
  });

  it('offers four steps and refuses anything outside them', async () => {
    expect(textScale.options).toEqual([1, 1.15, 1.3, 1.5]);
    await expect(textScale.set(3 as never)).rejects.toThrow();
  });

  it('defaults to 100%', async () => {
    expect(textScale.get()).toBe(1);
    await textScale.apply();
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1');
  });
});

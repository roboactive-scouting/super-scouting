import { useSyncExternalStore } from 'react';
import { readPref, subscribePrefs, writePref } from '@/lib/devicePrefs';

/**
 * The look of this device (SPEC-FINAL 8.6, 17.4, 17.7; task 1.38; 16-settings final). Small and
 * on the initial path: `main.tsx` calls `applyDeviceLook()` before React renders, so the first
 * paint is already in the chosen theme and size.
 */

/** Light is the everyday look; Outdoor is the high-contrast theme for sunlight (17.4). */
export const THEMES = ['light', 'outdoor'] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = 'light';

/** The in-app text size: a multiplier on top of the phone's own text size (8.6, 17.7). */
export const TEXT_SCALES = [1, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

const isTheme = (value: unknown): value is ThemeId => THEMES.some((t) => t === value);
const isScale = (value: unknown): value is TextScale => TEXT_SCALES.some((s) => s === value);

export const theme = {
  options: THEMES,
  /** The theme this device chose, else Light. */
  get(): ThemeId {
    const stored = readPref('theme');
    return isTheme(stored) ? stored : DEFAULT_THEME;
  },
  /** Saves the choice on this device and switches the whole app to it. Refuses an unknown id. */
  async set(id: ThemeId): Promise<void> {
    if (!isTheme(id)) throw new Error(`Unknown theme: ${String(id)}`);
    writePref('theme', id);
    theme.apply();
  },
  /** Puts the saved theme on `<html data-theme>`, where theme.css reads it. */
  apply(): void {
    const id = theme.get();
    document.documentElement.dataset.theme = id;
    // The phone's status bar follows the top bar's colour (`--rail`) of the theme now in force.
    const rail = getComputedStyle(document.documentElement).getPropertyValue('--rail').trim();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta && rail) meta.content = rail;
  },
};

export const textScale = {
  options: TEXT_SCALES,
  /** The step this device chose, else 100 %. */
  get(): TextScale {
    const stored = Number(readPref('textScale'));
    return isScale(stored) ? stored : 1;
  },
  /** Saves the step on this device and resizes the whole app. Refuses anything but the four. */
  async set(scale: TextScale): Promise<void> {
    if (!isScale(scale)) throw new Error(`Unknown text size: ${String(scale)}`);
    writePref('textScale', String(scale));
    textScale.apply();
  },
  /**
   * Sets `--text-scale` on `<html>`, whose font size is `calc(100% * var(--text-scale))`
   * (index.css): every rem in the app follows, on top of the phone's own text size.
   */
  apply(): void {
    document.documentElement.style.setProperty('--text-scale', String(textScale.get()));
  },
};

/** "115%": a step as the page says it. */
export function scaleLabel(scale: TextScale): string {
  return `${Math.round(scale * 100)}%`;
}

/** App start: the saved theme and text size, before the first paint. */
export function applyDeviceLook(): void {
  theme.apply();
  textScale.apply();
}

/** The theme in force, kept current. */
export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribePrefs, theme.get, theme.get);
}

/** The text size in force, kept current. */
export function useTextScale(): TextScale {
  return useSyncExternalStore(subscribePrefs, textScale.get, textScale.get);
}

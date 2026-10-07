import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WIDTHS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 375, height: 812 },
} as const;

/** One screen at both design widths: picture, no sideways scroll, no serious a11y problem. */
export async function shoot(page: Page, name: string, only?: keyof typeof WIDTHS) {
  for (const [label, size] of Object.entries(WIDTHS)) {
    if (only && only !== label) continue;
    await page.setViewportSize(size);
    await page.waitForLoadState('networkidle');
    // two frames after the resize, with the fonts in, so the picture is the settled layout
    await page.evaluate(() =>
      document.fonts.ready.then(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      ),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${name} ${label}: horizontal overflow`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      bad.map((v) => `${v.id}: ${v.help}`),
      `${name} ${label}: axe`,
    ).toEqual([]);
    await page.screenshot({
      path: fileURLToPath(new URL(`./__screens__/${name}-${label}.png`, import.meta.url)),
      fullPage: label === 'phone',
      animations: 'disabled',
    });
  }
}

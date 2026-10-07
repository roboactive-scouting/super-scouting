import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WIDTHS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 375, height: 812 },
} as const;

const screenPath = (file: string) =>
  fileURLToPath(new URL(`./__screens__/${file}.png`, import.meta.url));

/**
 * One screen at both design widths: picture, no sideways scroll, no serious a11y problem.
 * The pictures are viewport-sized (phone 375x812, desktop 1440x900) like the design finals.
 * `opts.long` adds `<name>-phone-long.png`: the whole phone page, with fixed/sticky bars
 * laid out once at their place in the page instead of floating over the middle.
 */
export async function shoot(
  page: Page,
  name: string,
  only?: keyof typeof WIDTHS,
  opts: { long?: boolean } = {},
) {
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
    // a menu or sheet still sliding in would be measured half-faded (axe contrast flaked on it)
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${name} ${label}: horizontal overflow`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      bad.map((v) => `${v.id}: ${v.help} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      `${name} ${label}: axe`,
    ).toEqual([]);
    await page.screenshot({
      path: screenPath(`${name}-${label}`),
      fullPage: false,
      animations: 'disabled',
    });
    if (opts.long && label === 'phone') {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const position = getComputedStyle(el).position;
          if (position === 'fixed' || position === 'sticky') el.dataset.shootStatic = '';
        }
        const style = document.createElement('style');
        style.id = 'shoot-long-style';
        style.textContent = '[data-shoot-static]{position:static !important;}';
        document.head.append(style);
      });
      await page.screenshot({
        path: screenPath(`${name}-phone-long`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.evaluate(() => {
        document.getElementById('shoot-long-style')?.remove();
        for (const el of document.querySelectorAll<HTMLElement>('[data-shoot-static]')) {
          delete el.dataset.shootStatic;
        }
      });
    }
  }
}

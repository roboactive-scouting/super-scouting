import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WIDTHS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 375, height: 812 },
} as const;

/** Shot only when asked for by name: 1024 x 768, the narrowest desktop (desktop-only pages). */
const EXTRA = { laptop: { width: 1024, height: 768 } } as const;

const screenPath = (file: string) =>
  fileURLToPath(new URL(`./__screens__/${file}.png`, import.meta.url));

/**
 * Waits for a still page: the fonts in, then every running animation and transition
 * finished, re-checked after two frames because one that ends can start another (a page
 * fading in, then its content rising). A page or sheet measured mid-fade fails axe colour
 * contrast on text that is fine at rest (smoke-home's footer flaked on it). Endless
 * animations (a skeleton's pulse) are not waited for, and the whole wait gives up after
 * `timeout` ms rather than hang the test.
 */
async function settle(page: Page, timeout = 3_000) {
  await page.evaluate(async (ms) => {
    const frames = () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const deadline = performance.now() + ms;
    await document.fonts.ready;
    for (;;) {
      await frames();
      const running = document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
      const left = deadline - performance.now();
      if (running.length === 0 || left <= 0) return;
      await Promise.race([
        Promise.all(running.map((a) => a.finished.catch(() => undefined))),
        new Promise((done) => setTimeout(done, left)),
      ]);
    }
  }, timeout);
}

/**
 * One screen at both design widths: picture, no sideways scroll, no serious a11y problem.
 * The pictures are viewport-sized (phone 375x812, desktop 1440x900) like the design finals.
 * `opts.long` adds `<name>-phone-long.png`: the whole phone page, with fixed/sticky bars
 * laid out once at their place in the page instead of floating over the middle.
 */
export async function shoot(
  page: Page,
  name: string,
  only?: keyof typeof WIDTHS | keyof typeof EXTRA,
  opts: { long?: boolean } = {},
) {
  // `only: 'laptop'` writes `<name>-laptop.png` at 1024 x 768.
  for (const [label, size] of Object.entries(only === 'laptop' ? EXTRA : WIDTHS)) {
    if (only && only !== label) continue;
    await page.setViewportSize(size);
    // The pointer would stay on the last control clicked and its hover veil would tint it.
    await page.mouse.move(0, 0);
    await page.waitForLoadState('networkidle');
    await settle(page);
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
          // The room the page keeps under its content for the fixed bottom bar is empty once
          // that bar sits in the flow, so the long shot ends at the bar (RB.19). The raised
          // button's share (--below-content) moves above the bar, as at the end of a scroll:
          // an ActionBar reaches down through it and sits flush on the bar.
          if (position === 'fixed' && getComputedStyle(el).bottom === '0px' && el.parentElement) {
            el.parentElement.dataset.shootFlush = '';
            el.dataset.shootBelow = '';
          }
        }
        const style = document.createElement('style');
        style.id = 'shoot-long-style';
        style.textContent =
          '[data-shoot-static]{position:static !important;}[data-shoot-flush]{padding-bottom:0 !important;}[data-shoot-below]{margin-top:var(--below-content,0px) !important;}';
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
        for (const el of document.querySelectorAll<HTMLElement>('[data-shoot-flush]')) {
          delete el.dataset.shootFlush;
        }
        for (const el of document.querySelectorAll<HTMLElement>('[data-shoot-below]')) {
          delete el.dataset.shootBelow;
        }
      });
    }
  }
}

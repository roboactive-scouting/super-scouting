import type { Locator, Page } from '@playwright/test';

/**
 * A one-finger drag through Chrome's own touch input (DevTools protocol), so the page gets
 * the real pointer and touch events a phone sends — Playwright's touchscreen only taps.
 * Starts at the middle of `from` (or at the page point `from`), moves by (`dx`, `dy`) in `steps` moves `stepMs` apart,
 * then lifts. Slow steps make a drag, fast ones a flick.
 */
export async function touchDrag(
  page: Page,
  from: Locator | { x: number; y: number },
  {
    dx = 0,
    dy = 0,
    steps = 12,
    stepMs = 30,
  }: { dx?: number; dy?: number; steps?: number; stepMs?: number },
) {
  // A finger lands on what is on screen, not where a moving element was measured: wait out
  // every finite animation first (a phase's 32 px entrance, a sheet rising), or the touch
  // lands beside its target (UF.5 addendum: a tap on + hit the value next to it).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  const box = 'boundingBox' in from ? await from.boundingBox() : { ...from, width: 0, height: 0 };
  if (!box) throw new Error('touchDrag: the start element is not on screen');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x, y }]);
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(stepMs);
    await touch('touchMove', [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }]);
  }
  await touch('touchEnd', []);
  await cdp.detach();
}

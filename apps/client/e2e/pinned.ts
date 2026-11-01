import type { Page } from '@playwright/test';

/*
 * Phase 1 I side task 2 (plan v1.30): nothing pinned floats. Samples a band of the viewport (every
 * 2 px down, every 12 px across) and returns each point whose topmost element is not inside one
 * of `owners`: content showing between or through pinned bars. An empty list means the band is
 * all bar.
 */
export async function showsThrough(
  page: Page,
  band: { top: number; bottom: number; left: number; right: number },
  owners: string[],
): Promise<string[]> {
  return page.evaluate(
    ({ band, owners }) => {
      const out: string[] = [];
      for (let y = Math.ceil(band.top) + 0.5; y < band.bottom - 0.5; y += 2) {
        for (let x = band.left + 2; x < band.right - 2; x += 12) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !owners.some((o) => hit.closest(o))) {
            const what = hit
              ? `${hit.tagName.toLowerCase()}.${hit.className}`.slice(0, 60)
              : 'none';
            out.push(`(${x}, ${y}) ${what}`);
          }
        }
      }
      return out;
    },
    { band, owners },
  );
}

import { NotFoundException } from '@zxing/library';

/**
 * A fix for `@zxing/library`'s QR finder (0.21.x), the reader the receiver uses where the browser
 * has no BarcodeDetector (iPhone Safari). DEVIATIONS "Phase 1 G fix".
 *
 * A QR code's three finder patterns are found by scanning rows for dark–light–dark–light–dark runs
 * in the ratio 1:1:3:1:1. The data area of a version-18 code (89 modules) holds such runs by
 * chance, and zxing-js has two habits that let them win:
 * - it stops scanning once it holds three confirmed candidates of about the same module size, and
 *   skips rows towards where it guesses the third one is, so the real third finder is often never
 *   reached;
 * - it picks the three by module size alone (zxing's Java reader picks them by shape since 3.4:
 *   the three corners of a right isosceles triangle).
 * On clean renders of random full frames it missed a third to two fifths of codes at 6–12 px a
 * module — the scale a 1080p camera sees — some at every scale, and a frame that is never read
 * never completes its batch. With the two habits replaced — the whole picture scanned, and the
 * best triangle chosen as Java does — every one of them was read.
 */

/** What this fix uses of zxing's `FinderPattern`. */
type Pattern = {
  getX(): number;
  getY(): number;
  getEstimatedModuleSize(): number;
  getCount(): number;
};

/** The private members of zxing's `FinderPatternFinder` this fix replaces or reads. */
type FinderInternals = {
  possibleCenters: Pattern[];
  selectBestPatterns(): Pattern[];
  findRowSkip(): number;
  haveMultiplyConfirmedCenters(): boolean;
};

/** zxing's own: a candidate seen fewer times than this is noise. */
const CENTER_QUORUM = 2;

const squared = (a: Pattern, b: Pattern) => {
  const x = a.getX() - b.getX();
  const y = a.getY() - b.getY();
  return x * x + y * y;
};

/**
 * zxing 3.4's `selectBestPatterns` (Java), ported: of the candidates seen at least twice, the
 * three of similar module size (within 1.4×) closest to a right isosceles triangle — for sides
 * a ≤ b ≤ c, the least |c − 2b| + |c − 2a|. Throws zxing's NotFoundException (which its scan
 * loop retries after) when no three qualify.
 */
export function selectByGeometry(candidates: readonly Pattern[]): Pattern[] {
  const centers = candidates
    .filter((center) => center.getCount() >= CENTER_QUORUM)
    .sort((a, b) => a.getEstimatedModuleSize() - b.getEstimatedModuleSize());
  let best: Pattern[] | null = null;
  let distortion = Infinity;
  for (let i = 0; i < centers.length - 2; i += 1) {
    const fi = centers[i]!;
    const smallest = fi.getEstimatedModuleSize();
    for (let j = i + 1; j < centers.length - 1; j += 1) {
      const fj = centers[j]!;
      const ij = squared(fi, fj);
      for (let k = j + 1; k < centers.length; k += 1) {
        const fk = centers[k]!;
        if (fk.getEstimatedModuleSize() > smallest * 1.4) continue;
        const [a, b, c] = [ij, squared(fj, fk), squared(fi, fk)].sort((x, y) => x - y) as [
          number,
          number,
          number,
        ];
        const d = Math.abs(c - 2 * b) + Math.abs(c - 2 * a);
        if (d < distortion) {
          distortion = d;
          best = [fi, fj, fk];
        }
      }
    }
  }
  if (!best) throw new NotFoundException();
  return best;
}

/** Marks a patched finder, so a test can tell the shipped reader has the fix. */
export const IMPROVED = Symbol.for('frc.qr.finder-improved');

/**
 * Replaces the two habits on a `FinderPatternFinder` class (zxing's, whichever build of it the
 * caller holds): no early stop and no row skipping, and the geometric choice.
 */
export function improveFinder(finder: { prototype: object }): void {
  const proto = finder.prototype as FinderInternals & { [IMPROVED]?: true };
  if (proto[IMPROVED]) return;
  proto.selectBestPatterns = function (this: FinderInternals) {
    return selectByGeometry(this.possibleCenters);
  };
  proto.findRowSkip = () => 0;
  proto.haveMultiplyConfirmedCenters = () => false;
  proto[IMPROVED] = true;
}

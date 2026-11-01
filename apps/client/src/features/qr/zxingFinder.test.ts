import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  NotFoundException,
  QRCodeReader,
  RGBLuminanceSource,
} from '@zxing/library';
// The build of the finder that `@zxing/library` resolves to here (vitest loads its `main`, cjs/);
// the app patches the esm/ build its bundle uses (qrScanner.ts).
import FinderPatternFinder from '@zxing/library/cjs/core/qrcode/detector/FinderPatternFinder';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { frameToText, QR_VERSION } from '@frc/shared/qr';
import { improveFinder, IMPROVED, selectByGeometry } from './zxingFinder';

/** A finder-pattern candidate as zxing holds one. */
const at = (x: number, y: number, size = 8, count = 2) => ({
  getX: () => x,
  getY: () => y,
  getEstimatedModuleSize: () => size,
  getCount: () => count,
});

/** Seeded bytes, so the codes this file draws are the same every run. */
function bytes(seed: number, length: number) {
  let s = seed;
  return Uint8Array.from({ length }, () => {
    s = (s * 16807) % 2147483647;
    return s % 256;
  });
}

/**
 * A full frame's code as the sender draws it, `px` pixels a module, on a grey 1920×1080 picture
 * with sensor noise — about what a 1080p camera sees of the screen from 20 cm.
 */
function cameraView(seed: number, px: number) {
  const code = QRCode.create([{ data: frameToText(bytes(seed, 512)), mode: 'alphanumeric' }], {
    errorCorrectionLevel: 'M',
    version: QR_VERSION,
  });
  const [w, h] = [1920, 1080];
  const luma = new Uint8ClampedArray(w * h).fill(190);
  const size = code.modules.size * px;
  const [ox, oy] = [Math.floor((w - size) / 2), Math.floor((h - size) / 2)];
  for (let y = oy - 3 * px; y < oy + size + 3 * px; y += 1) {
    luma.fill(235, y * w + ox - 3 * px, y * w + ox + size + 3 * px);
  }
  for (let row = 0; row < code.modules.size; row += 1) {
    for (let col = 0; col < code.modules.size; col += 1) {
      if (!code.modules.get(row, col)) continue;
      for (let y = 0; y < px; y += 1) {
        const start = (oy + row * px + y) * w + ox + col * px;
        luma.fill(35, start, start + px);
      }
    }
  }
  let noise = seed;
  for (let i = 0; i < luma.length; i += 1) {
    noise = (noise * 16807) % 2147483647;
    luma[i] = luma[i]! + ((noise % 17) - 8);
  }
  return { luma, w, h };
}

const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
/** How many of `seeds` zxing's QR reader reads at `px` pixels a module. */
function readable(seeds: number[], px: number) {
  const reader = new QRCodeReader();
  return seeds.filter((seed) => {
    const { luma, w, h } = cameraView(seed, px);
    try {
      const text = reader.decode(
        new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luma, w, h))),
        hints,
      );
      return text.getText() === frameToText(bytes(seed, 512));
    } catch {
      return false;
    }
  }).length;
}

describe('the zxing QR finder fix (DEVIATIONS, Phase 1 G fix)', () => {
  it('chooses the three candidates that make a right isosceles triangle', () => {
    const corners = [at(60, 60), at(700, 60), at(60, 700)];
    // A false candidate from the data area, the same module size, seen as often.
    const decoy = at(400, 380);
    expect(selectByGeometry([decoy, ...corners])).toEqual(
      expect.arrayContaining(corners) as unknown,
    );
    expect(selectByGeometry([corners[0]!, decoy, corners[1]!, corners[2]!])).not.toContain(decoy);
  });

  it('leaves out a candidate seen once, and one of a very different module size', () => {
    const corners = [at(60, 60), at(700, 60), at(60, 700)];
    const once = at(700, 700, 8, 1);
    const big = at(700, 700, 14);
    expect(selectByGeometry([...corners, once])).not.toContain(once);
    expect(selectByGeometry([...corners, big])).not.toContain(big);
  });

  it('throws zxing’s NotFoundException (which its scan loop retries after) without three', () => {
    expect(() => selectByGeometry([at(0, 0), at(10, 0)])).toThrow(NotFoundException);
    expect(() => selectByGeometry([at(0, 0), at(10, 0), at(0, 10, 8, 1)])).toThrow(
      NotFoundException,
    );
  });

  it('reads every full frame a 1080p camera sees, where zxing alone misses some', () => {
    const seeds = Array.from({ length: 24 }, (_, i) => 1000 + i);
    const scales = [6, 8, 10];
    const before = scales.map((px) => readable(seeds, px));
    improveFinder(FinderPatternFinder);
    expect((FinderPatternFinder.prototype as { [IMPROVED]?: true })[IMPROVED]).toBe(true);
    const after = scales.map((px) => readable(seeds, px));
    // zxing alone reads about half of them at each scale (12, 13 and 12 of 24 when written).
    expect(before.every((n) => n < seeds.length)).toBe(true);
    expect(after).toEqual(scales.map(() => seeds.length));
  }, 120_000);
});

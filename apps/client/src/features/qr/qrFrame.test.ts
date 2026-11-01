import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from '@zxing/library';
import FinderPatternFinder from '@zxing/library/cjs/core/qrcode/detector/FinderPatternFinder';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import {
  encodeBatch,
  frameToText,
  newCollector,
  QR_BATCH_MAX_OPERATIONS,
  QR_FRAME_BYTES,
  QR_HEADER_BYTES,
  QR_MODULES,
  QR_VERSION,
} from '@frc/shared/qr';
import { batchOperations, frameFromText, frameHeader } from './qrFrame';
import { improveFinder } from './zxingFinder';

// The receiver's reader has its finder fixed (qrScanner.ts); so does this file's zxing (vitest
// loads its cjs/ build, the app the esm/ one).
improveFinder(FinderPatternFinder);

const op = (i: number): Operation => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry',
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1',
    team_id: 't-1',
    match_id: 'm-1',
    form_kind: 'match',
    data: { n: i },
  },
  author_user_id: '00000000-0000-4000-8000-000000000006',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: i,
});

/** An operation whose notes do not compress, so a few of them fill several 500-byte frames. */
const bulky = (i: number): Operation => {
  const base = op(i);
  let seed = 7919 * (i + 1);
  const notes = Array.from({ length: 300 }, () => {
    seed = (seed * 16807) % 2147483647;
    return String.fromCharCode(33 + (seed % 90));
  }).join('');
  return { ...base, payload: { ...base.payload, data: { notes } } };
};

/** The sender's drawing (QrSendPage): one alphanumeric segment of Base45, level M, QR_VERSION. */
const draw = (text: string, version = QR_VERSION) =>
  QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M', version });

/**
 * Draws `frame` the way the sender does, `px` pixels a module, and decodes the picture with
 * zxing's own QR reader — the reader BrowserQRCodeReader wraps, with the page's hints — so the
 * test runs the real text path, not a stand-in.
 */
function scan(frame: Uint8Array, px = 3) {
  const code = draw(frameToText(frame));
  const quiet = 4;
  const side = (code.modules.size + 2 * quiet) * px;
  const luma = new Uint8ClampedArray(side * side).fill(255);
  for (let row = 0; row < code.modules.size; row += 1) {
    for (let col = 0; col < code.modules.size; col += 1) {
      if (!code.modules.get(row, col)) continue;
      for (let y = 0; y < px; y += 1) {
        const at = ((row + quiet) * px + y) * side + (col + quiet) * px;
        luma.fill(0, at, at + px);
      }
    }
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luma, side, side)));
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
  return new QRCodeReader().decode(bitmap, hints);
}

describe('the QR receiver reads frames as Base45 text (SPEC-FINAL 9.8; DEVIATIONS Phase 1 G fix)', () => {
  it('a full frame fits the fixed version, and not the version below it', () => {
    const full = new Uint8Array(QR_HEADER_BYTES + QR_FRAME_BYTES).fill(0xff);
    const text = frameToText(full);
    expect(text).toHaveLength(768);
    const code = draw(text);
    expect(code.version).toBe(QR_VERSION);
    expect(code.modules.size).toBe(QR_MODULES);
    expect(() => draw(text, QR_VERSION - 1)).toThrow(/cannot contain this amount of data/);
    // …and the smallest version that holds it is that one: qrcode picks it by itself.
    expect(
      QRCode.create([{ data: text, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).version,
    ).toBe(QR_VERSION);
  });

  it('decodes every frame of a real multi-frame batch from its picture, 3 px a module', () => {
    const operations = Array.from({ length: 6 }, (_, i) => bulky(i));
    const frames = encodeBatch(operations, 0xc0ffee01);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    // The first frames are full: 512 bytes, the largest a frame is.
    expect(frames[0]!.byteLength).toBe(QR_HEADER_BYTES + QR_FRAME_BYTES);
    const collector = newCollector();
    for (const frame of frames) {
      const bytes = frameFromText(scan(frame).getText());
      expect(bytes).toEqual(frame);
      collector.add(bytes!);
    }
    expect(frameHeader(frames[1]!)).toEqual({
      batchId: 0xc0ffee01,
      index: 1,
      count: frames.length,
    });
    expect(batchOperations(collector.result())).toEqual(operations);
  }, 30_000);

  it('still decodes a full frame at 2 px a module', () => {
    const [frame] = encodeBatch(
      Array.from({ length: 6 }, (_, i) => bulky(i)),
      7,
    );
    expect(frameFromText(scan(frame!, 2).getText())).toEqual(frame);
  }, 30_000);

  it('has nothing for a code that is not Base45, so it is ignored', () => {
    expect(frameFromText('https://example.com')).toBeNull();
    expect(frameFromText('B')).toBeNull();
    expect(frameFromText('héllo')).toBeNull();
    // Base45 but too short to be a frame: frameHeader turns it away.
    expect(frameHeader(frameFromText('BB8')!)).toBeNull();
  });

  it('refuses a header that cannot be one of ours', () => {
    expect(frameHeader(new Uint8Array(QR_HEADER_BYTES - 1))).toBeNull();
    const header = (index: number, count: number) => {
      const bytes = new Uint8Array(QR_HEADER_BYTES);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, 7, false);
      view.setUint16(4, index, false);
      view.setUint16(6, count, false);
      return bytes;
    };
    expect(frameHeader(header(0, 0))).toBeNull();
    expect(frameHeader(header(3, 3))).toBeNull();
    expect(frameHeader(header(2, 3))).toEqual({ batchId: 7, index: 2, count: 3 });
  });

  it('drops a batch that is not a list of operations', () => {
    expect(() => batchOperations([{ op_id: 'x' }])).toThrow();
    expect(() => batchOperations({})).toThrow();
  });

  it('drops a batch of more operations than a sender ever puts in one', () => {
    const ops = (n: number) => Array.from({ length: n }, (_, i) => op(i));
    expect(batchOperations(ops(QR_BATCH_MAX_OPERATIONS))).toHaveLength(QR_BATCH_MAX_OPERATIONS);
    expect(() => batchOperations(ops(QR_BATCH_MAX_OPERATIONS + 1))).toThrow();
  });
});

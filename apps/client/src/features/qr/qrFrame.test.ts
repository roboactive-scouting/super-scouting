import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
  ResultMetadataType,
} from '@zxing/library';
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import type { Operation } from '@frc/shared';
import { encodeBatch, newCollector, QR_HEADER_BYTES } from '@frc/shared/qr';
import { batchOperations, FRAME_CHARSET, frameBytes, frameHeader } from './qrFrame';

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

/**
 * Draws `frame` the way the sender does (QrSendPage: `qrcode`, one byte-mode segment, version 40,
 * level M) and decodes the picture with zxing's own QR reader — the reader BrowserQRCodeReader
 * wraps — so the test runs the real byte path, not a stand-in.
 */
function scan(frame: Uint8Array) {
  const code = QRCode.create([{ data: frame, mode: 'byte' }], {
    errorCorrectionLevel: 'M',
    version: 40,
  });
  const quiet = 4;
  const px = 3;
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
  const hints = new Map([[DecodeHintType.CHARACTER_SET, FRAME_CHARSET]]);
  return new QRCodeReader().decode(bitmap, hints);
}

describe('the QR receiver reads frames as bytes (SPEC-FINAL 9.8; task 1.48)', () => {
  it('takes a real frame’s bytes from BYTE_SEGMENTS, exactly as the sender encoded them', () => {
    const [frame] = encodeBatch([op(1), op(2)], 0xc0ffee01);
    const result = scan(frame!);
    expect(result.getResultMetadata().get(ResultMetadataType.BYTE_SEGMENTS)).toBeDefined();
    const bytes = frameBytes(result);
    expect(bytes).toEqual(frame);
    expect(frameHeader(bytes!)).toEqual({ batchId: 0xc0ffee01, index: 0, count: 1 });
    // …and the batch decodes from them.
    const collector = newCollector();
    collector.add(bytes!);
    expect(batchOperations(collector.result())).toEqual([op(1), op(2)]);
  }, 30_000);

  it('the text is not the frame: getText() loses binary bytes', () => {
    const [frame] = encodeBatch([op(3)], 0x01020304);
    const result = scan(frame!);
    const fromText = new TextEncoder().encode(result.getText());
    expect(fromText).not.toEqual(frame);
  }, 30_000);

  it('joins several byte segments in order, and has nothing for a code without one', () => {
    const metadata = new Map([
      [ResultMetadataType.BYTE_SEGMENTS, [Uint8Array.of(1, 2), Uint8Array.of(3)]],
    ]);
    expect(frameBytes({ getResultMetadata: () => metadata })).toEqual(Uint8Array.of(1, 2, 3));
    expect(frameBytes({ getResultMetadata: () => new Map() })).toBeNull();
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
});

import { ResultMetadataType, ZXingStringEncoding, type Result } from '@zxing/library';
import { operationSchema, type Operation } from '@frc/shared';
import { QR_HEADER_BYTES } from '@frc/shared/qr';

/**
 * The QR receiver's frame handling (SPEC-FINAL 9.8; task 1.48). Only the lazy receive page
 * imports this module, so `@zxing/library` and the codec never reach the initial chunk.
 */

/** The character set the page asks zxing to read byte-mode text in (never guessed). */
export const FRAME_CHARSET = 'ISO-8859-1';

/**
 * zxing turns every byte segment into text too, and fails the whole code when that throws. For
 * ISO-8859-1 outside what it recognises as a browser (a test's jsdom, a webview) it falls back to
 * `decodeURIComponent`, which throws on binary. Every byte is one ISO-8859-1 character, so this
 * decoder never throws; any other character set goes to the platform's TextDecoder as before.
 */
function decodeText(bytes: Uint8Array, encoding: string): string {
  if (encoding.toUpperCase() !== FRAME_CHARSET) return new TextDecoder(encoding).decode(bytes);
  let text = '';
  for (let at = 0; at < bytes.length; at += 4096) {
    text += String.fromCharCode(...bytes.subarray(at, at + 4096));
  }
  return text;
}
ZXingStringEncoding.customDecoder = decodeText;

/**
 * A decoded frame's raw bytes. The sender writes each frame as one **byte-mode** segment of
 * binary data (task 1.47), and `Result.getText()` is lossy for binary: zxing decodes the bytes
 * as text in a guessed character set. The bytes themselves are in the result's
 * `BYTE_SEGMENTS` metadata (QRCodeReader puts the decoder's byte segments there), one
 * Uint8Array per byte-mode segment; they are concatenated in order. Null when the code holds no
 * byte segment (a text or numeric code is not one of ours).
 */
export function frameBytes(result: Pick<Result, 'getResultMetadata'>): Uint8Array | null {
  const segments = result.getResultMetadata()?.get(ResultMetadataType.BYTE_SEGMENTS) as
    Uint8Array[] | undefined;
  if (!segments || segments.length === 0) return null;
  const bytes = new Uint8Array(segments.reduce((n, s) => n + s.byteLength, 0));
  let at = 0;
  for (const segment of segments) {
    bytes.set(segment, at);
    at += segment.byteLength;
  }
  return bytes;
}

export type FrameHeader = { batchId: number; index: number; count: number };

/**
 * The frame's header (codec: batch id 4 · frame index 2 · frame count 2 · CRC32 4, big-endian),
 * or null when the bytes cannot be one of our frames: too short, no frames, or an index past the
 * count. The page tracks which frames are held from this, so the cells fill in any order.
 */
export function frameHeader(bytes: Uint8Array): FrameHeader | null {
  if (bytes.byteLength < QR_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {
    batchId: view.getUint32(0, false),
    index: view.getUint16(4, false),
    count: view.getUint16(6, false),
  };
  return header.count === 0 || header.index >= header.count ? null : header;
}

/**
 * A completed batch's operations, checked against the push protocol's own schema: anything that
 * is not a list of operations throws, so a batch that passed its checksum but holds something
 * else is dropped whole like a damaged one, and nothing is written.
 */
export function batchOperations(raw: unknown): Operation[] {
  return operationSchema.array().parse(raw);
}

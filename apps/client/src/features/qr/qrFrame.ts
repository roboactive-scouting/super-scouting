import { ZXingStringEncoding } from '@zxing/library';
import { operationSchema, type Operation } from '@frc/shared';
import { QR_BATCH_MAX_OPERATIONS, QR_HEADER_BYTES, textToFrame } from '@frc/shared/qr';

/**
 * The QR receiver's frame handling (SPEC-FINAL 9.8; task 1.48). Only the lazy receive page
 * imports this module, so `@zxing/library` and the codec never reach the initial chunk.
 */

/**
 * zxing turns a byte-mode code's bytes into text with `TextDecoder` and a guessed character set.
 * Our frames are alphanumeric text and never reach this, but any other code held up to the
 * camera may (a URL on a badge): a decoder that throws — a character set this browser's
 * TextDecoder does not know, or zxing's `decodeURIComponent` fallback on a page it does not take
 * for a browser — is not an error zxing's scan loop retries after, and the loop would stop for
 * good. This decoder never throws: what TextDecoder cannot read is read as ISO-8859-1, one
 * character per byte, and then ignored as not Base45.
 */
function decodeText(bytes: Uint8Array, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    let text = '';
    for (let at = 0; at < bytes.length; at += 4096) {
      text += String.fromCharCode(...bytes.subarray(at, at + 4096));
    }
    return text;
  }
}
ZXingStringEncoding.customDecoder = decodeText;

/**
 * A decoded code's frame: the sender draws each frame as Base45 text in one alphanumeric
 * segment (`frameToText`), and every reader — zxing's `getText()`, BarcodeDetector's `rawValue`
 * — hands that text back as it was. Null when the text is not Base45 (a foreign code); the scan
 * goes on. A text too short to be a frame is turned away by `frameHeader`.
 */
export function frameFromText(text: string): Uint8Array | null {
  try {
    return textToFrame(text);
  } catch {
    return null;
  }
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
 * else is dropped whole like a damaged one, and nothing is written. So is a batch of more
 * operations than a sender ever puts in one (`QR_BATCH_MAX_OPERATIONS`): not one of ours.
 */
export function batchOperations(raw: unknown): Operation[] {
  return operationSchema.array().max(QR_BATCH_MAX_OPERATIONS).parse(raw);
}

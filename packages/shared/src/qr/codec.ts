import { deflateSync, Inflate } from 'fflate';
import type { Operation } from '../sync/operation';

/**
 * Compressed payload bytes per frame. Small on purpose: a frame of 12 + 500 bytes is 768 Base45
 * characters, a version-18 code (89 modules) that a phone's camera reads off a screen, where a
 * 2,300-byte version-40 code (177 modules) was under 2 px a module and never read (DEVIATIONS,
 * "Phase 1 G fix").
 */
export const QR_FRAME_BYTES = 500;
export const QR_HEADER_BYTES = 12;
/**
 * The one QR version every frame is drawn at (level M, alphanumeric mode): the smallest whose
 * capacity holds a full frame's text, `frameToText` of 12 + 500 bytes = 768 characters. One
 * version for the whole batch, so the code never changes size between frames. The client's
 * `qrFrame.test.ts` proves a full frame fits it and does not fit the version below.
 */
export const QR_VERSION = 18;
/** Modules a side of a `QR_VERSION` code (17 + 4 × version). */
export const QR_MODULES = 17 + 4 * QR_VERSION;
export const QR_BATCH_MAX_OPERATIONS = 200;
export const QR_FRAMES_PER_SECOND = 5;
/**
 * The most a batch may inflate to. A full batch of 200 real operations is a few hundred KB of
 * JSON; anything past this is not one of ours (a deflate bomb held up to the camera), and is
 * refused before it can exhaust the receiving tablet's memory.
 */
export const QR_MAX_INFLATED_BYTES = 4 * 1024 * 1024;
/** Compressed bytes fed to the inflater at a time: one step can inflate to about 1 MB at most. */
const INFLATE_STEP_BYTES = 1024;

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

/** 12-byte header: batch id (4) · frame index (2) · frame count (2) · CRC32 of the whole payload (4). */
function writeHeader(
  view: DataView,
  batchId: number,
  index: number,
  count: number,
  crc: number,
): void {
  view.setUint32(0, batchId, false);
  view.setUint16(4, index, false);
  view.setUint16(6, count, false);
  view.setUint32(8, crc, false);
}

/**
 * Inflates `compressed` a step at a time, stopping as soon as the output passes `max` bytes, so
 * a crafted payload can never be inflated whole first. Throws on a size past `max` and on a
 * stream that is not complete DEFLATE, as `inflateSync` does.
 */
function inflateBounded(compressed: Uint8Array, max: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const inflater = new Inflate((chunk) => {
    size += chunk.byteLength;
    if (size > max) throw new Error('the batch is larger than a QR batch can be');
    chunks.push(chunk);
  });
  const steps = Math.max(1, Math.ceil(compressed.byteLength / INFLATE_STEP_BYTES));
  for (let step = 0; step < steps; step += 1) {
    const chunk = compressed.subarray(step * INFLATE_STEP_BYTES, (step + 1) * INFLATE_STEP_BYTES);
    inflater.push(chunk, step === steps - 1);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Base45 (RFC 9285): every character is one QR alphanumeric-mode character, so a frame drawn as
 * text is read back as the same text by any QR reader — zxing, and the BarcodeDetector API, whose
 * `rawValue` is a string and cannot carry binary byte-mode data intact.
 */
const BASE45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const BASE45_VALUE = new Map([...BASE45].map((char, value) => [char, value]));

/** A frame as Base45 text: 3 characters per 2 bytes, 2 for a last odd byte. */
export function frameToText(frame: Uint8Array): string {
  let text = '';
  for (let at = 0; at + 1 < frame.length; at += 2) {
    const n = frame[at]! * 256 + frame[at + 1]!;
    text += BASE45[n % 45]! + BASE45[Math.floor(n / 45) % 45]! + BASE45[Math.floor(n / 2025)]!;
  }
  if (frame.length % 2 === 1) {
    const n = frame[frame.length - 1]!;
    text += BASE45[n % 45]! + BASE45[Math.floor(n / 45)]!;
  }
  return text;
}

/**
 * The frame a Base45 text holds. Throws on anything that is not Base45 — a character outside the
 * alphabet, a length that leaves one character over, or a group past what 2 bytes (or 1) can
 * hold — so a foreign code is refused rather than read as a frame.
 */
export function textToFrame(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new Error('not a frame: a Base45 text cannot be this long');
  const frame = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  const digit = (at: number) => {
    const value = BASE45_VALUE.get(text[at]!);
    if (value === undefined) throw new Error('not a frame: a character outside Base45');
    return value;
  };
  let out = 0;
  for (let at = 0; at < text.length; at += 3) {
    if (at + 2 < text.length) {
      const n = digit(at) + digit(at + 1) * 45 + digit(at + 2) * 2025;
      if (n > 0xffff) throw new Error('not a frame: a Base45 group out of range');
      frame[out++] = n >> 8;
      frame[out++] = n & 0xff;
    } else {
      const n = digit(at) + digit(at + 1) * 45;
      if (n > 0xff) throw new Error('not a frame: a Base45 group out of range');
      frame[out++] = n;
    }
  }
  return frame;
}

export function encodeBatch(
  operations: Operation[],
  batchId = Math.floor(Math.random() * 0xffffffff),
): Uint8Array[] {
  if (operations.length > QR_BATCH_MAX_OPERATIONS) {
    throw new Error(`a QR batch holds at most ${QR_BATCH_MAX_OPERATIONS} operations`);
  }
  const json = new TextEncoder().encode(JSON.stringify(operations));
  const compressed = deflateSync(json, { level: 9 });
  const crc = crc32(compressed);
  const count = Math.max(1, Math.ceil(compressed.byteLength / QR_FRAME_BYTES));

  return Array.from({ length: count }, (_, index) => {
    const slice = compressed.subarray(index * QR_FRAME_BYTES, (index + 1) * QR_FRAME_BYTES);
    const frame = new Uint8Array(QR_HEADER_BYTES + slice.byteLength);
    writeHeader(new DataView(frame.buffer), batchId, index, count, crc);
    frame.set(slice, QR_HEADER_BYTES);
    return frame;
  });
}

export type Collector = {
  add(frame: Uint8Array): void;
  progress(): { collected: number; total: number | null };
  isComplete(): boolean;
  result(): Operation[];
};

export function newCollector(): Collector {
  let batchId: number | null = null;
  let total: number | null = null;
  let crc: number | null = null;
  const frames = new Map<number, Uint8Array>();

  return {
    add(frame: Uint8Array): void {
      if (frame.byteLength < QR_HEADER_BYTES) {
        throw new Error('frame is too short to be a batch frame');
      }
      const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const id = view.getUint32(0, false);
      if (batchId === null) {
        batchId = id;
        total = view.getUint16(6, false);
        crc = view.getUint32(8, false);
      } else if (id !== batchId) {
        throw new Error('that code belongs to a different batch — finish this one or start again');
      }
      frames.set(view.getUint16(4, false), frame.slice(QR_HEADER_BYTES));
    },
    progress: () => ({ collected: frames.size, total }),
    isComplete: () => total !== null && frames.size === total,
    result(): Operation[] {
      if (total === null || frames.size !== total) throw new Error('the batch is not complete yet');
      const parts = Array.from({ length: total }, (_, i) => frames.get(i));
      if (parts.some((p) => p === undefined)) throw new Error('the batch is not complete yet');
      const compressed = new Uint8Array(parts.reduce((n, p) => n + p!.byteLength, 0));
      let offset = 0;
      for (const part of parts) {
        compressed.set(part!, offset);
        offset += part!.byteLength;
      }
      if (crc32(compressed) !== crc) {
        throw new Error('checksum failed — scan the batch again');
      }
      const json = inflateBounded(compressed, QR_MAX_INFLATED_BYTES);
      return JSON.parse(new TextDecoder().decode(json)) as Operation[];
    },
  };
}

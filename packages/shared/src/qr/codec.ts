import { deflateSync, Inflate } from 'fflate';
import type { Operation } from '../sync/operation';

export const QR_FRAME_BYTES = 2300;
export const QR_HEADER_BYTES = 12;
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

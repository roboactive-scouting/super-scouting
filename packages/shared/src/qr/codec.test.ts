import { describe, expect, it } from 'vitest';
import type { Operation } from '../sync/operation';
import {
  encodeBatch,
  frameToText,
  newCollector,
  QR_BATCH_MAX_OPERATIONS,
  QR_FRAME_BYTES,
  QR_FRAMES_PER_SECOND,
  QR_HEADER_BYTES,
  QR_MAX_INFLATED_BYTES,
  QR_MODULES,
  QR_VERSION,
  textToFrame,
} from './codec';

const op = (i: number): Operation => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry',
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1',
    form_kind: 'match',
    team_id: `t-${i % 30}`,
    match_id: `m-${i % 20}`,
    alliance: i % 2 ? 'red' : 'blue',
    robot_status: 'played',
    data: { auto_notes: i % 5, teleop_notes: (i * 7) % 19, notes: 'הרובוט היה איטי' },
  },
  author_user_id: '00000000-0000-4000-8000-000000000006',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: i,
});

describe('QR codec (SPEC-FINAL 9.8)', () => {
  it('uses the documented parameters', () => {
    expect(QR_FRAME_BYTES).toBe(500);
    expect(QR_HEADER_BYTES).toBe(12);
    expect(QR_BATCH_MAX_OPERATIONS).toBe(200);
    expect(QR_FRAMES_PER_SECOND).toBe(5);
    expect(QR_VERSION).toBe(18);
    expect(QR_MODULES).toBe(89);
  });

  it('round-trips a batch through frames', () => {
    const operations = Array.from({ length: 40 }, (_, i) => op(i));
    const frames = encodeBatch(operations);
    const collector = newCollector();
    for (const frame of frames) collector.add(frame);
    expect(collector.isComplete()).toBe(true);
    expect(collector.result()).toEqual(operations);
  });

  it('completes regardless of frame order, which is what makes a cyclic display work', () => {
    const operations = Array.from({ length: 60 }, (_, i) => op(i));
    const frames = encodeBatch(operations);
    const collector = newCollector();
    for (const frame of [...frames].reverse()) collector.add(frame);
    expect(collector.isComplete()).toBe(true);
    expect(collector.result()).toHaveLength(60);
  });

  it('ignores a repeated frame, so looping the display forever is harmless', () => {
    const frames = encodeBatch([op(1), op(2)]);
    const collector = newCollector();
    collector.add(frames[0]!);
    collector.add(frames[0]!);
    expect(collector.progress()).toEqual({ collected: 1, total: frames.length });
  });

  it('keeps every frame inside the QR byte budget', () => {
    for (const frame of encodeBatch(Array.from({ length: 200 }, (_, i) => op(i)))) {
      expect(frame.byteLength).toBeLessThanOrEqual(QR_FRAME_BYTES + QR_HEADER_BYTES);
    }
  });

  it('produces a few dozen frames for a realistic backlog of a hundred entries', () => {
    // A real entry is dozens of fields that differ from entry to entry; the shared `op` fixture is
    // so repetitive it deflates to a single frame, so this test varies its fields pseudo-randomly.
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const realistic = (i: number): Operation => {
      const base = op(i);
      const data: Record<string, number | string> = { notes: `note ${next().toString(36)}` };
      for (let f = 0; f < 40; f += 1) data[`field_${f}`] = next() % 1000;
      return { ...base, payload: { ...base.payload, data } };
    };
    const frames = encodeBatch(Array.from({ length: 100 }, (_, i) => realistic(i)));
    // 500-byte frames: 30 here, about 4.6 times as many as the 2,300-byte frames before them;
    // a full loop at five a second is six seconds.
    expect(frames.length).toBeGreaterThanOrEqual(20);
    expect(frames.length).toBeLessThanOrEqual(45);
  });

  it('refuses a batch above the 200-operation cap', () => {
    expect(() => encodeBatch(Array.from({ length: 201 }, (_, i) => op(i)))).toThrow(/200/);
  });

  it('rejects a frame from another batch', () => {
    const a = encodeBatch([op(1)]);
    const b = encodeBatch([op(2)]);
    const collector = newCollector();
    collector.add(a[0]!);
    expect(() => collector.add(b[0]!)).toThrow(/different batch/i);
  });

  it('refuses a payload whose CRC does not match, rather than handing back nonsense', () => {
    const frames = encodeBatch([op(1)]);
    const corrupted = new Uint8Array(frames[0]!);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff;
    const collector = newCollector();
    collector.add(corrupted);
    expect(() => collector.result()).toThrow(/checksum/i);
  });

  it('refuses a payload that inflates past the cap, and takes one just under it', () => {
    const sized = (bytes: number) => [{ ...op(1), payload: { notes: 'a'.repeat(bytes) } }];
    const bomb = newCollector();
    for (const frame of encodeBatch(sized(QR_MAX_INFLATED_BYTES))) bomb.add(frame);
    expect(() => bomb.result()).toThrow(/larger than a QR batch/);
    const big = newCollector();
    for (const frame of encodeBatch(sized(QR_MAX_INFLATED_BYTES - 1024))) big.add(frame);
    expect(big.result()).toHaveLength(1);
  });

  it('survives Hebrew text, because the payload is bytes and not base64', () => {
    const operations = [op(1)];
    const collector = newCollector();
    for (const frame of encodeBatch(operations)) collector.add(frame);
    expect((collector.result()[0]!.payload.data as { notes: string }).notes).toBe(
      'הרובוט היה איטי',
    );
  });
});

describe('Base45 frame text (RFC 9285; QR alphanumeric mode)', () => {
  const ascii = (text: string) => new TextEncoder().encode(text);

  it('encodes the RFC 9285 examples', () => {
    expect(frameToText(ascii('AB'))).toBe('BB8');
    expect(frameToText(ascii('Hello!!'))).toBe('%69 VD92EX0');
    expect(frameToText(ascii('base-45'))).toBe('UJCLQE7W581');
    expect(textToFrame('BB8')).toEqual(ascii('AB'));
    expect(textToFrame('%69 VD92EX0')).toEqual(ascii('Hello!!'));
    expect(textToFrame('UJCLQE7W581')).toEqual(ascii('base-45'));
    // RFC 9285 4.2's decoding example.
    expect(new TextDecoder().decode(textToFrame('QED8WEX0'))).toBe('ietf!');
  });

  it('round-trips random bytes of every length from 0 to 600, odd lengths too', () => {
    let seed = 987654321;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let length = 0; length <= 600; length += 1) {
      const bytes = Uint8Array.from({ length }, () => next() % 256);
      const text = frameToText(bytes);
      expect(text).toMatch(/^[0-9A-Z $%*+\-./:]*$/);
      expect(text).toHaveLength(Math.floor(length / 2) * 3 + (length % 2) * 2);
      expect(textToFrame(text)).toEqual(bytes);
    }
    // The extremes of a group.
    const edges = Uint8Array.of(0, 0, 0xff, 0xff, 0xff);
    expect(textToFrame(frameToText(edges))).toEqual(edges);
  });

  it('a full frame is 768 characters', () => {
    const frame = new Uint8Array(QR_HEADER_BYTES + QR_FRAME_BYTES).fill(0xff);
    expect(frameToText(frame)).toHaveLength(768);
  });

  it('refuses text that is not Base45, so a foreign code is never read as a frame', () => {
    // A character outside the alphabet: lower case, '#', a non-ASCII letter.
    expect(() => textToFrame('bB8')).toThrow(/outside Base45/);
    expect(() => textToFrame('BB#')).toThrow(/outside Base45/);
    expect(() => textToFrame('BBé')).toThrow(/outside Base45/);
    expect(() => textToFrame('https://example.com')).toThrow();
    // A length that leaves one character over.
    expect(() => textToFrame('B')).toThrow(/this long/);
    expect(() => textToFrame('BB8B')).toThrow(/this long/);
    // Groups past 2 bytes (':::' = 91,124) or past 1 byte ('::' = 2,024).
    expect(() => textToFrame(':::')).toThrow(/out of range/);
    expect(() => textToFrame('::')).toThrow(/out of range/);
    // The largest valid groups.
    expect(textToFrame('FGW')).toEqual(Uint8Array.of(0xff, 0xff));
    expect(textToFrame('U5')).toEqual(Uint8Array.of(0xff));
  });

  it('carries a real batch: every frame through its text and back completes it', () => {
    const operations = Array.from({ length: 30 }, (_, i) => op(i));
    const collector = newCollector();
    for (const frame of encodeBatch(operations)) collector.add(textToFrame(frameToText(frame)));
    expect(collector.result()).toEqual(operations);
  });
});

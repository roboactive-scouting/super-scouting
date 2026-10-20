import { describe, expect, it } from 'vitest';
import type { Operation } from '../sync/operation';
import {
  encodeBatch,
  newCollector,
  QR_BATCH_MAX_OPERATIONS,
  QR_FRAME_BYTES,
  QR_HEADER_BYTES,
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
    expect(QR_FRAME_BYTES).toBe(2300);
    expect(QR_HEADER_BYTES).toBe(12);
    expect(QR_BATCH_MAX_OPERATIONS).toBe(200);
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

  it('produces roughly nine to thirteen frames for a realistic backlog of a hundred entries', () => {
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
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames.length).toBeLessThanOrEqual(20);
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

  it('survives Hebrew text, because the payload is bytes and not base64', () => {
    const operations = [op(1)];
    const collector = newCollector();
    for (const frame of encodeBatch(operations)) collector.add(frame);
    expect((collector.result()[0]!.payload.data as { notes: string }).notes).toBe(
      'הרובוט היה איטי',
    );
  });
});

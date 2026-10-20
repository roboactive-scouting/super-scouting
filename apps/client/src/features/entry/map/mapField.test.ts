import { describe, expect, it } from 'vitest';
import type { FormFieldDefinition } from '@frc/shared';
import { mapCount, opensMap, tapsOf } from './mapField';

const f = (type: string, config: Record<string, unknown> = {}): FormFieldDefinition =>
  ({ key: 'k', label: 'L', type, config }) as unknown as FormFieldDefinition;

const P = (x: number, y: number) => ({ x, y });

describe('mapCount: a map field in the map button words (UF.24)', () => {
  it('a position: "1 spot", "3 spots", one point or a list', () => {
    expect(mapCount(f('position'), P(0.1, 0.2))).toBe('1 spot');
    expect(mapCount(f('position', { multi_point: true }), [P(0, 0), P(1, 1), P(0.5, 0.5)])).toBe(
      '3 spots',
    );
  });

  it('a cycle path: its paths and all their points', () => {
    const two = [
      [P(0, 0), P(0.1, 0.1), P(0.2, 0.2), P(0.3, 0.3), P(0.4, 0.4)],
      [P(0.5, 0.5), P(0.6, 0.6), P(0.7, 0.7), P(0.8, 0.8)],
    ];
    expect(mapCount(f('cycle_path'), two)).toBe('2 paths · 9 spots');
    expect(mapCount(f('cycle_path'), [[P(0, 0)]])).toBe('1 path · 1 spot');
  });

  it('an event log that asks where: its events and how many have a place', () => {
    const taps = [
      { type: 'high', t: 12, x: 0.2, y: 0.3 },
      { type: 'high', t: 31, x: 0.2, y: 0.6 },
      { type: 'miss', t: 40, x: 0.4, y: 0.7 },
      { type: 'def', t: 65 },
      { type: 'low', t: 82, x: 0.3, y: 0.5 },
    ];
    expect(mapCount(f('event_log', { ask_position: true }), taps)).toBe('5 events · 4 on the map');
    expect(mapCount(f('event_log', { ask_position: true }), [{ type: 'a', t: 1 }])).toBe(
      '1 event · 0 on the map',
    );
    // A log that never asks where has no map: only its events.
    expect(mapCount(f('event_log'), taps)).toBe('5 events');
  });

  it('is null when nothing is held, and for any other type', () => {
    expect(mapCount(f('position'), undefined)).toBeNull();
    expect(mapCount(f('position', { multi_point: true }), [])).toBeNull();
    expect(mapCount(f('cycle_path'), [])).toBeNull();
    expect(mapCount(f('cycle_path'), [[]])).toBeNull();
    expect(mapCount(f('event_log', { ask_position: true }), [])).toBeNull();
    expect(mapCount(f('counter'), 3)).toBeNull();
  });
});

describe('opensMap', () => {
  it('position, cycle path and an event log that asks where; nothing else', () => {
    expect(opensMap(f('position'))).toBe(true);
    expect(opensMap(f('cycle_path'))).toBe(true);
    expect(opensMap(f('event_log', { ask_position: true }))).toBe(true);
    expect(opensMap(f('event_log'))).toBe(false);
    expect(opensMap(f('counter'))).toBe(false);
  });
});

describe('tapsOf', () => {
  it('keeps only taps with a type and a time', () => {
    expect(tapsOf([{ type: 'a', t: 1 }, { type: 'b' }, null, 'x', { t: 2 }])).toEqual([
      { type: 'a', t: 1 },
    ]);
    expect(tapsOf('nope')).toEqual([]);
  });
});

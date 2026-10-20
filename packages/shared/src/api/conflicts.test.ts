import { describe, expect, it } from 'vitest';
import { conflictResolution, listConflictsInput, resolveConflictInput } from './conflicts';

const EVENT = '00000000-0000-4000-8000-0000000000e1';

describe('the conflict queue wire schemas (task 1.41)', () => {
  it('takes exactly the two resolution shapes', () => {
    expect(conflictResolution.parse({ keep: 'live' })).toEqual({ keep: 'live' });
    expect(conflictResolution.parse({ keep: 'superseded' })).toEqual({ keep: 'superseded' });
    expect(conflictResolution.parse({ keep_row_id: 'e-1' })).toEqual({ keep_row_id: 'e-1' });
    for (const bad of [
      { keep: 'both' },
      { keep: 'live', keep_row_id: 'e-1' },
      {},
      { keep_row_id: '' },
    ]) {
      expect(conflictResolution.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('resolveConflictInput is strict', () => {
    expect(
      resolveConflictInput.safeParse({ conflict_id: 'c', resolution: { keep: 'live' }, undo: true })
        .success,
    ).toBe(false);
  });

  it('listConflictsInput takes an event uuid and a settled_since instant with an offset', () => {
    expect(
      listConflictsInput.parse({ event_id: EVENT, settled_since: '2026-11-14T00:00:00+02:00' }),
    ).toEqual({ event_id: EVENT, settled_since: '2026-11-14T00:00:00+02:00' });
    expect(listConflictsInput.safeParse({ event_id: 'ev-1' }).success).toBe(false);
    expect(
      listConflictsInput.safeParse({ event_id: EVENT, settled_since: '2026-11-14' }).success,
    ).toBe(false);
    expect(listConflictsInput.safeParse({ event_id: EVENT, limit: 0 }).success).toBe(false);
  });
});

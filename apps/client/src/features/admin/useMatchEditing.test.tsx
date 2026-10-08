import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchRow } from '@frc/shared';
import { RpcError } from '@/data/rpc';
import { qual } from './matchFixtures';
import { useMatchEditing } from './useMatchEditing';
import { useMatchSaves } from './useMatchSaves';

type Call = (name: string, input?: unknown) => Promise<unknown>;

/**
 * The hook on a page that holds `initial` for ev-1. `shown` is the event the page shows
 * now (a rerender with another one is an event switch while a save is out).
 */
function renderEditing(call: Call, initial: MatchRow[]) {
  const reported = vi.fn<(rows: MatchRow[]) => void>();
  const hook = renderHook(
    ({ shown }: { shown: string }) => {
      const [matches, setMatches] = useState(initial);
      const saves = useMatchSaves(shown, matches);
      return useMatchEditing({
        rpc: { call },
        eventId: 'ev-1',
        roster: [],
        matches,
        onMatchesChange: (rows) => {
          reported(rows);
          setMatches(rows);
        },
        onRosterChange: () => {},
        saves,
      });
    },
    { initialProps: { shown: 'ev-1' } },
  );
  return { ...hook, reported };
}

/** setMatchTeams waits for the test; everything else answers at once. */
function heldCall() {
  const answers: Array<{ done: (out: unknown) => void; fail: (e: unknown) => void }> = [];
  const call = vi.fn<Call>(async (name) => {
    if (name === 'setMatchTeams') {
      return new Promise((done, fail) => answers.push({ done, fail }));
    }
    if (name === 'listMatches') return { items: [], next_cursor: null };
    return undefined;
  });
  return { call, answers };
}

const Q7 = qual(7, [1574]);
const Q8 = qual(8, [1690]);
const RED1 = [{ alliance: 'red' as const, station: 1 as const, team_id: 't-6230' }];

describe('useMatchEditing', () => {
  it('a save answered for a match deleted meanwhile changes nothing', async () => {
    const { call, answers } = heldCall();
    const { result, reported } = renderEditing(call, [Q7, Q8]);
    let save: Promise<void> = Promise.resolve();
    act(() => {
      save = result.current.saveSlots(Q7.id, RED1);
    });
    await act(async () => result.current.remove(Q7));
    expect(reported).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenLastCalledWith([Q8]);

    await act(async () => {
      answers[0]!.done({ ...Q7, slots: RED1 });
      await save;
    });
    expect(reported).toHaveBeenCalledTimes(2);
  });

  it('an answer for an event the page no longer shows is not counted or shown', async () => {
    const { call, answers } = heldCall();
    const { result, rerender } = renderEditing(call, [Q7, Q8]);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.saveSlots(Q7.id, RED1);
      second = result.current.saveSlots(Q8.id, RED1);
    });
    await act(async () => {});
    expect(answers).toHaveLength(2);
    rerender({ shown: 'ev-2' });

    await act(async () => {
      answers[0]!.done({ ...Q7, slots: RED1 });
      answers[1]!.fail(new RpcError('validation', 'that team is not on the roster', 400, true));
      await Promise.all([first, second]);
    });
    expect(result.current.savedCount).toBe(0);
    expect(result.current.error).toBeNull();
  });
});

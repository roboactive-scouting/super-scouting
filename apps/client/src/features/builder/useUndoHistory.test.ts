import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PAUSE_MS, useUndoHistory } from './useUndoHistory';

/** A text value with its history, the clock in the test's hands. */
function useText() {
  const [text, setText] = useState('');
  const clock = { now: 0 };
  const history = useUndoHistory<string>({
    capture: () => text,
    restore: setText,
    same: (a, b) => a === b,
    watch: [text],
    now: () => clock.now,
  });
  return { text, setText, history, clock };
}

describe('useUndoHistory (UF.14)', () => {
  it('one step per pause in a group; an edit outside a group is a step of its own', () => {
    let now = 0;
    const { result } = renderHook(() => {
      const [text, setText] = useState('');
      const history = useUndoHistory<string>({
        capture: () => text,
        restore: setText,
        same: (a, b) => a === b,
        watch: [text],
        now: () => now,
      });
      return { text, setText, history };
    });
    const type = (next: string, group?: string) =>
      act(() => {
        result.current.history.record(group);
        result.current.setText(next);
      });
    type('a', 'box');
    now += 100;
    type('ab', 'box');
    now += PAUSE_MS + 1;
    type('abc', 'box');
    type('abc!');
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('abc');
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('ab');
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('');
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.redo());
    expect(result.current.text).toBe('ab');
  });

  it('a step that changed nothing is never one to undo, and a new edit drops the redo', () => {
    const { result } = renderHook(useText);
    act(() => result.current.history.record());
    expect(result.current.history.canUndo).toBe(false);
    act(() => {
      result.current.history.record();
      result.current.setText('x');
    });
    expect(result.current.history.canUndo).toBe(true);
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('');
    expect(result.current.history.canRedo).toBe(true);
    act(() => {
      result.current.history.record();
      result.current.setText('y');
    });
    expect(result.current.history.canRedo).toBe(false);
  });

  it('clear starts a new history', () => {
    const { result } = renderHook(useText);
    act(() => {
      result.current.history.record();
      result.current.setText('x');
    });
    act(() => result.current.history.clear());
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('x');
  });

  it('groupOf names the step an undo or a redo would take; an edit that changed nothing hands its place to the next', () => {
    const { result } = renderHook(useText);
    const edit = (next: string, group?: string) =>
      act(() => {
        result.current.history.record(group);
        result.current.setText(next);
      });
    edit('a', 'label');
    expect(result.current.history.groupOf('undo')).toBe('label');
    // Typing in a draft box that commits nothing: the step an undo takes is still the label's.
    edit('a', 'range');
    expect(result.current.history.groupOf('undo')).toBe('label');
    // The next edit takes the empty step's place, under its own group.
    edit('ab', 'points');
    expect(result.current.history.groupOf('undo')).toBe('points');
    act(() => result.current.history.undo());
    expect(result.current.text).toBe('a');
    expect(result.current.history.groupOf('redo')).toBe('points');
    expect(result.current.history.groupOf('undo')).toBe('label');
    act(() => result.current.history.redo());
    expect(result.current.history.groupOf('undo')).toBe('points');
  });

  it('canUndo is worked out again only when the history or what it watches moves (M1)', () => {
    let captures = 0;
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useUndoHistory<string>({
          capture: () => {
            captures += 1;
            return text;
          },
          restore: () => undefined,
          same: (a, b) => a === b,
          watch: [text],
        }),
      { initialProps: { text: '' } },
    );
    act(() => result.current.record());
    rerender({ text: 'x' });
    expect(result.current.canUndo).toBe(true);
    const settled = captures;
    rerender({ text: 'x' });
    rerender({ text: 'x' });
    expect(captures).toBe(settled);
    rerender({ text: '' });
    expect(captures).toBe(settled + 1);
    expect(result.current.canUndo).toBe(false);
  });
});

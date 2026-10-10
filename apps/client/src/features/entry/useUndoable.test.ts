import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoable } from './useUndoable';

describe('useUndoable (SPEC-FINAL 8.2)', () => {
  it('undoes the last change and nothing more', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUndoable(0, onChange));
    act(() => result.current.set(1));
    act(() => result.current.set(2));
    act(() => result.current.undo());
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('reports whether there is anything to undo', () => {
    const { result } = renderHook(() => useUndoable(0, vi.fn()));
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.set(1));
    expect(result.current.canUndo).toBe(true);
  });

  it('clears back to the initial value', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUndoable(0, onChange));
    act(() => result.current.set(5));
    act(() => result.current.clear());
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('names the change on top of the stack, and the one under it after an undo', () => {
    const { result } = renderHook(() => useUndoable<string[], string>([], vi.fn()));
    act(() => result.current.set(['a'], 'Near'));
    act(() => result.current.set(['a', 'c'], 'Far'));
    expect(result.current.note).toBe('Far');
    expect(result.current.value).toEqual(['a', 'c']);
    act(() => result.current.undo());
    expect(result.current.note).toBe('Near');
    expect(result.current.value).toEqual(['a']);
  });

  it('starts a new history when the value changes from outside (a restored draft, Clear test values)', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useUndoable(value, onChange), {
      initialProps: { value: 0 },
    });
    act(() => result.current.set(3));
    // The parent hands back what was set: still the same history.
    rerender({ value: 3 });
    expect(result.current.canUndo).toBe(true);
    // Something else changed it: the old steps no longer apply.
    rerender({ value: 9 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.value).toBe(9);
    act(() => result.current.undo());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

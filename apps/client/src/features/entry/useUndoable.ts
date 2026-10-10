import { useCallback, useEffect, useRef, useState } from 'react';

type Step<T, N> = { value: T; note: N | undefined };

/** Whether two values are the same, a list by its items (a page may copy the array it is handed). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  }
  return false;
}

/** A literal handed in (`useUndoable(0, …)`) stands for its kind: any number may follow it. */
type Widen<V> = V extends number
  ? number
  : V extends string
    ? string
    : V extends boolean
      ? boolean
      : V;

export type Undoable<T, N> = {
  /** The value as this history knows it: the last one set or undone, or the one handed in. */
  value: T;
  /** Change the value, remembering the one before it; `note` names the change ("Far"). */
  set: (next: T, note?: N) => void;
  /** Take back the last change, and only that one. */
  undo: () => void;
  /** Back to the value the input started with, with nothing left to undo. */
  clear: () => void;
  canUndo: boolean;
  /** The note of the change `undo` would take back. */
  note: N | undefined;
};

/**
 * The undo stack behind every repeatable input (SPEC-FINAL 8.2): a multi-select's last toggle,
 * the match timer's reset, and so on. `set` reports the new value through `onChange` and keeps
 * the old one; `undo` reports the one before the last change. A value that changes from outside
 * (a restored draft, Clear test values) starts a new history, so an undo never brings back a
 * step from before it.
 */
export function useUndoable<V, N = string>(
  value: V,
  onChange: (value: Widen<V>) => void,
): Undoable<Widen<V>, N> {
  type T = Widen<V>;
  const initial = useRef(value as T);
  const current = useRef(value as T);
  const stack = useRef<Step<T, N>[]>([]);
  // The refs hold the truth between renders (two taps before a render); this re-renders.
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  // Only a change of the value handed in counts: a parent that has not yet handed back what was
  // set (or hands a fresh copy of the same list) is not a change from outside.
  const handed = useRef(value);
  useEffect(() => {
    if (same(value, handed.current)) return;
    handed.current = value;
    if (same(value, current.current)) return;
    current.current = value as T;
    stack.current = [];
    bump();
  }, [value]);

  const set = useCallback(
    (next: T, note?: N) => {
      stack.current = [...stack.current, { value: current.current, note }];
      current.current = next;
      bump();
      onChange(next);
    },
    [onChange],
  );

  const undo = useCallback(() => {
    const top = stack.current[stack.current.length - 1];
    if (!top) return;
    stack.current = stack.current.slice(0, -1);
    current.current = top.value;
    bump();
    onChange(top.value);
  }, [onChange]);

  const clear = useCallback(() => {
    stack.current = [];
    current.current = initial.current;
    bump();
    onChange(initial.current);
  }, [onChange]);

  const top = stack.current[stack.current.length - 1];
  return {
    value: current.current,
    set,
    undo,
    clear,
    canUndo: top !== undefined,
    note: top?.note,
  };
}

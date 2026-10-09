import { useCallback, useMemo, useReducer, useRef } from 'react';

/**
 * Typing that pauses for this long starts a new undo step: a burst of keystrokes in one box is
 * one step, not one per key (UF.14).
 */
export const PAUSE_MS = 800;

/** The most steps kept: an afternoon of edits, without holding every keystroke's copy. */
const LIMIT = 200;

/**
 * Which text box an edit is being typed in, as an undo group: the same box within a pause is
 * one step. A click on a switch, a select or a segment is a step of its own (no group).
 */
const boxes = new WeakMap<Element, number>();
let lastBox = 0;
const TYPED = new Set(['text', 'search', 'number', 'url', 'email', 'tel', '']);

export function typingGroup(): string | undefined {
  const el = typeof document === 'undefined' ? null : document.activeElement;
  const typed =
    el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TYPED.has(el.type));
  if (!el || !typed) return undefined;
  let n = boxes.get(el);
  if (n === undefined) {
    n = ++lastBox;
    boxes.set(el, n);
  }
  return `box-${n}`;
}

/** A recorded state, with the group of the edit that followed it (the edit an undo takes back). */
type Entry<S> = { snap: S; group: string | undefined };

/**
 * Undo and redo over snapshots of an edit model (UF.14). The page calls `record(group?)` just
 * before each edit, with the state as it is then; `undo` brings back the last recorded state
 * (keeping the present for `redo`), and any new edit drops what could be redone. An edit in the
 * same `group` within `PAUSE_MS` of the last joins its step. A step that changed nothing (a
 * click on what was already chosen) is never one to undo. `clear` starts a new history: the
 * builder calls it on every save, and a load is a new editor with a new history.
 *
 * `watch` is what `capture` reads that moves with an edit: `canUndo` is worked out again only
 * when the history or one of these changes, not on every render (a drag renders on every
 * pointer move). `groupOf` names the group of the step an undo or a redo would take.
 */
export function useUndoHistory<S>({
  capture,
  restore,
  same,
  watch,
  now = () => Date.now(),
}: {
  /** The state as it is now. */
  capture: () => S;
  /** Puts a state back. */
  restore: (snap: S) => void;
  /** Two states the user could not tell apart. */
  same: (a: S, b: S) => boolean;
  /** Every value `same` tells apart in what `capture` reads; the same length on every render. */
  watch: readonly unknown[];
  now?: () => number;
}) {
  const past = useRef<Entry<S>[]>([]);
  const future = useRef<Entry<S>[]>([]);
  const burst = useRef<{ group: string; at: number } | null>(null);
  const [moves, changed] = useReducer((n: number) => n + 1, 0);

  const record = useCallback(
    (group?: string) => {
      const at = now();
      const last = burst.current;
      if (group !== undefined && last?.group === group && at - last.at < PAUSE_MS) {
        last.at = at;
        return;
      }
      burst.current = group === undefined ? null : { group, at };
      const current = capture();
      const top = past.current[past.current.length - 1];
      if (top !== undefined && same(top.snap, current)) {
        // The step on top changed nothing: this edit takes its place rather than stack on it.
        past.current = [...past.current.slice(0, -1), { snap: top.snap, group }];
      } else {
        past.current = [...past.current, { snap: current, group }].slice(-LIMIT);
      }
      future.current = [];
      changed();
    },
    [capture, same, now],
  );

  /** The past with any step on top that changed nothing taken off (at most one). */
  const effectivePast = useCallback(
    (current: S) => {
      const stack = [...past.current];
      while (stack.length > 0 && same(stack[stack.length - 1]!.snap, current)) stack.pop();
      return stack;
    },
    [same],
  );

  const undo = useCallback(() => {
    burst.current = null;
    const current = capture();
    const stack = effectivePast(current);
    const target = stack.pop();
    past.current = stack;
    if (target !== undefined) {
      future.current = [...future.current, { snap: current, group: target.group }];
      restore(target.snap);
    }
    changed();
  }, [capture, restore, effectivePast]);

  const redo = useCallback(() => {
    burst.current = null;
    const target = future.current[future.current.length - 1];
    if (target === undefined) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, { snap: capture(), group: target.group }];
    restore(target.snap);
    changed();
  }, [capture, restore]);

  const clear = useCallback(() => {
    burst.current = null;
    if (past.current.length === 0 && future.current.length === 0) return;
    past.current = [];
    future.current = [];
    changed();
  }, []);

  /** The group of the step `undo` or `redo` would take, if there is one and it had a group. */
  const groupOf = useCallback(
    (which: 'undo' | 'redo') => {
      if (which === 'redo') return future.current[future.current.length - 1]?.group;
      return effectivePast(capture()).pop()?.group;
    },
    [capture, effectivePast],
  );

  // Only the top step can be one that changed nothing (`record` never stacks two equal ones).
  const canUndo = useMemo(
    () => {
      const steps = past.current.length;
      const top = past.current[steps - 1];
      return steps > 1 || (top !== undefined && !same(top.snap, capture()));
    },
    // `capture` and `same` are new on every render; what they read is `watch`.
    [moves, ...watch],
  );
  const canRedo = future.current.length > 0;

  return { record, undo, redo, clear, groupOf, canUndo, canRedo };
}

import type { KeyboardEvent } from 'react';

/**
 * The WAI-ARIA radio group's keys, written once for `Segmented`, `CategorySwitch` and the Sort
 * builder's direction pair (review of PR #42, Minor 7): from the focused radio, the arrows move to
 * the next or previous one (wrapping; Left / Right flip in a right-to-left page), Home to the
 * first and End to the last, and the radio moved to is focused AND chosen (`choose(index)`), so
 * selection follows focus. The group pairs this with a roving tabIndex: only the chosen radio is
 * in the Tab order. Attach to the `role="radiogroup"` element's `onKeyDown`.
 */
export function onRadioGroupKey(e: KeyboardEvent<HTMLElement>, choose: (index: number) => void) {
  const group = e.currentTarget;
  const items = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  const rtl =
    (group.closest('[dir]')?.getAttribute('dir') ?? '') === 'rtl' ||
    getComputedStyle(group).direction === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  const count = items.length;
  let next: number;
  if (e.key === forward || e.key === 'ArrowDown') next = (current + 1) % count;
  else if (e.key === backward || e.key === 'ArrowUp') next = (current - 1 + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  else return;
  e.preventDefault();
  items[next]?.focus();
  choose(next);
}

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The focus rules of every modal surface — Dialog, Sheet and all built on them:
 * first focus on `initial` (else the first focusable element), Tab and Shift+Tab kept
 * inside, Escape handed to `onEscape`, and focus handed back to what opened it on close.
 * Not a native <dialog>: jsdom has no `showModal`, and the tests must exercise the same
 * rules the app ships. First written for the confirm dialog (redesign task R.3).
 *
 * `initial = 'panel'` puts first focus on the panel itself (UF.9): a phone sheet of text
 * fields then opens with no keyboard, no iOS zoom and no scroll to a field. Tab from the panel
 * goes to the first control, Shift+Tab to the last, and a screen reader reads the dialog name.
 *
 * The panel itself must carry `tabIndex={-1}` (redesign review): a click on text inside it
 * then focuses the panel, not <body>, so Escape and the Tab trap keep working.
 */
/** Where a modal surface puts first focus: an element, or `'panel'` (the surface itself). */
export type InitialFocus = RefObject<HTMLElement | null> | 'panel';

export function useModalFocus(onEscape: () => void, initial?: InitialFocus) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (initial === 'panel') {
      // preventScroll: a sheet may still be sliding in; nothing inside it should move.
      panel.current?.focus({ preventScroll: true });
    } else {
      const first =
        initial?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
      first?.focus();
    }
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
    // Mount and unmount only: the opener is whatever held focus as the surface opened.
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    // From the panel itself (first focus 'panel', or a click on its text) Tab goes inside.
    const onPanel = document.activeElement === panel.current;
    if (e.shiftKey && (onPanel || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (onPanel || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  return { panel, onKeyDown };
}

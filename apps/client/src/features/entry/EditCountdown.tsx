import { useEffect, useState } from 'react';

/** The last minute of the window, when the Save bar's countdown shows. */
export const COUNTDOWN_MS = 60_000;

/** "0:45": the whole seconds left, rounded up, as m:ss. */
export function countdownText(leftMs: number): string {
  const s = Math.max(0, Math.ceil(leftMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The Save bar's countdown in the last minute of a scouter's 5-minute window (SPEC-FINAL 7.6
 * v1.45): "Editable for 0:45", mono, `--warn`, above the button. Nothing before the last minute.
 * It ticks on its own, once a second on the second boundary, so the form around it does not
 * re-render; the time shown is always worked out from `deadline`, so a late tick costs a stale
 * second, never time. Text only: nothing moves, under reduced motion or not.
 */
export function EditCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = deadline - t;
      if (left <= 0) return;
      // Asleep until the last minute; then on each whole second.
      id = setTimeout(tick, left > COUNTDOWN_MS ? left - COUNTDOWN_MS : left % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(id);
  }, [deadline]);
  const left = deadline - now;
  if (left > COUNTDOWN_MS || left <= 0) return null;
  return (
    <p role="timer" className="text-center font-num text-[0.8125rem] font-semibold text-warn">
      {`Editable for ${countdownText(left)}`}
    </p>
  );
}

import { Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { formatClock, matchEndSeconds, type TimerConfig } from '@frc/shared';
import { Toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { matchClock, type ClockOrigin } from './matchClock';
import { PHASE_TAB } from './phases';
import { useNow } from './useNow';

/** Where the moment `t` falls: its phase, how long that phase runs and when it started. */
function phaseOf(config: TimerConfig, t: number) {
  let start = 0;
  for (const [index, phase] of config.phases.entries()) {
    if (t < start + phase.seconds) return { index, phase, start };
    start += phase.seconds;
  }
  return null;
}

/**
 * The phone bar sits under the sticky top bar, the desktop bar under the crumb bar: both on the
 * shell's `--top-bar`, never a copy of a bar's height (Phase 1 I side task 2).
 */
const STICKY = {
  phone: 'sticky top-[var(--top-bar,0px)] z-20',
  desktop: 'sticky top-[var(--top-bar,0px)] z-10',
} as const;

/** The phase tag: 10.5 px / 800, tracked, on `--accent` (THEME, smaller timer 2026-10-09). */
const PHASE_TAG =
  'shrink-0 rounded-tag bg-accent px-[7px] py-0.5 text-[0.65625rem] font-extrabold tracking-[0.06em] text-on-accent';

/**
 * The sticky match timer (SPEC-FINAL 8.4; entry parts "Sticky match timer", at the smaller sizes
 * THEME.md locks). On a phone a `--rail-raised` bar pinned under the top bar; on a computer one
 * slim bar across the top of the form card, pinned under the crumb bar. **Ready:** ▶ Start match
 * and the match length. **Running:** the phase tag, the time left in the phase (amber in its last
 * 10 s), the total and ↺ reset, over a 4 px bar of one segment per phase sized by its length.
 * **Over:** "MATCH OVER" on `--rail`, and entry carries on.
 *
 * Guidance only: it never opens or closes a phase, never locks or gates a field and never
 * submits. It only sets `matchClock`'s origin (Start match is `t = 0` for every event-log tap)
 * and reads it back. Reset is undone from the "Match timer reset · Undo" toast. With no phases
 * in the form's `timer_config` it is not drawn at all.
 */
export function MatchTimer({
  config,
  layout,
}: {
  config: TimerConfig | null | undefined;
  layout: 'phone' | 'desktop';
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => matchClock.subscribe(redraw), []);
  const [undo, setUndo] = useState<ClockOrigin | null>(null);
  const dismiss = useCallback(() => setUndo(null), []);

  const end = config ? matchEndSeconds(config) : null;
  const running = matchClock.isRunning();
  const elapsed = running ? (matchClock.elapsed() ?? 0) : 0;
  const over = running && end !== null && elapsed >= end;
  // Ticks only while there is a countdown to draw; the time is always read from timestamps.
  useNow(running && !over, 250);

  if (!config || end === null) return null;
  const desktop = layout === 'desktop';

  function reset() {
    const before = matchClock.snapshot();
    matchClock.reset();
    setUndo(before);
  }

  const toast = (
    <Toast
      open={undo !== null}
      message="Match timer reset"
      action={{ label: 'Undo', onClick: () => matchClock.restore(undo) }}
      onDismiss={dismiss}
      className={
        desktop
          ? 'bottom-6 left-1/2 w-[22rem] -translate-x-1/2'
          : 'inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))]'
      }
    />
  );

  const bar = cn(
    STICKY[layout],
    'flex text-surface',
    desktop ? 'min-h-11 items-center gap-3 px-5 py-1.5' : 'flex-col gap-1 px-3 pt-[5px] pb-1.5',
  );

  if (!running) {
    return (
      <section aria-label="Match timer" className={cn(bar, 'bg-rail-raised')}>
        <div className={cn('flex min-h-8 flex-1 items-center gap-2', desktop && 'min-h-9')}>
          <button
            type="button"
            onClick={() => matchClock.start()}
            className="tap-target hover-veil motion-safe:transition motion-safe:active:scale-[0.97] relative inline-flex min-h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-sm font-bold text-on-accent after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
          >
            <Play aria-hidden="true" className="size-3.5 fill-current" />
            Start match
          </button>
          <span className="ms-auto font-num text-xs text-rail-ink">{formatClock(end)} match</span>
        </div>
        {toast}
      </section>
    );
  }

  if (over) {
    return (
      <section aria-label="Match timer" className={cn(bar, 'bg-rail')}>
        <div className="flex min-h-8 flex-1 items-center gap-2.5">
          <span className={cn(PHASE_TAG, 'bg-surface text-rail')}>MATCH OVER</span>
          <span className="font-num text-lg font-semibold text-rail-ink">{formatClock(end)}</span>
          <span className="ms-auto font-num text-xs text-rail-ink">keep entering</span>
        </div>
        {toast}
      </section>
    );
  }

  const now = phaseOf(config, elapsed);
  if (!now) return null;
  const left = now.start + now.phase.seconds - elapsed;
  const warn = left <= 10;
  const name = PHASE_TAB[now.phase.phase];

  const segments = (
    <div aria-hidden="true" className={cn('flex h-1 gap-[3px]', desktop && 'min-w-0 flex-1')}>
      {config.phases.map((phase, i) => (
        <span
          key={`${phase.phase}-${i}`}
          data-segment={i < now.index ? 'done' : i === now.index ? 'current' : 'rest'}
          style={{ flexGrow: phase.seconds, flexBasis: 0 }}
          className={cn(
            'relative overflow-hidden rounded-[3px]',
            i < now.index ? 'bg-timer-bar-done' : 'bg-timer-bar-rest',
          )}
        >
          {i === now.index && (
            <span
              className="absolute inset-y-0 start-0 bg-timer-bar-fill"
              style={{ width: `${((elapsed - now.start) / phase.seconds) * 100}%` }}
            />
          )}
        </span>
      ))}
    </div>
  );

  const countdown = (
    <span
      data-testid="match-countdown"
      data-warn={warn || undefined}
      className={cn(
        'whitespace-nowrap font-num font-semibold tracking-[-0.02em]',
        desktop ? 'text-lg' : 'text-xl',
        warn ? 'text-timer-warn' : 'text-surface',
      )}
    >
      {formatClock(Math.ceil(left))}
      {desktop && (
        <small className="ms-1.5 font-sans text-xs font-medium tracking-normal text-rail-ink">
          left in {name.toLowerCase()}
        </small>
      )}
    </span>
  );

  const total = (
    <span className="whitespace-nowrap font-num text-xs text-rail-ink">
      {formatClock(elapsed)} / {formatClock(end)}
    </span>
  );

  const resetButton = (
    <button
      type="button"
      aria-label="Reset match timer"
      onClick={reset}
      className={cn(
        'tap-target hover-veil relative grid min-h-0 min-w-0 shrink-0 place-items-center rounded-control border border-timer-bar-rest text-rail-ink after:absolute after:content-[""]',
        desktop ? 'size-7 after:-inset-2.5' : 'size-8 after:-inset-2',
      )}
    >
      <RotateCcw aria-hidden="true" className={desktop ? 'size-[15px]' : 'size-4'} />
    </button>
  );

  return (
    <section aria-label="Match timer" className={cn(bar, 'bg-rail-raised')}>
      {desktop ? (
        <>
          <span className={PHASE_TAG}>{name.toUpperCase()}</span>
          {countdown}
          {segments}
          {total}
          {resetButton}
        </>
      ) : (
        <>
          <div className="flex min-h-8 items-center gap-2">
            <span className={PHASE_TAG}>{name.toUpperCase()}</span>
            {countdown}
            <span className="ms-auto">{total}</span>
            {resetButton}
          </div>
          {segments}
        </>
      )}
      {toast}
    </section>
  );
}

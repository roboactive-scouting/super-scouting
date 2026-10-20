import { Pause, Pencil, Play, RotateCcw, Undo2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { FormFieldDefinition } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { stopwatches } from '../stopwatches';
import { useNow } from '../useNow';
import { useUndoable } from '../useUndoable';
import { FieldLabel, FieldRow } from './FieldRow';

/** Seconds kept to a tenth, as the face shows them. */
const tenth = (seconds: number) => Math.round(seconds * 10) / 10;

/** "6.4" under a minute (with "s" beside it), "1:12.4" from a minute on. */
function faceText(seconds: number): { value: string; unit: string | null } {
  const s = tenth(seconds);
  if (s < 60) return { value: s.toFixed(1), unit: 's' };
  const m = Math.floor(s / 60);
  return { value: `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`, unit: null };
}

/** The 46 px pills under the face (design `.fb-tmr .b2`). */
const PILL = 'min-h-[2.875rem] flex-1 rounded-full text-[0.9375rem] font-[650] after:-inset-y-px';

/** The 64 px face (design `.fb-tmr .face`). */
const FACE = 'flex h-16 items-center justify-center gap-2.5 rounded-[14px] border';

type Note = 'clear' | 'held';

/**
 * A Timer field (SPEC-FINAL 5.2; design 12-form-builder "The Timer field", `timer-phone.png`): an
 * accumulating stopwatch. **Ready:** one small centred ▶ Start (drawn 40 px, a 48 px tap area)
 * over the "Unsure — no time" switch. **Running:** the time on a green face, then Pause and Clear.
 * **Paused:** a grey face, "Paused" and ✎ to correct a late stop, then Resume and Clear.
 * **Unsure:** a dashed face, and the field holds `null` — no value rather than a wrong one.
 *
 * The value is the accumulated **seconds, a number to a tenth** (`null` when unsure, absent when
 * never timed). It is written when the stopwatch stops (Pause, ✎, Clear), not on every tick; while
 * it runs the time comes from `stopwatches`, computed from timestamps, so it survives a re-render,
 * its phase going off screen and a sleeping tab. Clear is undoable back to the time it held
 * (8.2: a reset two minutes into a match is otherwise unrecoverable).
 */
export function TimerInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const key = field.key;
  const held = typeof value === 'number' ? value : value === null ? null : undefined;
  const history = useUndoable<number | null | undefined, Note>(held, onChange);
  const running = held !== null && stopwatches.running(key);
  const now = useNow(running);
  const [editing, setEditing] = useState<string | null>(null);
  // A start or resume changes nothing the page holds; this draws it.
  const [, redraw] = useState(0);

  const unsure = held === null;
  const seconds = running ? (stopwatches.seconds(key, now) ?? 0) : (held ?? 0);
  const state: 'ready' | 'running' | 'paused' | 'unsure' = unsure
    ? 'unsure'
    : running
      ? 'running'
      : typeof held === 'number'
        ? 'paused'
        : 'ready';

  function start() {
    stopwatches.start(key, 0);
    setEditing(null);
    redraw((n) => n + 1);
  }
  function pause() {
    onChange(tenth(stopwatches.pause(key)));
  }
  function resume() {
    stopwatches.start(key, typeof held === 'number' ? held : 0);
    setEditing(null);
    redraw((n) => n + 1);
  }
  function clear() {
    if (running) {
      // Bank the run first, so the undo has the time it had run to bring back.
      const banked = tenth(stopwatches.pause(key));
      history.set(banked, 'held');
    }
    stopwatches.clear(key);
    setEditing(null);
    history.set(undefined, 'clear');
  }
  function undoClear() {
    history.undo();
  }
  function setUnsure(on: boolean) {
    setEditing(null);
    if (on) {
      // The time so far is kept aside, so switching it off again brings it back.
      if (running) stopwatches.pause(key);
      else if (typeof held === 'number') stopwatches.bank(key, held);
      onChange(null);
      return;
    }
    const kept = stopwatches.get(key)?.base ?? 0;
    onChange(kept > 0 ? tenth(kept) : undefined);
  }
  function commitEdit() {
    if (editing === null) return;
    const n = Number.parseFloat(editing);
    setEditing(null);
    if (!Number.isFinite(n) || n < 0) return;
    const fixed = tenth(n);
    stopwatches.bank(key, fixed);
    onChange(fixed);
  }

  const face = faceText(seconds);
  const time = (
    <span className="font-num text-[1.875rem] font-semibold tracking-[-0.02em] text-ink">
      {face.value}
      {face.unit && <small className="ms-0.5 text-base font-medium text-muted">{face.unit}</small>}
    </span>
  );

  let body: ReactNode;
  if (state === 'ready') {
    body = (
      <Button
        variant="primary"
        aria-label={`Start ${field.label}`}
        onClick={start}
        className="mx-auto my-1 min-h-10 min-w-32 gap-[7px] rounded-full px-[22px] text-[0.90625rem] font-bold after:-inset-y-1 [&_svg]:size-3.5 [&_svg]:fill-current"
      >
        <Play aria-hidden="true" />
        Start
      </Button>
    );
  } else if (state === 'unsure') {
    body = (
      <div
        data-testid="timer-face"
        className={cn(
          FACE,
          'border-dashed border-control-border bg-surface text-sm font-[650] text-muted',
        )}
      >
        No time recorded · unsure
      </div>
    );
  } else if (state === 'running') {
    body = (
      <>
        <div data-testid="timer-face" className={cn(FACE, 'border-accent bg-accent-tint')}>
          {time}
          <span className="inline-flex items-center gap-1.5 text-[0.78125rem] font-bold text-accent-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            Running
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={pause}
            className={cn(
              PILL,
              'border-2 border-accent bg-accent-tint text-accent-ink [&_svg]:fill-current',
            )}
          >
            <Pause aria-hidden="true" />
            Pause
          </Button>
          <Button onClick={clear} className={PILL}>
            <RotateCcw aria-hidden="true" />
            Clear
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div data-testid="timer-face" className={cn(FACE, 'border-line bg-bg')}>
          {editing === null ? (
            time
          ) : (
            <span className="flex items-baseline gap-1">
              <input
                // A late stop is corrected here; Enter or leaving the box keeps it.
                autoFocus
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                aria-label={`${field.label}, seconds`}
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="tap-target h-12 w-28 rounded-control border border-control-border bg-surface px-3 text-end font-num text-[1.375rem] font-semibold text-ink [appearance:textfield] focus-visible:border-2 focus-visible:border-accent focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <small className="text-base text-muted">s</small>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-[0.78125rem] font-bold text-muted">
            <span aria-hidden="true" className="size-2 rounded-full bg-muted" />
            Paused
          </span>
          {editing === null && (
            <Button
              size="icon-sm"
              aria-label="Correct the time"
              onClick={() => setEditing(String(held ?? 0))}
              className="size-[1.875rem] min-h-[1.875rem] min-w-[1.875rem] text-ink-2 after:-inset-[0.5625rem] [&_svg]:size-[15px]"
            >
              <Pencil aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={resume} className={cn(PILL, '[&_svg]:fill-current')}>
            <Play aria-hidden="true" />
            Resume
          </Button>
          <Button onClick={clear} className={PILL}>
            <RotateCcw aria-hidden="true" />
            Clear
          </Button>
        </div>
      </>
    );
  }

  return (
    <FieldRow label={<FieldLabel field={field} id={`${id}-label`} />}>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2.5">
        {body}
        {state !== 'running' && (
          <div className="flex justify-center">
            <Switch lead label="Unsure — no time" checked={unsure} onChange={setUnsure} />
          </div>
        )}
        {state === 'ready' && history.canUndo && history.note === 'clear' && (
          <button
            type="button"
            onClick={undoClear}
            className="tap-target hover-veil mx-auto inline-flex items-center justify-center gap-1 rounded-control px-2 text-xs font-[650] text-accent-ink"
          >
            <Undo2 aria-hidden="true" className="size-3.5 shrink-0" />
            Undo clear
          </button>
        )}
      </div>
    </FieldRow>
  );
}

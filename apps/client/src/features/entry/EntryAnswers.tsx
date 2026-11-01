import { Maximize2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NO_VALUE, type FormFieldDefinition, type RobotStatus } from '@frc/shared';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { mapCount, opensMap } from './map/mapField';
import { displayValue, PHASE_NAME, STATUS_LABEL, type Phase } from './phases';

const ROW = 'flex items-baseline justify-between gap-4 border-t border-line-2 px-3.5 py-2.5';
/** A text answer longer than this sits under its name on the read-only page (22 final). */
const LONG = 24;

/**
 * Which map field is open view only, and the row to put focus back on when it closes (UF.24).
 * The owner draws `MapFieldView` for `viewing` where its keys and taps stay the map's own.
 */
export function useMapView() {
  const [viewing, setViewing] = useState<FormFieldDefinition | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (viewing || returnTo.current === null) return;
    rows.current.get(returnTo.current)?.focus();
    returnTo.current = null;
  }, [viewing]);
  return {
    viewing,
    open(field: FormFieldDefinition) {
      returnTo.current = field.key;
      setViewing(field);
    },
    close: () => setViewing(null),
    rowRef: (key: string) => (el: HTMLButtonElement | null) => {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    },
  };
}

export type MapView = ReturnType<typeof useMapView>;

/**
 * An entry's answers by phase, as the confirmation summary draws them (SPEC-FINAL 8.2): a card,
 * a `--muted` heading per phase, then a row per field — the name at the left in `--ink-2`, the
 * value at the right in `--ink` 600. A map field is one compact row, the whole row a button that
 * opens the map view only (UF.24). Shared by `ConfirmEntry` and the read-only super entry
 * (22-super-readonly final), which also puts a long text answer under its name (`stackLong`).
 */
export function EntryAnswers({
  phases,
  data,
  status,
  map,
  stackLong = false,
}: {
  phases: readonly Phase[];
  data: Record<string, unknown>;
  /** The robot status row, first; left out when undefined (a super entry has none). */
  status?: RobotStatus | null;
  map: MapView;
  stackLong?: boolean;
}) {
  const desktop = useIsDesktop();
  const showStatus = status !== undefined;

  function row(field: FormFieldDefinition) {
    const value = data[field.key];
    const words = mapCount(field, value);
    if (words && opensMap(field)) {
      return (
        <MapRow
          key={field.key}
          label={field.label}
          words={words}
          verb={desktop ? 'Click' : 'Tap'}
          rowRef={map.rowRef(field.key)}
          onOpen={() => map.open(field)}
        />
      );
    }
    const isMapType =
      field.type === 'position' || field.type === 'cycle_path' || field.type === 'event_log';
    // An event log that never asks where reads "5 events"; an empty map field "—".
    const text = isMapType ? (words ?? NO_VALUE) : displayValue(field, value);
    const long = stackLong && !isMapType && text.length > LONG;
    return (
      <div key={field.key} className={cn(ROW, long && 'flex-col items-stretch gap-0.5')}>
        <dt className="text-ink-2" dir="auto">
          {field.label}
        </dt>
        <dd
          className={cn(
            'font-semibold text-ink',
            long ? 'text-start leading-[1.4] font-medium break-words' : 'text-end',
            field.type === 'counter' && 'num',
          )}
          dir="auto"
        >
          {text}
        </dd>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface text-[0.84375rem]">
      {showStatus && (
        <dl>
          <div className={`${ROW} border-t-0`}>
            <dt className="text-ink-2">Status</dt>
            <dd className="font-semibold text-ink">{status ? STATUS_LABEL[status] : NO_VALUE}</dd>
          </div>
        </dl>
      )}
      {phases.map((phase, i) => (
        <div
          key={phase.key}
          className={!showStatus && i > 0 ? 'border-t border-line-2' : undefined}
        >
          <h3 className="px-3.5 pt-3 pb-1 text-xs font-[650] text-muted">
            {PHASE_NAME[phase.key]}
          </h3>
          <dl>{phase.fields.filter((field) => field.type !== 'section').map(row)}</dl>
        </div>
      ))}
    </div>
  );
}

/**
 * A map field's row (UF.24): the name at the left; at the right what it holds, in `--ink` 600,
 * over "⤢ Tap to view" in `--accent-ink`. The whole row is the button (≥ 48 px), named
 * "Teleop events: 5 events · 4 on the map"; the name is the list's term for a screen reader.
 * The entry preview (task 1.52) draws its rows with it too, `end` holding its points cell.
 */
export function MapRow({
  label,
  words,
  verb,
  rowRef,
  onOpen,
  end,
  className,
}: {
  label: string;
  words: string;
  verb: 'Tap' | 'Click';
  rowRef: (el: HTMLButtonElement | null) => void;
  onOpen: () => void;
  /** Drawn after the value, inside the button: the preview's (empty) points cell. */
  end?: ReactNode;
  className?: string;
}) {
  const hint = useId();
  return (
    <div className="border-t border-line-2">
      <dt className="sr-only" dir="auto">
        {label}
      </dt>
      <dd>
        <button
          ref={rowRef}
          type="button"
          aria-label={`${label}: ${words}`}
          aria-describedby={hint}
          onClick={onOpen}
          className={cn(
            'tap-target hover-veil flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-start',
            className,
          )}
        >
          <span aria-hidden="true" className="flex-1 text-ink-2" dir="auto">
            {label}
          </span>
          <span className="flex flex-col items-end text-end">
            <span aria-hidden="true" className="font-semibold text-ink">
              {words}
            </span>
            <span
              id={hint}
              className="mt-0.5 inline-flex items-center gap-1 text-[0.78125rem] font-[650] text-accent-ink"
            >
              <Maximize2 aria-hidden="true" className="size-3.5" />
              {verb} to view
            </span>
          </span>
          {end}
        </button>
      </dd>
    </div>
  );
}

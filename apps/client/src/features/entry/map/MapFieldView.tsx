import { Fragment } from 'react';
import {
  denormalizeForAlliance,
  formatClock,
  selectOptions,
  type FormFieldDefinition,
  type Point,
} from '@frc/shared';
import { cn } from '@/lib/utils';
import { useEntryContext } from '../entryContext';
import { axisOf, cyclesOf, isPlaced, mapCount, mapSubtitle, pointsOf, tapsOf } from './mapField';
import { MapSheet, type MapMark, type MapPath } from './MapSheet';
import type { MapLayout } from './mapGeometry';

/** "5 events · 4 on the map" with its numbers in mono ink, as the map's own counts read. */
function Count({ words }: { words: string }) {
  return (
    <>
      {words.split(/(\d+)/).map((part, i) =>
        /^\d+$/.test(part) ? (
          <b key={i} className="font-num font-semibold text-ink">
            {part}
          </b>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A map field opened from the confirmation summary, to look at and never to change (UF.24;
 * SPEC-FINAL 8.2 v1.30; design 14-entry-parts/round-3 `review-maps-phone.png` frame 3). It is the
 * field's own map — MapSheet, full screen on a phone with the scout's end at the bottom, the dialog
 * on a computer with it on the left, the same mirroring as editing — in its `viewOnly` mode: the
 * marks, the count, a "View only" tag and Close.
 *
 * - **Position**: its spots (numbered when the field holds a list, as while editing).
 * - **Cycle path**: its routes, each with a dot at every point, a ring on the first and an arrowhead on the last.
 * - **Event log**: each placed event's spot, numbered in event order, and every event listed as a
 *   chip with its number, name and time; one without a place gets a dashed "–" and "no place".
 *
 * In the timed parts' chunk (lazyParts), which the app loads as it starts and the service worker
 * precaches, so it opens offline; MapSheet comes with it.
 */
export function MapFieldView({
  field,
  value,
  onClose,
  layout,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onClose: () => void;
  /** Phone or computer; by default the viewport decides (tests pin it). */
  layout?: MapLayout;
}) {
  const { alliance, station, fieldImagePath, caption } = useEntryContext();
  const axis = axisOf(field);
  const shown = (p: Point) => denormalizeForAlliance(p, alliance, axis);
  const words = mapCount(field, value);

  let marks: MapMark[] = [];
  let paths: MapPath[] = [];
  let lead = null;
  let hint = null;

  if (field.type === 'position') {
    const points = pointsOf(value);
    const multi = field.config.multi_point === true;
    marks = points.map((p, i) => ({
      id: String(i),
      point: shown(p),
      tone: 'own',
      label: multi ? String(i + 1) : undefined,
    }));
  } else if (field.type === 'cycle_path') {
    paths = cyclesOf(value)
      .filter((path) => path.length > 0)
      .map((path, i) => ({ id: String(i), points: path.map(shown), name: `Path ${i + 1}` }));
  } else if (field.type === 'event_log') {
    const taps = tapsOf(value);
    const types = selectOptions({ config: { options: field.config.event_types } });
    const labelOf = (type: string) => types.find((o) => o.value === type)?.label ?? type;
    const own = alliance === 'red' ? 'bg-alliance-red' : 'bg-alliance-blue';
    marks = taps.flatMap((tap, i) =>
      isPlaced(tap)
        ? [{ id: String(i), point: shown(tap), tone: 'own' as const, label: String(i + 1) }]
        : [],
    );
    if (marks.length > 0) hint = 'Numbers follow the order of the events below';
    lead = (
      <ol aria-label={`${field.label}, in order`} className="flex w-full flex-wrap gap-1.5">
        {taps.map((tap, i) => {
          const placed = isPlaced(tap);
          return (
            <li
              key={i}
              className="inline-flex h-[1.875rem] items-center gap-1.5 rounded-full bg-line-2 ps-1 pe-2.5 text-[0.8125rem] font-[650] whitespace-nowrap text-ink"
            >
              {placed ? (
                <span
                  className={cn(
                    'grid size-[1.375rem] place-items-center rounded-full font-num text-[0.6875rem] font-bold text-surface',
                    own,
                  )}
                >
                  {i + 1}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-[1.375rem] place-items-center rounded-full border border-dashed border-control-border bg-surface font-num text-[0.6875rem] font-bold text-muted"
                >
                  –
                </span>
              )}
              <span dir="auto">{labelOf(tap.type)}</span>
              <span className="font-num font-medium text-ink-2">{formatClock(tap.t)}</span>
              {!placed && <span className="text-xs font-medium text-muted">no place</span>}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <MapSheet
      open
      viewOnly
      layout={layout}
      title={field.label}
      subtitle={mapSubtitle(caption, field)}
      alliance={alliance}
      station={station}
      imagePath={fieldImagePath}
      marks={marks}
      paths={paths}
      onClose={onClose}
      hint={hint}
      lead={lead}
      status={words && <Count words={words} />}
    />
  );
}

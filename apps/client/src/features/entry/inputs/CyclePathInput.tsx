import { Check, Eraser, Plus, Undo2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import {
  denormalizeForAlliance,
  type CyclePath,
  type FormFieldDefinition,
  type Point,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { useEntryContext } from '../entryContext';
import { MapButton } from '../map/MapButton';
import { axisOf, capOf, cyclesOf, mapCount, mapSubtitle } from '../map/mapField';
import { storeImagePoint } from '../map/mapGeometry';
import { useUndoable } from '../useUndoable';
import { FieldLabel, FieldRow } from './FieldRow';
import { MAP_TOOL } from './PositionInput';

// The shared map pop-up's own chunk (task 1.34), precached, so it opens offline.
const MapSheet = lazy(() => import('../map/MapSheet').then((m) => ({ default: m.MapSheet })));

/**
 * The path being drawn: the number of paths before it, so it is `paths[base]` once it has a
 * point (it is always the last; a new path is appended and finished paths cannot be removed
 * while one is drawn). Null when no path is being drawn.
 */
type Drawing = { base: number } | null;

/** Each change remembers what was being drawn before it, so Undo puts that back too. */
type Note = { before: Drawing };

/**
 * A cycle-path field (SPEC-FINAL 5.2, 5.6, 8.2; design 12-form-builder "The map", "Cycle path"):
 * one map button in the form that opens the shared map. An entry holds a list of cycles, each an
 * ordered list of normalized `{x, y}` points (alliance-normalized like a position), at most
 * `max_points_per_cycle` (default 6) to a cycle: a rough sketch, not a trajectory. Only the routes
 * are drawn: no numbers, no scoring.
 *
 * A tap starts a path (or + New path does); taps add its points in order. While drawing:
 * "● Drawing path n · k of 6 points", **Undo** (the last change: the last point), **Clear path**
 * (empties only the path being drawn, which is still being drawn so it can be started again) and
 * **Finish**. A point past the cap is refused, and the hint says so. Otherwise: + New path and
 * "n paths", and a finished path can be tapped to select it: ✕ Remove path, or the Delete key.
 * Every change goes through `useUndoable` (8.2). With the season image missing, the map is
 * FieldImage's alert and nothing can be recorded.
 */
export function CyclePathInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { alliance, station, fieldImagePath, caption } = useEntryContext();
  const desktop = useIsDesktop();
  const axis = axisOf(field);
  const cap = capOf(field);
  const held = useMemo(() => cyclesOf(value), [value]);
  const history = useUndoable<CyclePath[], Note>(held, onChange);
  const paths = history.value;
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState<Drawing>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);

  // A value changed from outside (Clear test values, a restored draft) cannot leave it past the end.
  const base = drawing ? Math.min(drawing.base, paths.length) : null;
  const current: CyclePath = base !== null ? (paths[base] ?? []) : [];
  const verb = desktop ? 'Click' : 'Tap';

  function change(next: CyclePath[]) {
    setRefused(false);
    history.set(next, { before: drawing });
  }

  function add(image: Point) {
    const point = storeImagePoint(image, alliance, axis);
    if (base === null) {
      // Nothing being drawn: the tap starts the next path.
      change([...paths, [point]]);
      setDrawing({ base: paths.length });
      return;
    }
    if (current.length >= cap) {
      setRefused(true);
      return;
    }
    change(
      base < paths.length
        ? paths.map((path, i) => (i === base ? [...path, point] : path))
        : [...paths, [point]],
    );
  }

  function clearPath() {
    if (base === null || base >= paths.length) return;
    change(paths.filter((_, i) => i !== base));
  }

  function remove(index: number) {
    setSelected(null);
    change(paths.filter((_, i) => i !== index));
  }

  function undo() {
    const before = history.note?.before ?? null;
    setSelected(null);
    setRefused(false);
    history.undo();
    setDrawing(before);
  }

  function finish() {
    setRefused(false);
    setDrawing(null);
  }

  function close() {
    finish();
    setSelected(null);
    setOpen(false);
  }

  const own = alliance === 'red' ? 'bg-alliance-red' : 'bg-alliance-blue';
  // "2 paths · 9 spots": the confirmation words it the same way (mapCount, UF.24).
  const count = mapCount(field, paths);

  let hint;
  if (base !== null && refused) {
    hint = (
      <>
        A path holds at most {cap} points. <b>Finish</b> it to start the next.
      </>
    );
  } else if (base !== null) {
    hint = (
      <>
        <b>{verb} the map</b> to add the next point · <b>Finish</b> when the route is done
      </>
    );
  } else if (selected !== null) {
    hint = (
      <>
        Path {selected + 1} selected · {verb.toLowerCase()} <b>Remove path</b>, or{' '}
        {verb.toLowerCase()} the map to keep it
      </>
    );
  } else if (paths.length > 0) {
    hint = (
      <>
        <b>{verb} the map</b> to start a path · <b>{verb.toLowerCase()} a path</b> to remove it
        {desktop && ' · Delete removes the selected one'}
      </>
    );
  } else {
    hint = (
      <>
        <b>{verb} the map</b> to start a path, one point at a time
      </>
    );
  }

  const undoButton = (
    <Button onClick={undo} disabled={!history.canUndo} className={MAP_TOOL}>
      <Undo2 aria-hidden="true" />
      Undo
    </Button>
  );

  return (
    <FieldRow label={<FieldLabel field={field} />}>
      <MapButton
        label={field.label}
        count={count}
        alliance={alliance}
        imagePath={fieldImagePath}
        paths={paths.map((path) => path.map((p) => denormalizeForAlliance(p, alliance, axis)))}
        onOpen={() => setOpen(true)}
      />
      {open && (
        <Suspense fallback={null}>
          <MapSheet
            open
            title={field.label}
            subtitle={mapSubtitle(caption, field)}
            alliance={alliance}
            station={station}
            imagePath={fieldImagePath}
            toolsNeedImage
            marks={[]}
            paths={paths.map((path, i) => ({
              id: String(i),
              points: path.map((p) => denormalizeForAlliance(p, alliance, axis)),
              name: `Path ${i + 1}`,
              drawing: i === base,
            }))}
            selected={selected === null ? null : String(selected)}
            // While a path is drawn, every tap is its next point: finished paths are not picked.
            onSelect={
              base === null ? (id) => setSelected(id === null ? null : Number(id)) : undefined
            }
            onRemove={(id) => remove(Number(id))}
            removeLabel="Remove path"
            onTap={add}
            onClose={close}
            hint={hint}
            lead={
              base !== null && (
                <>
                  <span aria-hidden="true" className={cn('size-2.5 flex-none rounded-full', own)} />
                  <span>Drawing path {base + 1}</span>
                  <span
                    className={cn(
                      'font-num font-medium text-muted',
                      desktop ? 'ms-1.5' : 'ms-auto',
                    )}
                  >
                    {current.length} of {cap} points
                  </span>
                </>
              )
            }
            tools={
              base !== null ? (
                <>
                  {undoButton}
                  <Button onClick={clearPath} disabled={current.length === 0} className={MAP_TOOL}>
                    <Eraser aria-hidden="true" />
                    Clear path
                  </Button>
                  <Button onClick={finish} className={cn(MAP_TOOL, !desktop && 'ms-auto')}>
                    <Check aria-hidden="true" />
                    Finish
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      setSelected(null);
                      setDrawing({ base: paths.length });
                    }}
                    className={MAP_TOOL}
                  >
                    <Plus aria-hidden="true" />
                    New path
                  </Button>
                  {history.canUndo && undoButton}
                </>
              )
            }
            status={
              base === null && (
                <>
                  <b className="font-num font-semibold text-ink">{paths.length}</b>{' '}
                  {paths.length === 1 ? 'path' : 'paths'}
                </>
              )
            }
            done={{ label: 'Done', onClick: close }}
          />
        </Suspense>
      )}
    </FieldRow>
  );
}

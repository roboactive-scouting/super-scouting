import { Eraser, Undo2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { denormalizeForAlliance, type FormFieldDefinition, type Point } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { useEntryContext } from '../entryContext';
import { MapButton } from '../map/MapButton';
import { axisOf, mapSubtitle, plural, pointsOf } from '../map/mapField';
import { storeImagePoint } from '../map/mapGeometry';
import { useUndoable } from '../useUndoable';
import { FieldLabel, FieldRow } from './FieldRow';

// The shared map pop-up's own chunk (task 1.34), precached, so it opens offline.
const MapSheet = lazy(() => import('../map/MapSheet').then((m) => ({ default: m.MapSheet })));

/** What the last change was. */
type Note = 'add' | 'remove' | 'clear';

/** A tool in the map's bar: 44 px on a phone, 40 px in the dialog (THEME "Map pop-up"). */
export const MAP_TOOL = 'min-h-11 px-3.5 text-sm font-[650] [&_svg]:size-4';

/**
 * A field-position picker (SPEC-FINAL 5.2, 5.6, 8.2; design 12-form-builder "The map"): one map
 * button in the form that opens the shared map. A tap stores normalized `{x, y}` in 0–1,
 * alliance-normalized (red raw, blue mirrored on `mirror_axis`) and never dependent on how the
 * drawing is turned. `multi_point` false holds one point (a new tap replaces it); true holds a
 * list (a tap appends), each drawn as a numbered dot in the scout's alliance colour.
 *
 * Tap a spot to select it: a ring and a ✕ Remove pill (or the Delete key); a tap on the map while
 * a spot is selected only lets go of it. Undo takes back the last change, Clear all empties the
 * list; every change goes through `useUndoable` (8.2). With the season image missing, the map is
 * FieldImage's alert and nothing can be recorded.
 */
export function PositionInput({
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
  const multi = field.config.multi_point === true;
  const axis = axisOf(field);
  const held = useMemo(() => pointsOf(value), [value]);
  // One point is stored as the point itself, none as nothing (never a null point).
  const history = useUndoable<Point[], Note>(held, (next) => onChange(multi ? next : next[0]));
  const points = history.value;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const nameOf = (i: number) => (multi ? `Spot ${i + 1}` : 'Spot');
  const verb = desktop ? 'Click' : 'Tap';

  function add(image: Point) {
    const stored = storeImagePoint(image, alliance, axis);
    history.set(multi ? [...points, stored] : [stored], 'add');
  }

  function remove(index: number) {
    setSelected(null);
    history.set(
      points.filter((_, i) => i !== index),
      'remove',
    );
  }

  function undo() {
    setSelected(null);
    history.undo();
  }

  function close() {
    setSelected(null);
    setOpen(false);
  }

  const count = points.length > 0 ? plural(points.length, 'spot', 'spots') : null;

  return (
    <FieldRow label={<FieldLabel field={field} />}>
      <MapButton
        label={field.label}
        count={count}
        alliance={alliance}
        imagePath={fieldImagePath}
        spots={points.map((p) => denormalizeForAlliance(p, alliance, axis))}
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
            marks={points.map((p, i) => ({
              id: String(i),
              point: denormalizeForAlliance(p, alliance, axis),
              tone: 'own' as const,
              label: multi ? String(i + 1) : undefined,
              name: nameOf(i),
            }))}
            selected={selected === null ? null : String(selected)}
            onSelect={(id) => setSelected(id === null ? null : Number(id))}
            onRemove={(id) => remove(Number(id))}
            onTap={add}
            onClose={close}
            hint={
              selected !== null ? (
                <>
                  {nameOf(selected)} selected · {verb.toLowerCase()} <b>Remove</b>, or{' '}
                  {verb.toLowerCase()} the map to keep it
                </>
              ) : multi ? (
                <>
                  <b>{verb} the map</b> to add a spot · <b>{verb.toLowerCase()} a spot</b> to remove
                  it{desktop && ' · Delete removes the selected one'}
                </>
              ) : (
                <>
                  <b>{verb} the map</b> to mark the spot · a new {verb.toLowerCase()} moves it ·{' '}
                  <b>{verb.toLowerCase()} the spot</b> to remove it
                </>
              )
            }
            tools={
              <>
                <Button onClick={undo} disabled={!history.canUndo} className={MAP_TOOL}>
                  <Undo2 aria-hidden="true" />
                  Undo
                </Button>
                {multi && points.length > 1 && (
                  <Button
                    onClick={() => {
                      setSelected(null);
                      history.set([], 'clear');
                    }}
                    className={MAP_TOOL}
                  >
                    <Eraser aria-hidden="true" />
                    Clear all
                  </Button>
                )}
              </>
            }
            status={
              <>
                <b className="font-num font-semibold text-ink">{points.length}</b>{' '}
                {points.length === 1 ? 'spot' : 'spots'}
              </>
            }
            done={{ label: 'Done', onClick: close }}
          />
        </Suspense>
      )}
    </FieldRow>
  );
}

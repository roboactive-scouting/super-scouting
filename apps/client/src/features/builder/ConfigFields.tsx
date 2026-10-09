import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Minus, Plus, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import {
  validateExpr,
  type Expr,
  type FormFieldDefinition,
  type FormIssue,
  type SelectOption,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorLine, Note } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { SortableGrip } from '@/components/ui/sortable-grip';
import { Switch } from '@/components/ui/switch';
import { prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import {
  emptyShape,
  exprOf,
  exprText,
  operandFields,
  resultTypeOf,
  SHAPE_NAME,
  shapeOf,
  type Operand,
  type Shape,
  type ShapeKind,
} from './expressionShapes';
import { typeName } from './fieldTypes';
import { MirrorPreview, type MirrorAxis } from './MirrorPreview';
import { NumberInput, PaneGroup, PaneRow, PaneSegmented } from './paneParts';
import type { PaneField, PanePatch } from './SettingsPane';

/*
 * The settings pane's Configuration group, by type (design 12-form-builder, "Configuration";
 * SPEC-FINAL 5.3). Every change goes up as a patch of the field's `config` (or its default);
 * the page decides whether it is in place or structural.
 */

const MIRROR_OPTIONS: readonly { key: MirrorAxis; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'horizontal', label: 'Left ↔ right' },
  { key: 'vertical', label: 'Top ↔ bottom' },
  { key: 'both', label: 'Both' },
];

/** A choice's value moved (`to`) or went (`to: null`). */
type ValueChange = { from: string; to: string | null };

/** The pane's small icon buttons: muted, 15 px glyphs. */
const ROW_ICON = 'shrink-0 text-muted [&_svg]:size-[15px]';

/** A value from a label: lowercase words joined by `_`, unique in the list. */
function valueFromLabel(label: string, taken: ReadonlySet<string>, fallback: string): string {
  const base =
    label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

let madeIds = 0;
const freshIds = (n: number) => Array.from({ length: n }, () => `choice-${++madeIds}`);

/**
 * An ordered list of choices (a select's options, an event log's buttons): each row has the
 * design's 6-dot grip, its rank when the list is ordered, its label, its value in mono and ×
 * to remove (`-desktop.png`, `-desktop-locked.png`). The grip drags the row to a new place; from
 * the keyboard it is focused, Space picks the row up, the arrows move it and Space drops it
 * (final review, U1: the user asked for the grips in place of ↑ ↓). A value already saved is
 * permanent (it is what entries hold); a new one follows its label. `onItems` also says which
 * value moved or went (`change`), so a select's option points follow.
 */
function ChoiceList({
  items,
  onItems,
  locked,
  noun,
  ranked,
}: {
  items: readonly SelectOption[];
  onItems: (next: SelectOption[], change?: ValueChange) => void;
  locked: (value: string) => boolean;
  noun: 'Option' | 'Button';
  ranked: boolean;
}) {
  // Each row's own id, kept through a reorder, so a moved row keeps its focus and its input.
  const [ids, setIds] = useState(() => freshIds(items.length));
  let rowIds = ids;
  if (ids.length !== items.length) {
    // The list was changed from outside (Edit as JSON): its rows start again.
    rowIds = freshIds(items.length);
    setIds(rowIds);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const others = (i: number) => new Set(items.filter((_, j) => j !== i).map((o) => o.value));
  const relabel = (i: number, label: string) => {
    const o = items[i]!;
    const value = locked(o.value)
      ? o.value
      : valueFromLabel(label, others(i), `${noun.toLowerCase()}_${i + 1}`);
    onItems(
      items.map((item, j) => (j === i ? { label, value } : item)),
      value === o.value ? undefined : { from: o.value, to: value },
    );
  };
  const remove = (i: number) => {
    setIds(rowIds.filter((_, j) => j !== i));
    onItems(
      items.filter((_, j) => j !== i),
      { from: items[i]!.value, to: null },
    );
  };
  const add = () => {
    const taken = new Set(items.map((o) => o.value));
    let n = items.length + 1;
    while (taken.has(`${noun.toLowerCase()}_${n}`)) n++;
    setIds([...rowIds, ...freshIds(1)]);
    onItems([...items, { label: `${noun} ${n}`, value: `${noun.toLowerCase()}_${n}` }]);
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = rowIds.indexOf(String(active.id));
    const to = rowIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    setIds(arrayMove(rowIds, from, to));
    onItems(arrayMove([...items], from, to));
  }

  /** What a screen reader hears during a drag: the choice and its place, never an id. */
  const placeOf = (id: string | number) => rowIds.indexOf(String(id));
  const nameOf = (id: string | number) => {
    const i = placeOf(id);
    return items[i]?.label || `${noun} ${i + 1}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, place ${placeOf(active.id) + 1}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is at place ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} is over nothing.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now place ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-control border border-line">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <ol aria-label={noun === 'Option' ? 'Options' : 'Buttons'}>
            {items.map((o, i) => (
              <ChoiceRow
                key={rowIds[i]}
                id={rowIds[i]!}
                index={i}
                option={o}
                noun={noun}
                ranked={ranked}
                canRemove={items.length > 1}
                onLabel={(label) => relabel(i, label)}
                onRemove={() => remove(i)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Button
        variant="ghost"
        onClick={add}
        className="min-h-12 justify-start rounded-none px-2.5 text-[0.84375rem] font-[650] text-accent-ink [&_svg]:size-4"
      >
        <Plus aria-hidden="true" />
        {noun === 'Option' ? 'Add an option' : 'Add a button'}
      </Button>
    </div>
  );
}

/** One choice: grip · rank · label · mono value · ×. */
function ChoiceRow({
  id,
  index,
  option,
  noun,
  ranked,
  canRemove,
  onLabel,
  onRemove,
}: {
  id: string;
  index: number;
  option: SelectOption;
  noun: 'Option' | 'Button';
  ranked: boolean;
  canRemove: boolean;
  onLabel: (label: string) => void;
  onRemove: () => void;
}) {
  // Reduced motion: rows jump to their places rather than slide (SPEC-FINAL 17.9).
  const sortable = useSortable({ id, transition: prefersReducedMotion() ? null : undefined });
  const t = sortable.transform;
  const name = option.label || `${noun} ${index + 1}`;
  return (
    <li
      ref={sortable.setNodeRef}
      data-choice-row={index}
      style={{
        transform: t ? `translate3d(0, ${t.y}px, 0)` : undefined,
        transition: sortable.transition ?? undefined,
      }}
      className={cn(
        'relative flex min-h-12 items-center gap-1.5 border-b border-line-2 bg-surface py-1 ps-1 pe-1.5',
        sortable.isDragging && 'z-10 shadow-[var(--shadow-float)]',
      )}
    >
      <SortableGrip
        sortable={sortable}
        label={`Move ${name}`}
        className="size-7"
        iconClassName="size-[15px]"
      />
      {ranked && (
        <span className="num w-3.5 shrink-0 text-xs text-muted" aria-hidden="true">
          {index + 1}
        </span>
      )}
      <Input
        aria-label={`${noun} ${index + 1} label`}
        dir="auto"
        value={option.label}
        onChange={(e) => onLabel(e.target.value)}
        className="min-h-10 border-transparent px-1.5 font-semibold hover:border-control-border"
      />
      <code className="num shrink-0 text-xs text-muted">{option.value}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${option.label}`}
        disabled={!canRemove}
        onClick={onRemove}
        className={ROW_ICON}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

/** The mirror control and its preview: position, cycle path, and an event log's "where?". */
function MirrorFields({
  axis,
  onAxis,
  imagePath,
  path,
}: {
  axis: MirrorAxis;
  onAxis: (axis: MirrorAxis) => void;
  imagePath: string | null;
  path: boolean;
}) {
  return (
    <>
      <PaneRow label="Mirror for the blue alliance">
        <PaneSegmented
          label="Mirror for the blue alliance"
          options={MIRROR_OPTIONS}
          value={axis}
          onChange={onAxis}
        />
      </PaneRow>
      <MirrorPreview axis={axis} imagePath={imagePath} path={path} />
      <p className="text-xs leading-snug text-muted">
        {imagePath ? (
          <>
            Game image: <code className="num">{imagePath}</code>, set on the season in Manage.
          </>
        ) : (
          'This season has no game image yet; it is set on the season in Manage.'
        )}
      </p>
    </>
  );
}

/** The computed field's expression, from the shapes the editor offers (expressionShapes). */
function ComputedEditor({
  field,
  allFields,
  onChange,
}: {
  field: FormFieldDefinition;
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
}) {
  const id = useId();
  const config = field.config as { expression?: Expr | null; result_type?: 'float' | 'string' };
  const expression = config.expression ?? null;
  const [shape, setShape] = useState<Shape | null>(
    () => shapeOf(expression) ?? (expression === null ? emptyShape('sum') : null),
  );

  if (shape === null && expression !== null) {
    return (
      <Note icon="info">
        This expression was written as JSON:{' '}
        <code className="num text-ink">{exprText(expression)}</code>. The editor here offers sums,
        differences, products, ratios and joined text.{' '}
        <button
          type="button"
          onClick={() => setShape(emptyShape('sum'))}
          className="font-[650] text-accent-ink underline"
        >
          Replace it
        </button>
      </Note>
    );
  }
  const current = shape ?? emptyShape('sum');
  const write = (next: Shape) => {
    setShape(next);
    onChange({
      config: { ...field.config, expression: exprOf(next), result_type: resultTypeOf(next.kind) },
    });
  };
  const choices = operandFields(field.key, allFields, current.kind);
  const options = (
    <>
      <option value="">—</option>
      {choices.map((f) => (
        <option key={f.key} value={f.key}>
          {f.label} ({f.key})
        </option>
      ))}
    </>
  );
  const expr = exprOf(current);
  const issues = expr ? validateExpr(expr, [...allFields], resultTypeOf(current.kind)) : [];

  return (
    <>
      <PaneRow label="Worked out as" htmlFor={`${id}-shape`}>
        <Select
          id={`${id}-shape`}
          value={current.kind}
          onChange={(e) => write(emptyShape(e.target.value as ShapeKind, current))}
        >
          {(Object.keys(SHAPE_NAME) as ShapeKind[]).map((k) => (
            <option key={k} value={k}>
              {SHAPE_NAME[k]}
            </option>
          ))}
        </Select>
      </PaneRow>
      {current.kind === 'sum' ? (
        <>
          {current.keys.map((key, i) => (
            <div key={i} className="flex items-end gap-1.5">
              <PaneRow label={`Field ${i + 1}`} htmlFor={`${id}-sum-${i}`} className="flex-1">
                <Select
                  id={`${id}-sum-${i}`}
                  value={key ?? ''}
                  onChange={(e) =>
                    write({
                      kind: 'sum',
                      keys: current.keys.map((k, j) => (j === i ? e.target.value || null : k)),
                    })
                  }
                >
                  {options}
                </Select>
              </PaneRow>
              {current.keys.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove field ${i + 1}`}
                  onClick={() =>
                    write({ kind: 'sum', keys: current.keys.filter((_, j) => j !== i) })
                  }
                  className={`${ROW_ICON} mb-2`}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => write({ kind: 'sum', keys: [...current.keys, null] })}
            className="self-start px-1.5 font-[650] text-accent-ink [&_svg]:size-4"
          >
            <Plus aria-hidden="true" />
            Add a field
          </Button>
        </>
      ) : (
        <TwoOperands
          id={id}
          shape={current}
          options={options}
          onShape={write}
          allowNumber={current.kind !== 'join'}
        />
      )}
      {expr ? (
        <p className="text-xs text-muted">
          Saves <code className="num text-ink">{exprText(expr)}</code> as{' '}
          {current.kind === 'join' ? 'text' : 'a number'}.
        </p>
      ) : (
        <p className="text-xs leading-snug text-muted">
          Until every operand is chosen the expression stays empty, and the form can't be published.
        </p>
      )}
      {issues.length > 0 && (
        <ErrorLine>
          {issues.map((i) => (
            <span key={i.message} className="block">
              {sentence(i.message)}
            </span>
          ))}
        </ErrorLine>
      )}
    </>
  );
}

function TwoOperands({
  id,
  shape,
  options,
  onShape,
  allowNumber,
}: {
  id: string;
  shape: Extract<Shape, { left: string | null }>;
  options: ReactNode;
  onShape: (shape: Shape) => void;
  allowNumber: boolean;
}) {
  const right = shape.right;
  const rightValue = right === null ? '' : right.kind === 'field' ? right.key : '#number';
  const setRight = (next: Operand) => onShape({ ...shape, right: next });
  return (
    <>
      <PaneRow label="First" htmlFor={`${id}-left`}>
        <Select
          id={`${id}-left`}
          value={shape.left ?? ''}
          onChange={(e) => onShape({ ...shape, left: e.target.value || null })}
        >
          {options}
        </Select>
      </PaneRow>
      <PaneRow label="Second" htmlFor={`${id}-right`}>
        <Select
          id={`${id}-right`}
          value={rightValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') setRight(null);
            else if (v === '#number') setRight({ kind: 'number', value: 1 });
            else setRight({ kind: 'field', key: v });
          }}
        >
          {options}
          {allowNumber && <option value="#number">A number</option>}
        </Select>
      </PaneRow>
      {right?.kind === 'number' && (
        <PaneRow label="The number" htmlFor={`${id}-num`}>
          <NumberInput
            id={`${id}-num`}
            value={right.value}
            onValue={(n) => setRight({ kind: 'number', value: n })}
          />
        </PaneRow>
      )}
    </>
  );
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1) + '.';

/** The config issues a check found, as sentences, under the group they belong to. */
export function IssueLines({ issues }: { issues: readonly { message: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <ErrorLine>
      {issues.map((i) => (
        <span key={i.message} className="block">
          {sentence(i.message)}
        </span>
      ))}
    </ErrorLine>
  );
}

/**
 * The Configuration group for the selected field's type; nothing for a toggle or a section,
 * which have nothing to set. `forkNote` ("starts draft v4") is set on a published version,
 * where changing a select's list of options is structural.
 */
export function ConfigFields({
  field,
  allFields,
  onChange,
  editable,
  forkNote,
  savedOptionValues,
  seasonImagePath,
  issues,
}: {
  field: PaneField;
  allFields: readonly FormFieldDefinition[];
  onChange: (patch: PanePatch) => void;
  editable: boolean;
  forkNote: string | null;
  /** Option and button values already saved: permanent. Undefined: every current value. */
  savedOptionValues?: readonly string[];
  seasonImagePath: string | null;
  issues: readonly FormIssue[];
}) {
  const id = useId();
  const config = field.config;
  const setConfig = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...config };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange({ config: next });
  };
  const num = (k: string) => (typeof config[k] === 'number' ? (config[k] as number) : null);
  const locked = (value: string) => (savedOptionValues ? savedOptionValues.includes(value) : true);
  const disabled = !editable;
  let body: ReactNode;

  switch (field.type) {
    case 'counter':
    case 'number': {
      // A step is above 0 (the config's rule); a counter counts whole pieces, so its default
      // is a whole number.
      const box = (label: string, key: string) => (
        <PaneRow label={label} htmlFor={`${id}-${key}`}>
          <NumberInput
            id={`${id}-${key}`}
            positive={key === 'step'}
            value={num(key)}
            onValue={(n) => setConfig({ [key]: n ?? undefined })}
          />
        </PaneRow>
      );
      body = (
        <div className="grid grid-cols-4 gap-2">
          {box('Min', 'min')}
          {box('Max', 'max')}
          {box('Step', 'step')}
          <PaneRow label="Default" htmlFor={`${id}-default`}>
            <NumberInput
              id={`${id}-default`}
              integer={field.type === 'counter'}
              value={typeof field.default_value === 'number' ? field.default_value : null}
              onValue={(n) => onChange({ default_value: n })}
            />
          </PaneRow>
        </div>
      );
      break;
    }
    case 'single_select':
    case 'multi_select': {
      const options = (config.options as SelectOption[] | undefined) ?? [];
      const ordered = field.is_ordinal === true;
      const fork = forkNote ? `Adding an option ${forkNote}` : null;
      body = (
        <>
          <Switch
            lead
            label={
              <>
                <b className="font-[650] text-ink">Ordered</b> · the list order is the rank, worst →
                best
              </>
            }
            checked={ordered}
            onChange={(on) =>
              onChange(
                'is_ordinal' in config
                  ? { is_ordinal: on, config: { ...config, is_ordinal: on } }
                  : { is_ordinal: on },
              )
            }
          />
          {ordered && <p className="px-0.5 text-[0.71875rem] font-bold text-muted">WORST</p>}
          <ChoiceList
            items={options}
            onItems={(next, change) => {
              const patch: PanePatch = { config: { ...config, options: next } };
              // A new option's points follow its value, and go with it when it is removed. A
              // saved option's stay: its value is still another version's, and the save keeps
              // points only for options some version has (fix round 1, I2).
              const points = field.option_points;
              if (change && points && change.from in points && !locked(change.from)) {
                const { [change.from]: moved, ...rest } = points;
                patch.option_points = change.to === null ? rest : { ...rest, [change.to]: moved! };
              }
              onChange(patch);
            }}
            locked={locked}
            noun="Option"
            ranked={ordered}
          />
          {(ordered || fork) && (
            <p className="flex justify-between gap-2 px-0.5 text-[0.71875rem] font-bold text-muted">
              <span>{ordered ? 'BEST' : ''}</span>
              {fork && <span className="font-semibold">{fork}</span>}
            </p>
          )}
        </>
      );
      break;
    }
    case 'event_log': {
      const buttons = (config.event_types as SelectOption[] | undefined) ?? [];
      const asks = config.ask_position === true;
      body = (
        <>
          <PaneRow
            label="Buttons"
            hint="One button per kind of event. Each gets its own cycle times."
          >
            <ChoiceList
              items={buttons}
              onItems={(next) => setConfig({ event_types: next })}
              locked={locked}
              noun="Button"
              ranked={false}
            />
          </PaneRow>
          <Switch
            lead
            label={
              <>
                <b className="font-[650] text-ink">Ask where on the field</b> after each tap
              </>
            }
            checked={asks}
            onChange={(on) =>
              setConfig(
                on
                  ? { ask_position: true, mirror_axis: config.mirror_axis ?? 'horizontal' }
                  : { ask_position: false },
              )
            }
          />
          {asks && (
            <MirrorFields
              axis={(config.mirror_axis as MirrorAxis | undefined) ?? 'horizontal'}
              onAxis={(axis) => setConfig({ mirror_axis: axis })}
              imagePath={seasonImagePath}
              path={false}
            />
          )}
          <Note icon="info">
            <b className="text-ink">What a tap saves:</b> the button and the seconds since{' '}
            <b className="text-ink">Start match</b> (or since the first tap, if the timer wasn't
            started){asks ? ', and where on the field, unless the scouter skips it' : ''}. The
            analysis works out, per button, how many, the time between taps (cycle times) and the
            time to the first one.
          </Note>
        </>
      );
      break;
    }
    case 'rating':
      body = (
        <>
          <PaneRow label="Highest rating" htmlFor={`${id}-max`}>
            <NumberInput
              id={`${id}-max`}
              integer
              min={1}
              value={num('max')}
              onValue={(n) => setConfig({ max: n ?? undefined })}
            />
          </PaneRow>
          <PaneRow label="Shown as">
            <PaneSegmented
              label="Shown as"
              options={[
                { key: 'stars', label: 'Stars' },
                { key: 'slider', label: 'Slider' },
              ]}
              value={(config.style as 'stars' | 'slider' | undefined) ?? null}
              onChange={(style) => setConfig({ style })}
            />
          </PaneRow>
        </>
      );
      break;
    case 'short_text':
    case 'long_text':
      body = (
        <PaneRow
          label="Longest answer, in characters"
          htmlFor={`${id}-len`}
          hint="Leave it blank for no limit."
        >
          <NumberInput
            id={`${id}-len`}
            integer
            min={1}
            value={num('max_length')}
            onValue={(n) => setConfig({ max_length: n ?? undefined })}
          />
        </PaneRow>
      );
      break;
    case 'timer':
      body = (
        <Note icon="info">
          A timer always offers <b className="text-ink">Unsure — no time</b>: a scouter who missed
          the moment says so, and the field saves no value rather than a wrong one.
        </Note>
      );
      break;
    case 'position':
      body = (
        <>
          <PaneRow label="Each entry holds">
            <PaneSegmented
              label="Each entry holds"
              options={[
                { key: 'one', label: 'One point' },
                { key: 'list', label: 'A list of points' },
              ]}
              value={config.multi_point === true ? 'list' : 'one'}
              onChange={(k) => setConfig({ multi_point: k === 'list' })}
            />
          </PaneRow>
          <MirrorFields
            axis={(config.mirror_axis as MirrorAxis | undefined) ?? 'none'}
            onAxis={(axis) => setConfig({ mirror_axis: axis })}
            imagePath={seasonImagePath}
            path={false}
          />
        </>
      );
      break;
    case 'cycle_path': {
      const most = num('max_points_per_cycle') ?? 6;
      body = (
        <>
          <PaneRow
            label="Points per cycle, at most"
            htmlFor={`${id}-pts`}
            hint="A rough sketch, not a trajectory. Fewer points keep each entry small for offline sync."
          >
            <div className="flex items-center gap-1.5">
              <Button
                size="icon"
                aria-label="One point fewer"
                disabled={most <= 2}
                onClick={() => setConfig({ max_points_per_cycle: most - 1 })}
              >
                <Minus aria-hidden="true" />
              </Button>
              <NumberInput
                id={`${id}-pts`}
                integer
                min={2}
                value={most}
                onValue={(n) => setConfig({ max_points_per_cycle: n ?? undefined })}
                className="w-20 text-center"
              />
              <Button
                size="icon"
                aria-label="One point more"
                onClick={() => setConfig({ max_points_per_cycle: most + 1 })}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </PaneRow>
          <MirrorFields
            axis={(config.mirror_axis as MirrorAxis | undefined) ?? 'none'}
            onAxis={(axis) => setConfig({ mirror_axis: axis })}
            imagePath={seasonImagePath}
            path
          />
        </>
      );
      break;
    }
    case 'computed':
      body = <ComputedEditor field={field} allFields={allFields} onChange={onChange} />;
      break;
    default:
      return null;
  }

  // The computed editor shows its own expression issues; the rest are listed here.
  const shown = issues.filter(
    (i) =>
      (i.path.startsWith('config') || i.path === 'default_value' || i.path === 'is_ordinal') &&
      !(field.type === 'computed' && i.path.startsWith('config.expression')),
  );
  return (
    <PaneGroup title="Configuration" sub={typeName(field.type)} disabled={disabled}>
      {body}
      <IssueLines issues={shown} />
    </PaneGroup>
  );
}

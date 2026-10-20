import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';
import type { FieldPhase, FormFieldDefinition } from '@frc/shared';
import { FilterChips } from '@/components/ui/filter-chips';
import { SortableGrip } from '@/components/ui/sortable-grip';
import { WarningFlag } from '@/components/ui/tag';
import { Tabs } from '@/components/ui/tabs';
import { PHASE_NAME, PHASE_ORDER, PHASE_TAB } from '@/features/entry/phases';
import { prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { FieldPreview } from './FieldPreview';
import { typeName } from './fieldTypes';
import { LivePreviewColumn } from './LivePreview';
import { MEANING_PATHS, phaseOfIndex, type BuilderState } from './useBuilderState';

/** Drop targets: the phase column, and each phase tab (a field type dropped there joins it). */
export const CANVAS_DROP = 'canvas';
const tabDropId = (phase: FieldPhase) => `tab:${phase}`;

/** The fields on each phase page, with their place in the whole list. */
export function phasePages(
  fields: readonly FormFieldDefinition[],
): Record<FieldPhase, { field: FormFieldDefinition; index: number }[]> {
  const pages: Record<FieldPhase, { field: FormFieldDefinition; index: number }[]> = {
    auto: [],
    teleop: [],
    endgame: [],
    post_match: [],
  };
  fields.forEach((field, index) => pages[phaseOfIndex(fields, index)].push({ field, index }));
  return pages;
}

/** Edit draws the form to arrange it; Try it fills it as a scouter would (task 1.31). */
export type CanvasMode = 'edit' | 'try';

/** Try it's values: what the controls hold, and the data as it would save (for visibility). */
type TryValues = {
  values: Record<string, unknown>;
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/** How far a sideways trackpad swipe goes before the phase changes. */
const WHEEL_STEP = 80;
const WHEEL_REST_MS = 450;

/**
 * The form canvas (design 12-form-builder, variant D "Live canvas"): the scouter's phase tabs
 * with counts and a ⚠ on a phase holding an incomplete field, "Phase n of 4" with pager dots,
 * then a 410 px column of the phase's fields drawn with the real entry controls, under their
 * section headings, each with its key and points at the top right; a foot naming the phases
 * either side. ← / →, a tab click or a sideways trackpad swipe changes phase. Try it (task
 * 1.31) draws the same column with the controls working, without grips, keys or selection.
 */
export function BuilderCanvas({
  state,
  phase,
  onPhase,
  editable,
  points,
  dragging,
  mode = 'edit',
  onMode,
  tryIt,
}: {
  state: BuilderState;
  phase: FieldPhase;
  onPhase: (phase: FieldPhase) => void;
  editable: boolean;
  /** The points tag per key ("4/ea pts"), where the field is scored. */
  points: ReadonlyMap<string, string>;
  /** A drag is running: arrows belong to it, not to the phase pager. */
  dragging: boolean;
  mode?: CanvasMode;
  onMode?: (mode: CanvasMode) => void;
  /** Try it's values; the mode is offered only with them. */
  tryIt?: TryValues;
}) {
  const trying = mode === 'try' && tryIt !== undefined;
  const pages = phasePages(state.fields);
  const flagged = new Set(
    PHASE_ORDER.filter((p) => pages[p].some(({ field }) => state.issuesFor(field.key).length > 0)),
  );
  const at = PHASE_ORDER.indexOf(phase);
  const previous = PHASE_ORDER[at - 1];
  const next = PHASE_ORDER[at + 1];
  const page = pages[phase];
  /**
   * The page's ids for the SortableContext, the same array while they are the same (UF.20).
   * dnd-kit tells `items` apart by reference: a new array on every render — and the canvas
   * renders on every pointer move of a drag — read to it as a changed list, so it switched the
   * other fields' transitions off and they jumped into place instead of sliding.
   */
  const idList = page.map(({ field }) => field.id).join(' ');
  const sortableIds = useMemo(() => (idList === '' ? [] : idList.split(' ')), [idList]);
  const column = useDroppable({ id: CANVAS_DROP, disabled: !editable || trying });
  const wheel = useRef({ dx: 0, at: 0 });
  /** The column is scrolled: the sticky phase header shows a rule, so items pass under an edge. */
  const [scrolled, setScrolled] = useState(false);

  function step(by: -1 | 1) {
    const to = PHASE_ORDER[at + by];
    if (to) onPhase(to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (dragging || e.defaultPrevented) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="tablist"]')) {
      return;
    }
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = e.timeStamp;
    const w = wheel.current;
    if (now - w.at > WHEEL_REST_MS) w.dx = 0;
    w.at = now;
    w.dx += e.deltaX;
    if (Math.abs(w.dx) < WHEEL_STEP) return;
    step(w.dx > 0 ? 1 : -1);
    w.dx = 0;
    w.at = now + WHEEL_REST_MS; // one swipe, one phase
  }

  return (
    <section
      aria-label="Form"
      className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface"
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-none items-center gap-2 border-b border-line-2 px-3.5 py-2.5">
        <h2 className="text-sm font-bold">Form</h2>
        <span className="text-xs text-muted">as the scouter's phone shows it</span>
        {/* The shared FilterChips: two toggle pills, one always on (DEVIATIONS 1.31). */}
        <div className="ms-auto">
          <FilterChips
            label="Canvas mode"
            options={[
              { key: 'edit' as const, label: 'Edit' },
              { key: 'try' as const, label: 'Try it' },
            ]}
            value={trying ? 'try' : 'edit'}
            onChange={(next) => onMode?.(next)}
          />
        </div>
      </div>
      <div className="relative flex-none">
        <Tabs
          label="Phases"
          tabs={PHASE_ORDER.map((p) => ({ key: p, label: PHASE_TAB[p], count: pages[p].length }))}
          value={phase}
          onChange={onPhase}
          flagged={flagged}
          flagLabel="incomplete"
        />
        {/* One drop target over each tab, so a field type dropped on a tab joins that phase. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 grid grid-cols-4 gap-1"
        >
          {PHASE_ORDER.map((p) => (
            <TabDrop key={p} phase={p} disabled={!editable || trying} />
          ))}
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-line-2"
        onWheel={onWheel}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
      >
        <div
          ref={column.setNodeRef}
          className={cn(
            'flex w-[410px] flex-none flex-col gap-2 pb-6',
            column.isOver &&
              'rounded-card outline-2 outline-offset-4 outline-accent outline-dashed',
          )}
        >
          {/* Opaque, with room under it and a rule once the column scrolls, so an item passing
              beneath never reads as touching the heading; items scrolled into view keep that
              room (scroll-mt). */}
          <div
            className={cn(
              'sticky top-0 z-[3] flex items-baseline gap-2.5 bg-line-2 pt-3 pb-2.5',
              scrolled && 'shadow-[0_1px_0_var(--line)]',
            )}
          >
            <h3 className="text-lg font-[750]">{PHASE_NAME[phase]}</h3>
            <span className="text-[0.78125rem] text-muted">
              Phase {at + 1} of {PHASE_ORDER.length}
            </span>
            <span aria-hidden="true" className="ms-auto flex items-center gap-1 self-center">
              {PHASE_ORDER.map((p) => (
                <i
                  key={p}
                  className={cn(
                    'block h-1.5 rounded-full',
                    p === phase ? 'w-5 bg-accent' : 'w-1.5 bg-faint',
                  )}
                />
              ))}
            </span>
          </div>
          {trying && tryIt ? (
            <LivePreviewColumn
              page={page.map(({ field }) => field)}
              values={tryIt.values}
              data={tryIt.data}
              onChange={tryIt.onChange}
            />
          ) : page.length === 0 ? (
            <p className="rounded-card border border-dashed border-control-border bg-surface px-4 py-6 text-center text-[0.84375rem] text-muted">
              {editable
                ? `No fields in ${PHASE_TAB[phase]} yet. Drag a field type here, or pick one under Fields.`
                : `No fields in ${PHASE_TAB[phase]}.`}
            </p>
          ) : (
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
              disabled={!editable}
            >
              <ul className="flex flex-col gap-2">
                {page.map(({ field }, i) => {
                  const before = page[i - 1]?.field;
                  const heading =
                    field.section && field.section !== before?.section ? field.section : null;
                  return (
                    <li key={field.id} className="flex flex-col gap-2">
                      {heading && (
                        <h4 className="px-0.5 pt-1.5 text-base font-[750]" dir="auto">
                          {heading}
                        </h4>
                      )}
                      <CanvasItem
                        field={field}
                        selected={state.selectedKey === field.key}
                        issues={state.issuesFor(field.key).map((x) => x.path)}
                        points={points.get(field.key) ?? null}
                        editable={editable}
                        onSelect={() => state.selectField(field.key)}
                      />
                    </li>
                  );
                })}
              </ul>
            </SortableContext>
          )}
        </div>
      </div>
      <div className="flex flex-none items-center justify-between border-t border-line bg-surface px-4 py-1 text-[0.78125rem] text-muted">
        <PagerButton phase={previous} onPhase={onPhase} back />
        <span>
          swipe sideways, or <Kbd>←</Kbd> <Kbd>→</Kbd>
        </span>
        <PagerButton phase={next} onPhase={onPhase} />
      </div>
    </section>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-[4px] border border-control-border px-1 font-num text-[0.71875rem] text-ink-2">
      {children}
    </kbd>
  );
}

function TabDrop({ phase, disabled }: { phase: FieldPhase; disabled: boolean }) {
  const drop = useDroppable({ id: tabDropId(phase), disabled });
  return (
    <span
      ref={drop.setNodeRef}
      className={cn('rounded-control', drop.isOver && 'outline-2 outline-accent outline-dashed')}
    />
  );
}

function PagerButton({
  phase,
  onPhase,
  back = false,
}: {
  phase: FieldPhase | undefined;
  onPhase: (phase: FieldPhase) => void;
  back?: boolean;
}) {
  if (!phase) return <span className="min-w-12" />;
  return (
    <button
      type="button"
      onClick={() => onPhase(phase)}
      aria-label={`${back ? 'Previous' : 'Next'} phase: ${PHASE_TAB[phase]}`}
      className="hover-veil flex min-h-10 min-w-12 items-center gap-2 rounded-control px-2"
    >
      {back && <span aria-hidden="true">‹</span>}
      <b className="font-[650] text-ink-2">{PHASE_TAB[phase]}</b>
      {!back && <span aria-hidden="true">›</span>}
    </button>
  );
}

/**
 * THEME "Live canvas item": a white card drawing the real entry control, a grip outside its left
 * edge (the explicit drag handle), the key in mono and a points tag at its top right. Selected:
 * a 2 px `--accent` ring and a 3 px `--accent-tint` halo. Incomplete: a 4 px `--warn` left edge
 * and "⚠ Needs meaning", with sr-only "incomplete" — never a red dot (red is the red alliance).
 * The control is inert here: in Edit, a click picks the field.
 */
function CanvasItem({
  field,
  selected,
  issues,
  points,
  editable,
  onSelect,
}: {
  field: FormFieldDefinition;
  selected: boolean;
  issues: string[];
  points: string | null;
  editable: boolean;
  onSelect: () => void;
}) {
  // Reduced motion: fields jump to their places rather than slide (SPEC-FINAL 17.9).
  const sortable = useSortable({
    id: field.id,
    disabled: !editable,
    transition: prefersReducedMotion() ? null : undefined,
  });
  const incomplete = issues.length > 0;
  const needsMeaning = issues.some((p) => MEANING_PATHS.has(p));
  const t = sortable.transform;
  const lifted = sortable.isDragging;
  return (
    <div
      ref={sortable.setNodeRef}
      data-field-key={field.key}
      data-dragging={lifted || undefined}
      style={{
        transform: t ? `translate3d(${t.x}px, ${t.y}px, 0)` : undefined,
        // The lifted item follows the pointer exactly; the others slide out of its way and it
        // settles into its place on the drop (UF.20). Reduced motion: no slide, they jump.
        transition: lifted ? undefined : (sortable.transition ?? undefined),
      }}
      className={cn(
        'relative scroll-mt-[4.5rem] scroll-mb-4 rounded-[10px] border border-line bg-surface px-3.5 pt-2 pb-1.5',
        selected &&
          'border-accent shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-tint)]',
        incomplete && 'border-s-4 border-s-warn ps-[11px]',
        // Lifted, as Manage's event cards are: solid, above the others, with the float shadow
        // (the selected ring kept with it). Not scaled: a scaled card measures taller, and the
        // others would move by the wrong distance.
        lifted &&
          (selected
            ? 'z-10 shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_var(--accent-tint),var(--shadow-float)]'
            : 'z-10 shadow-[var(--shadow-float)]'),
      )}
    >
      {editable && (
        <SortableGrip
          sortable={sortable}
          label={`Move ${field.label}`}
          className="absolute top-1/2 -start-8 z-[2] size-7 -translate-y-1/2 hover:bg-surface"
          iconClassName="size-[18px]"
        />
      )}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${field.label}, ${typeName(field.type)}`}
        onClick={onSelect}
        className="absolute inset-0 z-[1] rounded-[10px]"
      />
      <div className="mb-1 flex items-center justify-end gap-1.5">
        {incomplete && (
          <WarningFlag icon={TriangleAlert}>
            {needsMeaning ? 'Needs meaning' : 'Needs a fix'}
            <span className="sr-only"> incomplete</span>
          </WarningFlag>
        )}
        {points && (
          <span className="rounded-tag bg-line-2 px-1.5 py-0.5 font-num text-[0.71875rem] font-semibold whitespace-nowrap text-ink-2">
            {points}
          </span>
        )}
        <code className="font-num text-[0.71875rem] text-muted">{field.key}</code>
      </div>
      <div inert className="pointer-events-none">
        <FieldPreview field={field} />
      </div>
    </div>
  );
}

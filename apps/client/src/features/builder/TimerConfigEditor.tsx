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
import { Clock, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  formatClock,
  matchEndSeconds,
  timerConfigSchema,
  TIMER_PHASE_SECONDS_MAX,
  TIMER_PHASES_MAX,
  type FieldPhase,
  type TimerConfig,
} from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ErrorLine, Note } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { PHASE_ORDER } from '@/features/entry/phases';
import { prefersReducedMotion } from '@/lib/animate';
import { cn } from '@/lib/utils';
import { formErrorLine } from './formErrors';

/**
 * The timer's word for each phase (design `-timer.png`). `post_match` is "After match" here:
 * a phase of the clock, where the entry's tab for the same fields is "Notes" (DEVIATIONS 1.32).
 */
export const TIMER_PHASE_NAME: Record<FieldPhase, string> = {
  auto: 'Auto',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'After match',
};

/** The bar's and the swatch's tone per phase (design `states.css` `.fs-p1`–`.fs-p4`). */
const PHASE_TONE: Record<FieldPhase, string> = {
  auto: 'bg-line-2',
  teleop: 'bg-accent-tint',
  endgame: 'bg-accent/15',
  post_match: 'bg-bg',
};

/** "Start from Auto 0:15 · Teleop 2:15 · Endgame 0:30" (SPEC-FINAL 8.4's example). */
export const STANDARD_TIMER: TimerConfig = {
  phases: [
    { phase: 'auto', seconds: 15 },
    { phase: 'teleop', seconds: 135 },
    { phase: 'endgame', seconds: 30 },
  ],
};

/** A phase added with Add a phase starts at its standard length. */
const START_SECONDS: Record<FieldPhase, number> = {
  auto: 15,
  teleop: 135,
  endgame: 30,
  post_match: 30,
};

/** One row as it is being edited: the length is the text typed, checked by the shared schema. */
type Row = { id: string; phase: FieldPhase; seconds: string };

const lengthOf = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.trim()));

/** The rows as a timer, for the shared schema to judge. */
function configOf(rows: readonly Row[]): TimerConfig {
  return { phases: rows.map((r) => ({ phase: r.phase, seconds: lengthOf(r.seconds) })) };
}

type Problem = { row: number | null; part: 'phase' | 'seconds' | null; line: string };

/**
 * The first problem the shared schema finds, as one sentence, and the control it is about.
 * The schema is `updateForm`'s own, so what passes here is what the server accepts.
 */
export function timerProblem(rows: readonly Row[]): Problem | null {
  const parsed = timerConfigSchema.safeParse(configOf(rows));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0]!;
  const [, at, part] = issue.path;
  if (typeof at !== 'number') {
    return rows.length > TIMER_PHASES_MAX
      ? { row: null, part: null, line: `A timer has at most ${TIMER_PHASES_MAX} phases.` }
      : { row: null, part: null, line: issue.message };
  }
  const name = TIMER_PHASE_NAME[rows[at]!.phase];
  if (part === 'phase') {
    return {
      row: at,
      part: 'phase',
      line: `${name} is in the list twice. Each phase runs once: change or remove one of them.`,
    };
  }
  return {
    row: at,
    part: 'seconds',
    line: `${name}: the length is a whole number of seconds, from 1 to ${TIMER_PHASE_SECONDS_MAX}.`,
  };
}

/**
 * The Match timer dialog (design 12 `-timer.png`, `-timer-empty.png`; SPEC-FINAL 8.4): one row
 * per phase — a grip, the phase, its length in seconds with m:ss beside it, delete — then Add a
 * phase, a proportional bar and "Match ends at 180 s (3:00)". With no phases: the dashed
 * "no match timer" line, Add a phase and Start from the standard three. Checked live with the
 * shared schema; Save is an in-place `updateForm` (the page sends it), never a new version.
 */
export function TimerConfigEditor({
  config,
  online,
  readOnly = null,
  onSave,
  onClose,
}: {
  config: TimerConfig;
  online: boolean;
  /** Why the timer cannot be changed here (an older version): shown, and nothing is editable. */
  readOnly?: string | null;
  /** Sends the timer; throws a form refusal, which the dialog says in one sentence. */
  onSave: (config: TimerConfig) => Promise<void>;
  onClose: () => void;
}) {
  const next = useRef(config.phases.length);
  const [rows, setRows] = useState<Row[]>(() =>
    config.phases.map((p, i) => ({ id: `p${i}`, phase: p.phase, seconds: String(p.seconds) })),
  );
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcer, setAnnouncer] = useState<HTMLDivElement | null>(null);
  const describe = useId();
  const problemId = useId();

  const problem = useMemo(() => timerProblem(rows), [rows]);
  const candidate = configOf(rows);
  const total = problem ? null : matchEndSeconds(candidate);
  const changed = JSON.stringify(candidate) !== JSON.stringify(config);
  const used = new Set(rows.map((r) => r.phase));
  const unused = PHASE_ORDER.filter((p) => !used.has(p));
  const editable = readOnly === null;
  const canAdd = editable && rows.length < TIMER_PHASES_MAX && unused.length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const edit = (change: (rows: Row[]) => Row[]) => {
    setRows(change);
    setError(null);
  };
  const add = (phase: FieldPhase) =>
    edit((was) => [
      ...was,
      { id: `p${next.current++}`, phase, seconds: String(START_SECONDS[phase]) },
    ]);
  const setRow = (id: string, patch: Partial<Row>) =>
    edit((was) => was.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    if (!over || active.id === over.id) return;
    edit((was) => {
      const from = was.findIndex((r) => r.id === active.id);
      const to = was.findIndex((r) => r.id === over.id);
      return from === -1 || to === -1 ? was : arrayMove(was, from, to);
    });
  }

  /** What a screen reader hears during a drag: the phase and its place, never an id. */
  const placeOf = (id: string | number) => rows.findIndex((r) => r.id === id);
  const nameOf = (id: string | number) => {
    const row = rows[placeOf(id)];
    return row ? TIMER_PHASE_NAME[row.phase] : 'A phase';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, phase ${placeOf(active.id) + 1}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is at phase ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} is over nothing.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now phase ${placeOf(over.id) + 1}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} was put back.`,
  };

  async function save() {
    const parsed = timerConfigSchema.safeParse(candidate);
    if (!parsed.success) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed.data);
      onClose();
    } catch (e) {
      setError(formErrorLine(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="Match timer"
      onClose={onClose}
      width={660}
      describedBy={describe}
      dismissible={!busy && !dragging}
      footer={
        editable ? (
          <>
            {rows.length > 0 && (
              <Button variant="ghost" className="me-auto" onClick={() => edit(() => [])}>
                Remove the timer
              </Button>
            )}
            {!online && (
              <span className="self-center text-[0.8125rem] text-muted">
                You're offline: Save waits for the connection.
              </span>
            )}
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={problem !== null || !changed || !online}
              busy={busy}
              busyLabel="Saving…"
              onClick={() => void save()}
            >
              Save
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <p id={describe} className="-mt-2 text-[0.84375rem] leading-snug text-muted">
        The phases run in this order. The timer pinned at the top of the scouter's screen counts
        them down, and event-log taps are timed from{' '}
        <b className="font-bold text-ink">Start match</b>.
      </p>
      {readOnly && <Note icon="info">{readOnly}</Note>}
      {rows.length === 0 ? (
        <div className="rounded-control border border-dashed border-control-border bg-bg p-[1.125rem] text-center text-[0.84375rem] text-muted">
          <b className="mb-1 block text-[0.9375rem] font-bold text-ink">
            This form has no match timer.
          </b>
          The sticky timer is not shown, and each event log times its taps from its own first tap.
        </div>
      ) : (
        <div className="rounded-control border border-line">
          <div
            aria-hidden="true"
            className="grid grid-cols-[20px_24px_minmax(0,1fr)_150px_36px] items-center gap-2.5 border-b border-line-2 px-2.5 py-2 text-[0.71875rem] font-bold text-muted"
          >
            <span />
            <span>#</span>
            <span>Phase</span>
            <span>Length</span>
            <span />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setDragging(true)}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(false)}
            accessibility={{ announcements, container: announcer ?? undefined }}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ol aria-label="Phases">
                {rows.map((row, i) => (
                  <PhaseRow
                    key={row.id}
                    row={row}
                    index={i}
                    editable={editable}
                    problem={problem?.row === i ? problem.part : null}
                    problemId={problemId}
                    onPhase={(phase) => setRow(row.id, { phase })}
                    onSeconds={(seconds) => setRow(row.id, { seconds })}
                    onRemove={() => edit((was) => was.filter((r) => r.id !== row.id))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </div>
      )}
      <div ref={setAnnouncer} />
      {editable &&
        (rows.length === 0 ? (
          <div className="flex gap-2">
            <AddButton className="flex-1" disabled={!canAdd} onClick={() => add(unused[0]!)}>
              <Plus aria-hidden="true" />
              Add a phase
            </AddButton>
            <AddButton
              className="flex-[1.4]"
              onClick={() =>
                edit(() =>
                  STANDARD_TIMER.phases.map((p) => ({
                    id: `p${next.current++}`,
                    phase: p.phase,
                    seconds: String(p.seconds),
                  })),
                )
              }
            >
              <Clock aria-hidden="true" />
              Start from Auto 0:15 · Teleop 2:15 · Endgame 0:30
            </AddButton>
          </div>
        ) : (
          <AddButton disabled={!canAdd} onClick={() => add(unused[0]!)}>
            <Plus aria-hidden="true" />
            Add a phase
          </AddButton>
        ))}
      {problem && (
        <ErrorLine id={problemId}>
          {problem.line} <span className="font-normal">Nothing is saved until it is fixed.</span>
        </ErrorLine>
      )}
      {total !== null && (
        <>
          <PhaseBar config={candidate} total={total} />
          <p className="flex items-baseline gap-2 text-[0.84375rem] text-ink-2">
            Match ends at <b className="font-num text-[1.125rem] font-bold text-ink">{total} s</b>{' '}
            <span>({formatClock(total)})</span>
          </p>
        </>
      )}
      <Note icon="info">
        <b className="font-bold text-ink">Changing these is an in-place edit.</b> It never creates a
        new form version
        {rows.length > 0 ? ', and entries already scouted keep their times.' : '.'}
      </Note>
      {error && <ErrorLine>{error}</ErrorLine>}
    </Dialog>
  );
}

/** The dashed 40 px "add" button of the design (`.fs-add`). */
function AddButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'min-h-10 border-dashed text-[0.84375rem] font-[650] text-accent-ink [&_svg]:size-[15px]',
        className,
      )}
      {...props}
    />
  );
}

function PhaseRow({
  row,
  index,
  editable,
  problem,
  problemId,
  onPhase,
  onSeconds,
  onRemove,
}: {
  row: Row;
  index: number;
  editable: boolean;
  problem: 'phase' | 'seconds' | null;
  problemId: string;
  onPhase: (phase: FieldPhase) => void;
  onSeconds: (seconds: string) => void;
  onRemove: () => void;
}) {
  // Reduced motion: rows jump to their places rather than slide (SPEC-FINAL 17.9).
  const sortable = useSortable({
    id: row.id,
    disabled: !editable,
    transition: prefersReducedMotion() ? null : undefined,
  });
  const t = sortable.transform;
  const name = TIMER_PHASE_NAME[row.phase];
  const seconds = lengthOf(row.seconds);
  const whole = Number.isInteger(seconds) && seconds > 0;
  return (
    <li
      ref={sortable.setNodeRef}
      data-phase-row={index}
      style={{
        transform: t ? `translate3d(0, ${t.y}px, 0)` : undefined,
        transition: sortable.transition ?? undefined,
      }}
      className={cn(
        'relative grid grid-cols-[20px_24px_minmax(0,1fr)_150px_36px] items-center gap-2.5 border-b border-line-2 px-2.5 py-2 last:border-b-0',
        // Only a row being dragged is filled: at rest the box's rounded corners show through.
        sortable.isDragging && 'z-10 bg-surface shadow-[var(--shadow-float)]',
      )}
    >
      {editable ? (
        <button
          type="button"
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Move ${name}`}
          className="-ms-1 grid size-7 cursor-grab place-items-center rounded-control text-muted hover:bg-line-2"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span />
      )}
      <span aria-hidden="true" className="font-num text-[0.8125rem] text-muted">
        {index + 1}
      </span>
      <div className="relative">
        <i
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute start-3 top-1/2 z-[1] size-2.5 -translate-y-1/2 rounded-[3px] border border-line',
            PHASE_TONE[row.phase],
          )}
        />
        <Select
          aria-label={`Phase ${index + 1}`}
          value={row.phase}
          disabled={!editable}
          onChange={(e) => onPhase(e.target.value as FieldPhase)}
          aria-invalid={problem === 'phase' || undefined}
          aria-describedby={problem === 'phase' ? problemId : undefined}
          className="min-h-10 ps-8 text-[0.875rem]"
        >
          {PHASE_ORDER.map((p) => (
            <option key={p} value={p}>
              {TIMER_PHASE_NAME[p]}
            </option>
          ))}
        </Select>
      </div>
      <div className="relative">
        <Input
          mono
          inputMode="numeric"
          aria-label={`${name} length in seconds`}
          value={row.seconds}
          disabled={!editable}
          onChange={(e) => onSeconds(e.target.value)}
          aria-invalid={problem === 'seconds' || undefined}
          aria-describedby={problem === 'seconds' ? problemId : undefined}
          className="min-h-10 pe-[4.75rem] text-[0.9375rem]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[0.78125rem] text-muted"
        >
          s{whole ? ` · ${formatClock(seconds)}` : ''}
        </span>
      </div>
      {editable ? (
        <Button size="icon-sm" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Trash2 aria-hidden="true" className="!size-4" />
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
}

/**
 * The phases to scale, in order (design `.fs-bar`): each as wide as its share of the match,
 * named with its m:ss — a narrow one by its first letter only. Drawn for the eye; its label
 * reads the same out loud. Widths ease only under motion-safe.
 */
function PhaseBar({ config, total }: { config: TimerConfig; total: number }) {
  const spoken = config.phases
    .map((p) => `${TIMER_PHASE_NAME[p.phase]} ${formatClock(p.seconds)}`)
    .join(', then ');
  return (
    <div
      role="img"
      aria-label={`The match: ${spoken}`}
      className="flex h-[30px] overflow-hidden rounded-control border border-line"
    >
      {config.phases.map((p) => {
        const share = p.seconds / total;
        const name = TIMER_PHASE_NAME[p.phase];
        return (
          <span
            key={p.phase}
            style={{ width: `${share * 100}%` }}
            className={cn(
              'flex min-w-0 items-center justify-center overflow-hidden border-e-2 border-surface text-xs font-bold whitespace-nowrap text-ink last:border-e-0 motion-safe:transition-[width]',
              PHASE_TONE[p.phase],
            )}
          >
            {share < 0.12 ? (
              name[0]
            ) : (
              <>
                {name}
                <code className="ms-[5px] font-num font-medium text-ink-2">
                  {formatClock(p.seconds)}
                </code>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

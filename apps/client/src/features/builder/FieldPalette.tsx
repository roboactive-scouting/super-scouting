import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { PointerEventHandler } from 'react';
import type { FieldTypeName } from '@frc/shared';
import { cn } from '@/lib/utils';
import { FIELD_TYPE_INFO, typeInfo } from './fieldTypes';

/** A palette row's drag id: `palette:<type>`. */
export const paletteDragId = (type: FieldTypeName) => `palette:${type}`;
export const paletteTypeOf = (id: string | number): FieldTypeName | null =>
  typeof id === 'string' && id.startsWith('palette:') ? (id.slice(8) as FieldTypeName) : null;

/**
 * The Fields palette (THEME "Field palette row"): one row per field type — a 26 px `--line-2`
 * icon square, the name, a one-line description, a `--faint` grip. Drag a row onto the form or
 * onto a phase tab; a click, Enter or Space adds it to the phase on screen (the keyboard path).
 */
export function FieldPalette({
  editable,
  held = null,
  onAdd,
}: {
  editable: boolean;
  /** Why the palette is held while the version is otherwise editable, in its head. */
  held?: string | null;
  onAdd: (type: FieldTypeName) => void;
}) {
  return (
    <section
      aria-label="Fields"
      className="flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface"
    >
      <div className="flex flex-none items-center gap-2 border-b border-line-2 px-3.5 py-2.5">
        <h2 className="text-sm font-bold">Fields</h2>
        {held ? (
          <span className="truncate text-xs font-[650] text-warn">{held}</span>
        ) : (
          <span className="text-xs text-muted">drag onto the form</span>
        )}
      </div>
      {/* Held, every row is disabled: the list itself takes focus so it still scrolls by keys. */}
      <ul
        tabIndex={editable ? undefined : 0}
        aria-label={editable ? undefined : 'Field types'}
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1.5"
      >
        {FIELD_TYPE_INFO.map(({ type }) => (
          <li key={type}>
            <PaletteRow type={type} editable={editable} onAdd={onAdd} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaletteRow({
  type,
  editable,
  onAdd,
}: {
  type: FieldTypeName;
  editable: boolean;
  onAdd: (type: FieldTypeName) => void;
}) {
  const { name, description, icon: Icon } = typeInfo(type);
  const drag = useDraggable({ id: paletteDragId(type), disabled: !editable });
  // Only the pointer starts a drag here: Enter and Space stay the button's own, and add.
  const onPointerDown = drag.listeners?.onPointerDown as PointerEventHandler | undefined;
  return (
    <button
      ref={drag.setNodeRef}
      type="button"
      disabled={!editable}
      onPointerDown={onPointerDown}
      onClick={() => onAdd(type)}
      aria-label={`Add ${name}: ${description}`}
      className={cn(
        'hover-veil flex min-h-12 w-full cursor-grab items-center gap-2.5 rounded-control px-2 py-1.5 text-start disabled:cursor-default disabled:opacity-45',
        drag.isDragging && 'opacity-40',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-[26px] shrink-0 place-items-center rounded-md bg-line-2 text-ink-2"
      >
        <Icon className="size-3.5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[0.84375rem] font-[650]">{name}</b>
        <small className="block truncate text-xs text-muted">{description}</small>
      </span>
      <GripVertical aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
    </button>
  );
}

/** What follows the pointer while a palette row is dragged: the row, lifted. */
export function PaletteGhost({ type }: { type: FieldTypeName }) {
  const { name, description, icon: Icon } = typeInfo(type);
  return (
    <div className="flex w-[220px] items-center gap-2.5 rounded-control bg-surface px-2 py-1.5 shadow-[0_0_0_2px_var(--accent),var(--shadow-float)]">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-md bg-line-2 text-ink-2">
        <Icon className="size-3.5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[0.84375rem] font-[650]">{name}</b>
        <small className="block truncate text-xs text-muted">{description}</small>
      </span>
    </div>
  );
}

import { useRef, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The card's ×/+ : 30 px drawn, the 48 px target grown by its ::after. */
const ACTION =
  'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] relative grid size-[30px] min-h-0 min-w-0 shrink-0 place-items-center rounded-[6px] after:absolute after:-inset-[9px] after:content-[""] disabled:opacity-45 [&_svg]:size-3.5';

/**
 * One team as a card (07-manage final, Teams & roster): number in mono and name. On the
 * roster (`onRename` given) the name is a button that turns into a field in place — Enter
 * or leaving the field saves, Escape keeps the old name — and × takes the team off. In
 * the registry (`dashed`) + puts it on.
 */
export function TeamCard({
  number,
  name,
  dashed = false,
  busy,
  hintId,
  onAction,
  onRename,
}: {
  number: number;
  name: string;
  dashed?: boolean;
  busy: boolean;
  /** The section's "click a name to rename" line, read with the name. */
  hintId?: string;
  onAction: () => void;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  /** Enter/Escape and then the blur they cause must finish an edit only once. */
  const done = useRef(false);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (save && draft.trim() && draft !== name) onRename?.(draft);
    else setDraft(name);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  }

  return (
    <li
      className={cn(
        'flex h-12 min-w-0 items-center gap-2 rounded-control border pe-1.5 ps-3',
        dashed ? 'border-dashed border-control-border bg-bg' : 'border-line bg-surface',
      )}
    >
      <b className="num text-[0.90625rem] font-semibold">{number}</b>
      {editing ? (
        <input
          aria-label="Team name"
          value={draft}
          dir="auto"
          autoFocus
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => finish(true)}
          className="own-focus h-9 min-w-0 flex-1 rounded-[6px] border border-accent bg-surface px-2 text-[0.84375rem] text-ink shadow-[inset_0_0_0_1px_var(--accent)]"
        />
      ) : onRename ? (
        <button
          type="button"
          dir="auto"
          aria-describedby={hintId}
          disabled={busy}
          onClick={() => {
            setDraft(name);
            done.current = false;
            setEditing(true);
          }}
          className="min-h-12 min-w-0 flex-1 truncate text-start text-[0.84375rem] text-ink-2 hover:underline"
        >
          {name}
        </button>
      ) : (
        <span dir="auto" className="min-w-0 flex-1 truncate text-[0.84375rem] text-ink-2">
          {name}
        </span>
      )}
      <button
        type="button"
        aria-label={
          dashed
            ? `Add ${number} ${name} to the roster`
            : `Remove ${number} ${name} from the roster`
        }
        title={dashed ? 'Add to the roster' : 'Take off the roster'}
        disabled={busy}
        onClick={onAction}
        className={cn(ACTION, dashed ? 'text-accent-ink' : 'text-muted')}
      >
        {dashed ? <Plus aria-hidden="true" /> : <X aria-hidden="true" />}
      </button>
    </li>
  );
}

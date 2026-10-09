import { ChevronDown, Lock, RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { VersionSummary } from '@frc/shared';
import { versionTagClass } from '@/components/ui/version-tag';
import { cn } from '@/lib/utils';

/** "Draft v4 · not published", "v3 · Published · Locked". */
export function versionLabel(v: VersionSummary): string {
  if (v.status === 'draft') return `Draft v${v.version_no} · not published`;
  return `v${v.version_no} · Published${v.is_locked ? ' · Locked' : ''}`;
}

const ROW =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-[0.84375rem] font-semibold text-ink hover:bg-accent-tint hover:text-accent-ink focus-visible:bg-accent-tint focus-visible:text-accent-ink';

/**
 * The version chip (THEME "Builder top bar": a 24 px tag, draft `--line-2`, published
 * `--accent-tint` with a lock) with its chevron: it opens the version list. A version opens in
 * the builder; an older published one can be restored from here (`restoreFormVersion`). The
 * menu is the Account menu's surface; Escape, a click outside and a choice close it.
 */
export function VersionMenu({
  current,
  versions,
  canRestore,
  restoreHeld = null,
  onOpen,
  onRestore,
}: {
  current: VersionSummary;
  versions: readonly VersionSummary[];
  canRestore: boolean;
  /** Why Restore waits (unsaved changes a restore would drop), shown in the menu. */
  restoreHeld?: string | null;
  onOpen: (versionNo: number) => void;
  onRestore: (version: VersionSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const heldId = useId();
  const published = current.status === 'published';
  const hasRestorable = versions.some((v) => v.status === 'published' && !v.is_active);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) chip.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={chip}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${versionLabel(current)}. Versions`}
        onClick={() => setOpen((was) => !was)}
        className={cn(versionTagClass(published ? 'published' : 'draft'), 'hover-veil')}
      >
        {published && current.is_locked && <Lock aria-hidden="true" className="size-[13px]" />}
        {versionLabel(current)}
        <ChevronDown aria-hidden="true" className="size-[13px]" />
      </button>
      {open && (
        <div className="absolute start-0 top-full z-40 mt-2 w-[300px] rounded-[10px] bg-surface p-1.5 shadow-[var(--shadow-float)]">
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label="Versions"
            onKeyDown={onKeyDown}
            className="flex flex-col"
          >
            {versions.map((v) => {
              const here = v.id === current.id;
              const title =
                v.status === 'draft'
                  ? `Draft v${v.version_no}`
                  : v.is_active
                    ? `v${v.version_no} · active`
                    : `v${v.version_no}`;
              const restorable = v.status === 'published' && !v.is_active;
              return (
                <div key={v.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={here ? 'true' : undefined}
                    className={cn(ROW, 'flex-1', here && 'bg-line-2')}
                    onClick={() => {
                      close(false);
                      if (!here) onOpen(v.version_no);
                    }}
                  >
                    {title}
                    <span className="ms-auto text-xs font-medium text-muted">
                      {here
                        ? 'open now'
                        : v.status === 'draft'
                          ? 'not published'
                          : `${v.entry_count} entries`}
                    </span>
                  </button>
                  {restorable && (
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={`Restore v${v.version_no}`}
                      aria-describedby={restoreHeld ? heldId : undefined}
                      disabled={!canRestore || restoreHeld !== null}
                      className={cn(ROW, 'w-auto gap-1.5 disabled:opacity-45')}
                      onClick={() => {
                        close(false);
                        onRestore(v);
                      }}
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5 text-muted" />
                      Restore
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {restoreHeld && hasRestorable && (
            <p id={heldId} className="px-3 pt-1 pb-1.5 text-xs font-[650] text-warn">
              {restoreHeld}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

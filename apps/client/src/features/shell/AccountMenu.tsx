import { ArrowRightLeft, Lock, LogOut } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Initials } from '@/components/ui/initials';
import { roleLabel } from '@/components/ui/tag';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import type { Account } from './account';

const ITEM =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-start text-[0.9375rem] font-medium text-ink hover:bg-accent-tint hover:text-accent-ink focus-visible:bg-accent-tint focus-visible:text-accent-ink';
const ICON = 'size-4 shrink-0';

/**
 * The sidebar's account corner (THEME "Account menu"): initials, name and role, opening a
 * white menu above it — Switch scouter · Change password · a divider · Sign out. Escape, a
 * click outside and a choice close it; Escape gives focus back to the corner.
 */
export function AccountMenu({ account, collapsed }: { account: Account; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const corner = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

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
    if (refocus) corner.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  return (
    <div ref={root} className="relative">
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Account"
          onKeyDown={onKeyDown}
          className="off-rail absolute start-0 end-0 bottom-full z-40 mb-3 flex min-w-[12.75rem] flex-col rounded-[10px] bg-surface p-1.5 shadow-[var(--shadow-float)]"
        >
          {account.canSwitch && (
            <Link
              role="menuitem"
              to={PATHS.switchScouter}
              className={ITEM}
              onClick={() => close(false)}
            >
              <ArrowRightLeft aria-hidden="true" className={ICON} />
              Switch scouter
            </Link>
          )}
          {account.canChangePassword && (
            <Link
              role="menuitem"
              to={PATHS.changePassword}
              className={ITEM}
              onClick={() => close(false)}
            >
              <Lock aria-hidden="true" className={ICON} />
              Change password
            </Link>
          )}
          {(account.canSwitch || account.canChangePassword) && (
            <div role="separator" className="mx-1 my-1 h-px bg-line" />
          )}
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              close(false);
              account.onSignOut();
            }}
          >
            <LogOut aria-hidden="true" className={cn(ICON, '-scale-x-100')} />
            Sign out
          </button>
        </div>
      )}
      <button
        ref={corner}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={collapsed ? account.name : undefined}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          'motion-safe:transition group flex min-h-12 w-full items-center gap-2.5 rounded-lg p-2 text-start hover:bg-rail-raised',
          open && 'bg-rail-raised',
          collapsed && 'justify-center px-0',
        )}
      >
        <Initials name={account.name} tone="dark" />
        <span className={cn('min-w-0 leading-tight', collapsed && 'sr-only')}>
          <span dir="auto" className="block truncate text-[0.8125rem] font-semibold text-surface">
            {account.name}
          </span>
          {/* --rail-muted reads 4.0:1 on --rail-raised: the open or hovered corner lifts it. */}
          <span
            className={cn(
              'block truncate text-xs text-rail-muted group-hover:text-rail-ink',
              open && 'text-rail-ink',
            )}
          >
            {roleLabel(account.role)}
          </span>
        </span>
      </button>
    </div>
  );
}

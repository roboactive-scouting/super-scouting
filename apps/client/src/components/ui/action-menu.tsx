import type { LucideIcon } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** One row of an action menu: an icon, a bold title and a line saying what it does. */
export type ActionItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Why the action waits: the row is disabled and says this instead of its detail. */
  held?: string | null;
  /** A rule above the row (the More menu's divider before Delete form). */
  separated?: boolean;
  onSelect: () => void;
};

/**
 * A button that opens a short menu of actions (design 12, the top bar's "More ▾"; design 13, the
 * form card's ⋯): the Account menu's surface, a row per action with its line. Arrows move,
 * Escape closes and returns focus, Tab and a click outside close it. A held row stays in the
 * list, disabled, with its reason, so the admin learns why rather than finding it missing.
 */
export function ActionMenu({
  label,
  items,
  children,
  disabled = false,
  align = 'end',
  className,
  size,
  variant,
}: {
  /** The menu's accessible name, and the button's when it shows only an icon. */
  label: string;
  items: readonly ActionItem[];
  /** The button's face. */
  children: ReactNode;
  disabled?: boolean;
  align?: 'start' | 'end';
  className?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  const [wanted, setOpen] = useState(false);
  // Held by the page (offline, busy) while open: it closes.
  const open = wanted && !disabled;
  useEffect(() => {
    // …and stays closed when the hold ends.
    if (disabled) setOpen(false);
  }, [disabled]);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const rows = () =>
    [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
      (row) => row.getAttribute('aria-disabled') !== 'true',
    );

  useEffect(() => {
    if (!open) return;
    rows()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const list = rows();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div ref={root} className="relative">
      <Button
        ref={button}
        size={size}
        variant={variant}
        className={className}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={typeof children === 'string' ? undefined : label}
        onClick={() => setOpen((was) => !was)}
      >
        {children}
      </Button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            'absolute top-full z-40 mt-2 flex w-[300px] flex-col rounded-[10px] border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const held = Boolean(item.held);
            return (
              <Fragment key={item.key}>
                {item.separated && <div role="separator" className="my-1 border-t border-line" />}
                <button
                  type="button"
                  role="menuitem"
                  aria-disabled={held || undefined}
                  onClick={() => {
                    if (held) return;
                    close(false);
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start',
                    held
                      ? 'cursor-not-allowed'
                      : 'hover:bg-accent-tint focus-visible:bg-accent-tint',
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn('mt-0.5 size-4 shrink-0 text-ink-2', held && 'opacity-45')}
                  />
                  <span className="min-w-0">
                    <b className={cn('block text-[0.84375rem] font-[650]', held && 'text-muted')}>
                      {item.title}
                    </b>
                    <small
                      className={cn(
                        'block text-xs leading-snug',
                        held ? 'font-[650] text-warn' : 'text-muted',
                      )}
                    >
                      {item.held ?? item.detail}
                    </small>
                  </span>
                </button>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

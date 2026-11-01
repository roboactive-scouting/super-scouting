import { Check, TriangleAlert } from 'lucide-react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export type TabItem<K extends string> = {
  key: K;
  label: string;
  /** A number after the label (e.g. entries waiting), in mono. */
  count?: number;
};

/**
 * A row of equal-width tabs in a white bar (THEME "Tabs": 48 px tall, the §17.7 touch floor over THEME's 44; the current tab is
 * accent-tint with a 3 px accent underline; done tabs show a ✓ in accent). The WAI-ARIA tabs
 * pattern with MANUAL activation: arrows and Home / End move focus, Enter or Space chooses,
 * only the chosen tab is in the Tab order. Manual, because choosing a tab unmounts the
 * panel, and an arrow must never drop a half-filled form. Presentation only: the page keeps
 * the chosen key and renders the panel.
 */
export function Tabs<K extends string>({
  label,
  tabs,
  value,
  onChange,
  done,
  flagged,
  flagLabel = 'needs attention',
  dotted,
  flush = false,
  fit = false,
  tight = false,
}: {
  label: string;
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Keys of the tabs that are finished: each shows a ✓. */
  done?: ReadonlySet<K>;
  /**
   * Keys of the tabs holding something to fix: each shows a `--warn` ⚠ after its count, and
   * `flagLabel` (sr-only) says what (the form builder's phase holding an incomplete field).
   */
  flagged?: ReadonlySet<K>;
  flagLabel?: string;
  /**
   * Keys of the tabs that need attention, shown as THEME "Tabs in a card (with counts)" draws
   * it: a 7 px `--warn` dot before the label (Sync's Problems), with `flagLabel` (sr-only).
   */
  dotted?: ReadonlySet<K>;
  /**
   * Manage's page tabs (07-manage final): flush, full-height tabs with no inset, the inactive
   * labels in `--ink-2` 650 and the counts in muted mono; the underline spans the tab.
   */
  flush?: boolean;
  /**
   * The team page's computer tabs (24-team final): each tab as wide as its words (22 px a side),
   * set from the start, instead of sharing the bar's width.
   */
  fit?: boolean;
  /**
   * The team page's phone tabs (24-team final): four flush tabs at 375 px, so the label and its
   * count sit 5 px apart with a 4 px inset, and "Matches 10" fits a quarter of the bar.
   */
  tight?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const doneId = useId();

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.tab;
    const index = tabs.findIndex((t) => t.key === (focused ?? value));
    const next =
      e.key === 'ArrowRight'
        ? index + 1
        : e.key === 'ArrowLeft'
          ? index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    if (!target) return;
    list.current?.querySelector<HTMLElement>(`[data-tab="${target.key}"]`)?.focus();
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'grid grid-flow-col bg-surface',
        fit ? 'auto-cols-max justify-start' : 'auto-cols-fr',
        !flush && 'gap-1 border-b border-line p-1.5',
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const finished = done?.has(tab.key) ?? false;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab={tab.key}
            aria-selected={selected}
            aria-describedby={finished ? `${doneId}-${tab.key}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={cn(
              'hover-veil motion-safe:transition relative flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-control px-2 text-sm font-semibold',
              selected ? 'bg-accent-tint text-accent-ink' : finished ? 'text-ink-2' : 'text-muted',
              flush && 'gap-2 rounded-none font-[650]',
              flush && !selected && 'text-ink-2',
              fit && 'px-[22px]',
              tight && 'gap-[5px] px-1 text-[0.84375rem]',
            )}
          >
            {finished && (
              <Check
                aria-hidden="true"
                data-done-mark=""
                className="size-3.5 shrink-0 text-accent"
                strokeWidth={3}
              />
            )}
            {dotted?.has(tab.key) && (
              <span
                aria-hidden="true"
                data-dot-mark=""
                className="size-[7px] shrink-0 rounded-full bg-warn"
              />
            )}
            <span className="truncate" dir="auto">
              {tab.label}
            </span>
            {tab.count !== undefined && (
              <span className={cn('num text-[0.8125rem]', flush && 'font-medium text-muted')}>
                {tab.count}
              </span>
            )}
            {dotted?.has(tab.key) && <span className="sr-only">{flagLabel}</span>}
            {flagged?.has(tab.key) && (
              <>
                <TriangleAlert
                  aria-hidden="true"
                  data-flag-mark=""
                  className="size-3.5 shrink-0 text-warn"
                />
                <span className="sr-only">{flagLabel}</span>
              </>
            )}
            {finished && (
              // aria-hidden keeps "Done" out of the tab's name; describedby still reads it.
              <span id={`${doneId}-${tab.key}`} aria-hidden="true" className="sr-only">
                Done
              </span>
            )}
            {selected && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute bottom-0 h-[3px] bg-accent',
                  flush ? 'inset-x-0' : 'inset-x-3 rounded-sm',
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

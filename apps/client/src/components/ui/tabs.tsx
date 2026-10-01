import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export type TabItem<K extends string> = { key: K; label: string };

/**
 * A row of tabs (the WAI-ARIA tabs pattern with MANUAL activation: arrows and Home / End move
 * focus, Enter or Space chooses, only the chosen tab is in the Tab order). Manual, because
 * choosing a tab unmounts the panel, and an arrow must never drop a half-filled form. One underline slides to the chosen tab — it says
 * which tab is open, so it is informational motion. Presentation only: the page keeps the
 * chosen key and renders the panel.
 */
export function Tabs<K extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const chosen = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    setBar(chosen ? { left: chosen.offsetLeft, width: chosen.offsetWidth } : null);
  }, [value, tabs.length]);

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
      className="relative flex flex-wrap gap-1 border-b border-border"
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-tab={tab.key}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={cn(
              'tap-target state-layer motion-transition rounded-t-lg px-4 text-sm font-medium',
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {tab.label}
          </button>
        );
      })}
      {bar && (
        <span
          aria-hidden="true"
          className="motion-transition pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-text"
          style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
        />
      )}
    </div>
  );
}

import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CoverageState } from '@/lib/derive/coverage';
import { cn } from '@/lib/utils';
import { cellText, missingLine, type CoverageCell } from './homeData';

const CELL: Record<CoverageState, string> = {
  full: 'bg-accent',
  gap: 'bg-coverage-gap',
  none: 'bg-line-2 ring-1 ring-inset ring-line',
};

const SWATCH = 'inline-block size-2.5 rounded-[3px] me-1.5 align-[-1px]';

/** The square nearest a point: 0 px away when the point is on it (UF.21's tap rule). */
function nearest(squares: HTMLElement[], x: number, y: number): number {
  let best = 0;
  let bestDistance = Infinity;
  squares.forEach((square, i) => {
    const r = square.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
  });
  return best;
}

/**
 * Schedule coverage (README): one rounded square per qualification match, as of the last
 * sync — every slotted robot scouted, a robot missing, or not played yet — then the
 * matches missing a robot, by name. On a computer the squares keep their size and as many as
 * fit share a row (the card spans the width while Top teams is deferred); 12 per row on a phone.
 *
 * UF.21: a square names its match in a small bubble above it — "Q12 · 4 scouted" — on a tap
 * (another tap moves it, a tap elsewhere closes it), on hover and on keyboard focus. The
 * squares are far under 48 px, so a tap anywhere in the grid's padded band, gaps included,
 * goes to the nearest square. They are one tab stop; the arrow keys move between them.
 */
export function CoverageCard({ cells, desktop }: { cells: CoverageCell[]; desktop: boolean }) {
  const [shown, setShown] = useState<number | null>(null);
  const [stop, setStop] = useState(0);
  const band = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const squares = () => [...(grid.current?.querySelectorAll<HTMLElement>('button') ?? [])];
  /** The focused square, if focus is in the grid: a hover ends back on it. */
  const focused = () => {
    const i = squares().indexOf(document.activeElement as HTMLElement);
    return i < 0 ? null : i;
  };

  // A tap or click anywhere else, or Escape, closes the bubble.
  useEffect(() => {
    if (shown === null) return;
    const outside = (e: PointerEvent) => {
      if (!band.current?.contains(e.target as Node)) setShown(null);
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setShown(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [shown]);

  // Above its square, centred, kept inside the grid's width; placed before the first paint.
  useLayoutEffect(() => {
    const square = shown === null ? undefined : squares()[shown];
    const el = tip.current;
    if (!square || !el || !grid.current) return;
    const room = grid.current.clientWidth - el.offsetWidth;
    const left = square.offsetLeft + square.offsetWidth / 2 - el.offsetWidth / 2;
    el.style.left = `${Math.max(0, Math.min(room, left))}px`;
    el.style.top = `${square.offsetTop - el.offsetHeight - 6}px`;
  }, [shown]);

  if (cells.length === 0) return null;
  const count = (s: CoverageState) => cells.filter((c) => c.state === s).length;
  const missing = cells.filter((c) => c.state === 'gap');
  const legend: [CoverageState, string][] = desktop
    ? [
        ['full', 'All 6 robots'],
        ['gap', 'Missing a robot'],
        ['none', 'Not played yet'],
      ]
    : [
        ['full', 'All 6'],
        ['gap', 'Missing a robot'],
        ['none', 'Not played'],
      ];
  const summary = legend.map(([s, text]) => `${count(s)} ${text}`).join(', ');
  const active = shown === null ? undefined : cells[shown];

  /** The square under the pointer, else the nearest one. */
  const pick = (e: MouseEvent) => {
    const all = squares();
    const own = all.indexOf(e.target as HTMLElement);
    return own >= 0 ? own : nearest(all, e.clientX, e.clientY);
  };
  const show = (i: number) => {
    setShown(i);
    setStop(i);
  };
  const move = (e: KeyboardEvent, i: number) => {
    const all = squares();
    const top = all[0]?.offsetTop;
    const perRow = Math.max(1, all.filter((s) => s.offsetTop === top).length);
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + perRow,
      ArrowUp: i - perRow,
      Home: 0,
      End: all.length - 1,
    };
    const to = keys[e.key];
    if (to === undefined || to < 0 || to >= all.length) return;
    e.preventDefault();
    all[to]?.focus();
  };

  return (
    <section
      aria-labelledby="home-coverage"
      className={cn(
        'rounded-card border border-line bg-surface',
        desktop ? 'mt-4 px-[18px] py-4' : 'mt-3 p-3.5',
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 id="home-coverage" className="text-[0.96875rem] font-bold">
          Schedule coverage
        </h2>
        <span className="text-[0.78125rem] text-muted">
          {desktop
            ? 'Each square is a qualification match · as of the last sync'
            : `${missing.length} missing`}
        </span>
      </div>
      {/* The tap band: the grid, 8 px above and below it, and the card's side padding. */}
      <div
        ref={band}
        className={cn('mt-1 py-2', desktop ? '-mx-[18px] px-[18px]' : '-mx-3.5 px-3.5')}
        onClick={(e) => show(pick(e))}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') setShown(pick(e));
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setShown(focused());
        }}
        onBlur={(e) => {
          if (!band.current?.contains(e.relatedTarget as Node | null)) setShown(null);
        }}
      >
        <div
          ref={grid}
          role="group"
          aria-label={summary}
          className={cn(
            'relative grid gap-[3px]',
            desktop ? 'grid-cols-[repeat(auto-fill,1.1875rem)]' : 'grid-cols-12',
          )}
        >
          {cells.map((c, i) => (
            <button
              key={c.matchId}
              type="button"
              tabIndex={i === stop ? 0 : -1}
              aria-label={cellText(c)}
              data-on={i === shown || undefined}
              onFocus={() => show(i)}
              onKeyDown={(e) => move(e, i)}
              className={cn(
                'h-[18px] rounded data-on:outline-2 data-on:outline-offset-1 data-on:outline-ink',
                CELL[c.state],
              )}
            />
          ))}
          {active && (
            <span
              ref={tip}
              aria-hidden="true"
              className="pointer-events-none absolute z-10 rounded-md bg-ink px-2 py-1 text-[0.78125rem] font-semibold whitespace-nowrap text-surface"
            >
              {cellText(active)}
            </span>
          )}
        </div>
      </div>
      <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.78125rem] text-muted">
        {legend.map(([s, text]) => (
          <span key={s}>
            <i aria-hidden="true" className={cn(SWATCH, CELL[s])} />
            {text}
          </span>
        ))}
      </p>
      {missing.length > 0 && (
        <p className="mt-3 flex justify-between gap-2.5 border-t border-line-2 pt-3 text-[0.84375rem]">
          <b className="shrink-0 font-semibold whitespace-nowrap">
            {desktop ? missingLine(missing.length) : 'Missing a robot'}
          </b>
          <span className="num text-end text-[0.8125rem] text-ink-2">
            {missing.map((c) => c.label).join(' · ')}
          </span>
        </p>
      )}
    </section>
  );
}

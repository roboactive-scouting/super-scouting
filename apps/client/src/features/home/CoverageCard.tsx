import type { CoverageState } from '@/lib/derive/coverage';
import { cn } from '@/lib/utils';
import { missingLine, type CoverageCell } from './homeData';

const CELL: Record<CoverageState, string> = {
  full: 'bg-accent',
  gap: 'bg-coverage-gap',
  none: 'bg-line-2 ring-1 ring-inset ring-line',
};

const SWATCH = 'inline-block size-2.5 rounded-[3px] me-1.5 align-[-1px]';

/**
 * Schedule coverage (README): one rounded square per qualification match, as of the last
 * sync — every slotted robot scouted, a robot missing, or not played yet — then the
 * matches missing a robot, by name. 24 per row on a computer, 12 on a phone.
 */
export function CoverageCard({ cells, desktop }: { cells: CoverageCell[]; desktop: boolean }) {
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
      <div
        role="img"
        aria-label={summary}
        className={cn('mt-3 grid gap-[3px]', desktop ? 'grid-cols-24' : 'grid-cols-12')}
      >
        {cells.map((c) => (
          <i key={c.matchId} title={c.label} className={cn('h-[18px] rounded', CELL[c.state])} />
        ))}
      </div>
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.78125rem] text-muted">
        {legend.map(([s, text]) => (
          <span key={s}>
            <i aria-hidden="true" className={cn(SWATCH, CELL[s])} />
            {text}
          </span>
        ))}
      </p>
      {missing.length > 0 && (
        <p className="mt-3 flex justify-between gap-2.5 border-t border-line-2 pt-3 text-[0.84375rem]">
          <b className="font-semibold">
            {desktop ? missingLine(missing.length) : 'Missing a robot'}
          </b>
          <span className="num text-[0.8125rem] text-ink-2">
            {missing.map((c) => c.label).join(' · ')}
          </span>
        </p>
      )}
    </section>
  );
}

import { formatCount, formatMetric, type RankRow } from '@frc/shared';
import { Link } from 'react-router-dom';
import { Sparkline } from '@/components/Sparkline';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';

/**
 * Top teams (03-home final; task 1.58b): the first five by the canonical rank (`topTeamsOf`),
 * each with its rank, number and name, the trend line of its last five counted matches
 * (`recent_totals`, the team page's sparkline: `--faint`, ours `--accent`) and its average
 * points; our team's row is tinted `--accent-tint` and says "our team" to a screen reader. Then
 * **Full ranking**, to /ranking. The caller hides the card while nothing is ranked.
 */
export function TopTeamsCard({
  rows,
  ourTeam,
  desktop,
}: {
  rows: readonly RankRow[];
  ourTeam: number;
  desktop: boolean;
}) {
  return (
    <section
      aria-labelledby="home-top-teams"
      className={cn(
        'flex flex-col rounded-card border border-line bg-surface',
        desktop ? 'px-[18px] py-4' : 'mt-3 p-3.5',
      )}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 id="home-top-teams" className="text-[0.96875rem] font-bold">
          Top teams
        </h2>
        <span className="text-[0.78125rem] text-muted">
          {desktop ? 'Average points · last 5' : 'avg points · last 5'}
        </span>
      </div>
      <ol className={desktop ? 'mt-1.5' : 'mt-1'}>
        {rows.map((row) => {
          const us = row.number === ourTeam;
          return (
            <li
              key={row.team_id}
              data-team={row.number}
              data-us={us || undefined}
              className={cn(
                'grid grid-cols-[1.375rem_minmax(0,1fr)_4rem_2.875rem] items-center gap-2 border-t border-line-2 py-2 text-[0.84375rem] first:border-t-0',
                us && '-mx-2.5 rounded-control border-transparent bg-accent-tint px-2.5 font-[650]',
              )}
            >
              <span className="num text-faint">
                <span className="sr-only">Rank </span>
                {formatCount(row.rank)}
              </span>
              <span className="min-w-0 truncate">
                <span className="num">{formatCount(row.number)}</span>
                <span dir="auto" className={cn('ms-1.5', us ? 'text-accent-ink' : 'text-muted')}>
                  {row.name}
                </span>
                {us && <span className="sr-only">, our team</span>}
              </span>
              <Sparkline values={row.recent_totals} tone={us ? 'accent' : 'faint'} />
              <span className="num text-end">
                <span className="sr-only">, average </span>
                {formatMetric(row.average_points)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={cn(desktop ? 'mt-2.5' : 'mt-2')}>
        <Link
          to={PATHS.ranking}
          className="relative text-[0.875rem] font-semibold text-accent-ink after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']"
        >
          Full ranking
        </Link>
      </p>
    </section>
  );
}

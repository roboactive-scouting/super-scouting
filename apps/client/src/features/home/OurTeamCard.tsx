import { formatCount } from '@frc/shared';
import { cn } from '@/lib/utils';
import { moveText, type OurTeam } from './homeData';

/**
 * The Our-team card (03-home final, "Our team"; task 1.58b): the dark `--rail` card with the
 * mark, our number and name, "Our team at this event", the rank "#3 / 42" (of the roster)
 * and "avg 51.2 · ▲2 since Q36". The move is an arrow and words, never colour alone, and is spoken
 * as "Up 2 places since Q36". With fewer than two counted matches the move is left out. The
 * caller hides the card while our team is not ranked. On a computer it is the fourth tile of
 * the stat row; on a phone a full-width card under the tiles.
 */
export function OurTeamCard({ team, desktop }: { team: OurTeam; desktop: boolean }) {
  const move = team.move ? moveText(team.move) : null;
  return (
    <section
      aria-label="Our team"
      data-testid="our-team"
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-card bg-rail px-3.5 py-3 text-rail-ink',
        desktop ? 'self-start' : 'mt-3',
      )}
    >
      <img src="/brand/mark.png" alt="" className="w-[1.875rem] shrink-0" />
      <div className="min-w-0">
        <p className="num text-[0.9375rem] leading-snug font-semibold text-surface">
          {formatCount(team.row.number)}
          {desktop ? <br /> : ' '}
          <span dir="auto">{team.row.name}</span>
        </p>
        <p className="text-xs text-rail-muted">Our team at this event</p>
      </div>
      <div className="text-end">
        <p className="num leading-none font-semibold whitespace-nowrap text-surface">
          <span aria-hidden="true">
            <span className="text-[1.625rem]">#{formatCount(team.rank)}</span>{' '}
            <span className="text-[0.8125rem] font-medium text-rail-muted">
              / {formatCount(team.of)}
            </span>
          </span>
          <span className="sr-only">
            Rank {formatCount(team.rank)} of {formatCount(team.of)}
          </span>
        </p>
        <p className="mt-1 text-xs whitespace-nowrap text-rail-muted">
          <span aria-hidden="true">avg {team.average}</span>
          <span className="sr-only">Average {team.average} points</span>
          {move && (
            <>
              <span aria-hidden="true"> · </span>
              {move.shown === move.spoken ? (
                <span data-move="0">{move.shown}</span>
              ) : (
                <>
                  <span aria-hidden="true" data-move={Math.sign(team.move!.places)}>
                    {move.shown}
                  </span>
                  <span className="sr-only">{move.spoken}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>
    </section>
  );
}

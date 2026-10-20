import { Lock } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { stationLabel } from '@/components/ui/tag';
import type { Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { cn } from '@/lib/utils';

/** One robot of the typed match's line-up, as a driver-station tile (Scout README 3, 7). */
export type Tile = {
  station: Station;
  teamId: string;
  number: number;
  name: string;
  /** Already scouted on this device: locked, or open until `until` (null: a lead, no window). */
  done: null | { locked: boolean; until: string | null };
};

/** The line under the team number: its name, or what this device already holds for it. */
export function tileSubline(tile: Pick<Tile, 'name' | 'done'>): string {
  if (!tile.done) return tile.name;
  if (tile.done.locked) return 'Scouted · locked';
  return tile.done.until ? `Scouted · edit until ${tile.done.until}` : 'Scouted';
}

const SIDES = [
  { key: 'R', label: 'Red', head: 'text-alliance-red' },
  { key: 'B', label: 'Blue', head: 'text-alliance-blue' },
] as const;

/** The typed match's line-up as tiles, by station; empty when it has none on this device. */
export function lineupTiles(
  slots: LineupSlot[],
  matchId: string | undefined,
  teamById: Map<string, { id: string; number: number; name: string }>,
  doneOf: (teamId: string) => Tile['done'],
): Tile[] {
  if (!matchId) return [];
  return slots
    .filter((s) => s.match_id === matchId)
    .flatMap((s) => {
      const team = teamById.get(s.team_id);
      const station = stationOf([s], matchId, s.team_id);
      if (!team || !station) return [];
      const { id: teamId, number, name } = team;
      return [{ station, teamId, number, name, done: doneOf(teamId) }];
    })
    .sort((a, b) => a.station.localeCompare(b.station));
}

/**
 * The six robots, Red 1–3 on the left and Blue 1–3 on the right (THEME "Station tile"),
 * under "Q39 · tap the robot you are watching" and over "Team not here?". A radio group:
 * the remembered station is marked YOUR STATION and picked by default; the page decides
 * whether picking another tile asks first.
 */
export function LineupTiles({
  tiles,
  mine,
  selected,
  onPick,
  shortMatch,
  longMatch,
  onNotHere,
}: {
  tiles: Tile[];
  mine: Station | null;
  selected: Station | null;
  onPick: (tile: Tile) => void;
  /** "Q39" on a phone, "Qualification 39" on a desktop. */
  shortMatch: string;
  longMatch: string;
  onNotHere: () => void;
}) {
  const label = useId();
  return (
    <section className="mt-3.5 lg:mt-5">
      <p id={label} className="mb-2 text-xs font-semibold text-muted">
        <span className="lg:hidden">{shortMatch}</span>
        <span className="max-lg:hidden">{longMatch}</span> · tap the robot you are watching
      </p>
      <div
        role="radiogroup"
        aria-labelledby={label}
        className="grid grid-cols-2 gap-2 rounded-card border border-line bg-surface p-3 lg:p-3.5"
      >
        {SIDES.map((side) => (
          <div key={side.key} className="flex flex-col gap-2">
            <div className={cn('text-[0.71875rem] font-bold tracking-[0.06em]', side.head)}>
              {side.label}
            </div>
            {tiles
              .filter((t) => t.station[0] === side.key)
              .map((t) => (
                <StationTile
                  key={t.station}
                  tile={t}
                  mine={t.station === mine}
                  on={t.station === selected}
                  onPick={() => onPick(t)}
                />
              ))}
          </div>
        ))}
      </div>
      {/* A real button, not link text (UI fix round). Its scroll margin is the pinned bar's
          height, so focusing it never leaves it under Start entry (ActionBar). */}
      <Button
        className="mt-3 w-full scroll-mb-[calc(var(--bottom-bar,0px)+6.5rem)] px-3 text-[0.84375rem] whitespace-normal lg:text-[0.90625rem]"
        onClick={onNotHere}
      >
        <span>
          <span className="font-normal">Team not here?</span>{' '}
          <span className="text-accent-ink">Choose from the event's teams</span>
        </span>
      </Button>
    </section>
  );
}

function StationTile({
  tile,
  mine,
  on,
  onPick,
}: {
  tile: Tile;
  mine: boolean;
  on: boolean;
  onPick: () => void;
}) {
  const red = tile.station[0] === 'R';
  const locked = tile.done?.locked === true;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={locked}
      onClick={onPick}
      className={cn(
        'hover-veil motion-safe:transition relative flex min-h-[62px] flex-col justify-center rounded-control px-2 py-2 text-start lg:min-h-[70px] lg:px-2.5',
        red ? 'bg-alliance-red-tint text-alliance-red' : 'bg-alliance-blue-tint text-alliance-blue',
        tile.done && 'bg-line-2 text-muted',
        on && (red ? 'bg-alliance-red-strong' : 'bg-alliance-blue-strong'),
        on && 'text-on-accent',
        // The picked own-station tile draws no dashes: its YOUR STATION tag already marks it.
        mine &&
          !on &&
          (red
            ? 'outline-2 -outline-offset-2 outline-alliance-red outline-dashed'
            : 'outline-2 -outline-offset-2 outline-alliance-blue outline-dashed'),
      )}
    >
      {/* The label and the YOUR STATION tag share one row and never overlap: when they do not
          fit side by side (a narrow tile, a large OS text size) the tag wraps under the label. */}
      <span
        className={cn(
          'flex flex-wrap items-center gap-x-1 gap-y-0.5',
          !mine && tile.done && 'pe-4',
        )}
      >
        <span className="text-[0.6875rem] font-bold tracking-[0.04em]">
          {stationLabel(tile.station).toUpperCase()}
        </span>
        {mine && (
          <span
            className={cn(
              'ms-auto rounded-[4px] px-1 py-px text-[0.65625rem] leading-[1.35] font-extrabold tracking-[0.02em] whitespace-nowrap text-on-accent',
              on
                ? red
                  ? 'bg-on-accent text-alliance-red-strong'
                  : 'bg-on-accent text-alliance-blue-strong'
                : red
                  ? 'bg-alliance-red'
                  : 'bg-alliance-blue',
            )}
          >
            YOUR STATION
          </span>
        )}
      </span>
      <span className="font-num text-[1.1875rem] leading-tight font-semibold">{tile.number}</span>
      <span dir="auto" className={cn('text-xs', !tile.done && !on && 'text-ink-2')}>
        {tileSubline(tile)}
      </span>
      {!mine && tile.done ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute end-2 top-1.5 text-[0.6875rem] font-bold',
            on ? 'text-on-accent' : 'text-accent',
          )}
        >
          {locked ? <Lock className={cn('size-3.5', !on && 'text-muted')} /> : '✓'}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Scout README 4: tapping a robot that is not your station asks first. The station itself
 * never changes from here.
 */
export function OtherStationDialog({
  mine,
  target,
  onKeep,
  onScout,
}: {
  mine: Station;
  target: Tile | null;
  onKeep: () => void;
  onScout: (tile: Tile) => void;
}) {
  const there = target ? stationLabel(target.station) : '';
  const home = stationLabel(mine);
  return (
    <ResponsiveDialog open={target !== null} title={`Scout ${there} instead?`} onClose={onKeep}>
      {target && (
        <>
          <p className="text-[0.84375rem] leading-normal text-muted">
            Your station is <b className={allianceText(mine)}>{home}</b>. This entry will be for{' '}
            <b className="text-ink" dir="auto">
              {target.number} {target.name}
            </b>{' '}
            on <b className={allianceText(target.station)}>{there}</b>. Your station stays {home}.
          </p>
          <div className="mt-1 flex gap-2.5">
            <Button size="lg" className="flex-1 px-3" onClick={onKeep}>
              Keep {home}
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 px-3"
              onClick={() => onScout(target)}
            >
              Scout {there}
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}

function allianceText(station: Station): string {
  return station[0] === 'R' ? 'text-alliance-red' : 'text-alliance-blue';
}

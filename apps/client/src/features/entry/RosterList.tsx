import type { ReactNode } from 'react';
import { AllianceButtons } from '@/components/ui/alliance-buttons';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { stationLabel } from '@/components/ui/tag';
import { matchesSearch, stationOf, type LineupSlot } from '@/lib/derive/entries';
import { cn } from '@/lib/utils';
import { tileSubline, type Tile } from './LineupTiles';

/** A team on the event roster, as a selectable row (Scout README 5, 6). */
export type RosterItem = {
  id: string;
  number: number;
  name: string;
  /** The line under the number: the name, or what this device holds, or its place in the match. */
  detail: string;
  /** Scouted on this device and no longer editable. */
  locked: boolean;
};

/** The roster as rows: "Orbit · in this match, Red 1" for a team in the typed match. */
export function rosterItems(
  roster: { id: string; number: number; name: string }[],
  slots: LineupSlot[],
  matchId: string | undefined,
  doneOf: (teamId: string) => Tile['done'],
): RosterItem[] {
  return roster.map((t) => {
    const done = doneOf(t.id);
    const at = matchId ? stationOf(slots, matchId, t.id) : null;
    const detail = done
      ? tileSubline({ name: t.name, done })
      : at
        ? `${t.name} · in this match, ${stationLabel(at)}`
        : t.name;
    return { id: t.id, number: t.number, name: t.name, detail, locked: done?.locked === true };
  });
}

/** "Team not here?": the roster view's own heading, with a way back to the line-up. */
export function RosterHeading({ sub, onCancel }: { sub: string; onCancel: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.02em] lg:text-[1.75rem]">
          Which team are you watching?
        </h1>
        <p className="mt-1 text-[0.8125rem] text-muted">{sub}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * The alliance choice and the searchable event roster: a search field, then one radio row
 * per team (THEME "Selectable list row"). Read from the device, so it works offline.
 */
export function RosterList({
  alliance,
  onAlliance,
  teams,
  value,
  onChange,
  query,
  onQuery,
  children,
}: {
  alliance: 'red' | 'blue' | null;
  onAlliance: (side: 'red' | 'blue') => void;
  teams: RosterItem[];
  value: string | null;
  onChange: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  /** Notes about the chosen team, under the list. */
  children?: ReactNode;
}) {
  const shown = teams.filter((t) => matchesSearch(query, [t.number, t.name]));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted">Alliance</p>
      <AllianceButtons value={alliance} onChange={onAlliance} />
      <SearchField
        value={query}
        onChange={onQuery}
        label="Find a team"
        placeholder="Find a team: number or name"
        className="mt-1"
      />
      <div role="radiogroup" aria-label="Team" className="flex flex-col gap-2">
        {shown.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={t.locked}
              onClick={() => onChange(t.id)}
              className={cn(
                'hover-veil motion-safe:transition grid min-h-14 grid-cols-[22px_1fr] items-center gap-3 rounded-card border bg-surface px-3.5 py-2.5 text-start disabled:bg-line-2',
                on
                  ? 'border-2 border-accent bg-accent-tint px-[13px] py-[9px]'
                  : 'border-control-border',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-[22px] rounded-full',
                  on ? 'border-[7px] border-accent' : 'border-2 border-control-border',
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn('block font-num text-xl font-semibold', t.locked && 'text-muted')}
                >
                  {t.number}
                </span>
                <span dir="auto" className="block truncate text-[0.8125rem] text-muted">
                  {t.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCount, formatTime } from '@frc/shared';
import { FilterChips } from '@/components/ui/filter-chips';
import { SearchField } from '@/components/ui/search-field';
import { superTeamPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { superList, type SuperFilter, type SuperTeam } from './superData';

/** "seen in 4 matches here", "seen in 1 match here", "not seen here yet". */
function seenText(count: number): string {
  if (count === 0) return 'not seen here yet';
  return `seen in ${count} ${count === 1 ? 'match' : 'matches'} here`;
}

/** The time this device's super entry for a team last changed: "11:20". */
export function superDoneAt(team: SuperTeam): string | null {
  const at = team.entry ? (team.entry.client_updated_at ?? team.entry.client_created_at) : null;
  return at ? formatTime(at) : null;
}

const TAG =
  'inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-tag px-[9px] text-[0.78125rem] font-[650]';

/**
 * The super picker (15-super final, variant A): the title and event, the progress line with a
 * thin accent bar, search (number or name), To do · Done · All with counts (To do first), and
 * the roster — each row at least 56 px: the number in mono, the name, how many matches this
 * device saw the team in, and a status tag. A done row dims its number and reopens the entry.
 */
export function SuperPicker({
  eventName,
  teams,
  selectedId,
  className,
}: {
  eventName: string;
  teams: readonly SuperTeam[];
  /** The team whose form is open beside the list (desktop). */
  selectedId?: string;
  className?: string;
}) {
  const [filter, setFilter] = useState<SuperFilter>('todo');
  const [query, setQuery] = useState('');
  const done = teams.filter((t) => t.entry).length;
  const total = teams.length;
  const rows = superList(teams, filter, query);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section aria-labelledby="super-title" className={cn('flex min-w-0 flex-col', className)}>
      <h1
        id="super-title"
        className="text-[1.375rem] font-[750] tracking-[-0.02em] text-ink lg:text-[1.75rem]"
      >
        Super scouting
      </h1>
      <p className="mt-0.5 text-[0.8125rem] text-muted lg:text-[0.9375rem]" dir="auto">
        {eventName} · one entry per team for the whole event
      </p>
      <div className="mt-3">
        <p className="flex items-baseline justify-between gap-3 text-[0.8125rem] text-ink-2 lg:text-[0.875rem]">
          <span>Super-scouted on this device</span>
          <span className="num font-semibold text-ink">
            {formatCount(done)} of {formatCount(total)}
          </span>
        </p>
        <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <SearchField
        className="mt-3.5"
        value={query}
        onChange={setQuery}
        placeholder="Find a team: number or name"
        label="Find a team"
      />
      <div className="mt-3">
        <FilterChips<SuperFilter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'todo', label: 'To do', count: total - done },
            { key: 'done', label: 'Done', count: done },
            { key: 'all', label: 'All', count: total },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-card border border-line bg-surface px-4 py-5 text-center text-[0.84375rem] text-muted">
          {query.trim()
            ? `No team on the roster matches “${query.trim()}”.`
            : filter === 'done'
              ? 'No team is super-scouted on this device yet.'
              : filter === 'todo' && total > 0
                ? 'Every team on the roster is super-scouted on this device.'
                : 'This competition has no teams on its roster on this device.'}
        </p>
      ) : (
        <ul aria-label="Teams" className="mt-3 flex flex-col gap-2">
          {rows.map((team) => {
            const at = superDoneAt(team);
            const selected = team.id === selectedId;
            return (
              <li key={team.id}>
                <Link
                  to={superTeamPath(team.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'hover-veil motion-safe:transition flex min-h-14 items-center gap-3.5 rounded-card border bg-surface px-4 py-2',
                    selected
                      ? 'border-accent shadow-[inset_0_0_0_1px_var(--accent)]'
                      : 'border-line',
                  )}
                >
                  <span
                    className={cn(
                      'num w-[3.25rem] shrink-0 text-[1.125rem] font-semibold lg:text-[1.375rem]',
                      team.entry ? 'text-muted' : 'text-ink',
                    )}
                  >
                    {team.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b
                      className="block truncate text-[0.90625rem] font-semibold text-ink lg:text-[1.0625rem]"
                      dir="auto"
                    >
                      {team.name}
                    </b>
                    <span className="block text-[0.75rem] text-muted lg:text-[0.875rem]">
                      {seenText(team.seen.length)}
                    </span>
                  </span>
                  {team.entry ? (
                    <span className={cn(TAG, 'bg-accent-tint text-accent-ink')}>
                      ✓ Done{at ? ` ${at}` : ''}
                    </span>
                  ) : (
                    <span className={cn(TAG, 'bg-line-2 text-ink-2')}>To do</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

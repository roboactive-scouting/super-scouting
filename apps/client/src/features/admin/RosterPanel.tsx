import { useId, useRef, useState } from 'react';
import { updateTeamInput, type RosterRow, type TeamRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { ErrorLine, Note } from '@/components/ui/notice';
import { SearchField } from '@/components/ui/search-field';
import type { Rpc } from '@/data/rpc';
import { panelErrorLine } from './adminMessages';
import type { Failure } from './manageError';
import { RosterAdd } from './RosterAdd';
import { TeamCard } from './TeamCard';
import { byNumber } from './useManageLists';

export const TEAM_NUMBER_PERMANENT_NOTE = 'A team number is permanent. Only the name can change.';

const toRow = (t: { id: string; number: number; name: string }): RosterRow => ({
  team_id: t.id,
  number: t.number,
  name: t.name,
});

function matchesFilter(team: { number: number; name: string }, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return !q || String(team.number).startsWith(q) || team.name.toLowerCase().includes(q);
}

const GRID = 'grid grid-cols-1 gap-2 px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

/**
 * The Teams & roster tab (07-manage final): the one-field add, a filter, the permanent-
 * number note, the event's roster as cards (click a name to rename, × to take a team off)
 * and the registry teams not on it as dashed cards (+ to add). Every roster change sends
 * the WHOLE new roster (`setEventRoster` replaces it, SPEC-FINAL 6.4), shown at once and
 * put back if the server refuses. The page owns `roster` and `registry`.
 */
export function RosterPanel({
  rpc,
  eventId,
  roster,
  onRosterChange,
  registry,
  registryFailure,
  onRegistryChange,
  onRetryRegistry,
}: {
  rpc: Rpc;
  eventId: string;
  roster: RosterRow[];
  onRosterChange: (roster: RosterRow[]) => void;
  /** Every team; `null` while it loads (or failed: `registryFailure`). */
  registry: TeamRow[] | null;
  registryFailure: Failure | null;
  onRegistryChange: (registry: TeamRow[]) => void;
  /** Ask for the registry again after it failed to load. */
  onRetryRegistry: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  /** Teams created here whose roster save has not gone through yet, by number. */
  const created = useRef(new Map<number, TeamRow>());

  /** Show `next` at once, send it whole, adopt the server's answer or put `roster` back. */
  async function saveRoster(next: RosterRow[]): Promise<boolean> {
    const before = roster;
    setBusy(true);
    setError(null);
    onRosterChange(byNumber(next));
    try {
      const out = (await rpc.call('setEventRoster', {
        event_id: eventId,
        team_ids: byNumber(next).map((r) => r.team_id),
      })) as { items?: RosterRow[] } | undefined;
      if (out?.items) onRosterChange(byNumber(out.items));
      return true;
    } catch (e) {
      onRosterChange(before);
      setError(panelErrorLine(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(number: number, name: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    // A retry after a refused roster save must not create the team a second time.
    let team = created.current.get(number);
    if (!team) {
      try {
        team = (await rpc.call('createTeam', { number, name })) as TeamRow;
      } catch (e) {
        setError(panelErrorLine(e));
        setBusy(false);
        return false;
      }
      created.current.set(number, team);
      if (registry) onRegistryChange(byNumber([...registry, team]));
    }
    const saved = await saveRoster([...roster, toRow(team)]);
    if (saved) created.current.delete(number);
    return saved;
  }

  async function rename(teamId: string, name: string) {
    const checked = updateTeamInput.shape.name.safeParse(name);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    const before = roster;
    const renamed = (rows: RosterRow[]) =>
      rows.map((r) => (r.team_id === teamId ? { ...r, name: checked.data } : r));
    setBusy(true);
    setError(null);
    onRosterChange(renamed(roster));
    try {
      await rpc.call('updateTeam', { team_id: teamId, name: checked.data });
      if (registry) {
        onRegistryChange(registry.map((t) => (t.id === teamId ? { ...t, name: checked.data } : t)));
      }
    } catch (e) {
      onRosterChange(before);
      setError(panelErrorLine(e));
    } finally {
      setBusy(false);
    }
  }

  const onRoster = new Set(roster.map((r) => r.team_id));
  const shown = roster.filter((r) => matchesFilter(r, filter));
  const others = (registry ?? []).filter((t) => !onRoster.has(t.id));
  const othersShown = others.filter((t) => matchesFilter(t, filter));

  return (
    <section aria-label="Teams and roster" className="rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-end gap-2.5 border-b border-line-2 px-4 py-3.5">
        <RosterAdd
          rpc={rpc}
          roster={roster}
          registry={registry}
          busy={busy}
          onAdd={(team) => void saveRoster([...roster, toRow(team)])}
          onCreate={create}
        />
        <span className="hidden flex-1 sm:block" />
        <div className="w-full sm:w-[220px]">
          <p aria-hidden="true" className="text-sm font-semibold">
            Filter
          </p>
          <SearchField
            label="Filter"
            value={filter}
            onChange={setFilter}
            placeholder="Number or name"
            className="mt-1.5"
          />
        </div>
      </div>
      <Note className="mx-4 mt-3">{TEAM_NUMBER_PERMANENT_NOTE}</Note>
      {error && <ErrorLine className="mx-4 mt-3">{error}</ErrorLine>}

      <div className="flex flex-wrap items-baseline gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-sm font-[650]">On this event's roster</h2>
        <p id={hintId} className="text-[0.78125rem] text-muted">
          {roster.length} teams · click a name to rename
        </p>
      </div>
      {shown.length > 0 && (
        <ul className={GRID}>
          {shown.map((r) => (
            <TeamCard
              key={r.team_id}
              number={r.number}
              name={r.name}
              busy={busy}
              hintId={hintId}
              onAction={() => void saveRoster(roster.filter((x) => x.team_id !== r.team_id))}
              onRename={(name) => void rename(r.team_id, name)}
            />
          ))}
        </ul>
      )}
      {shown.length === 0 && roster.length > 0 && <NoMatch />}

      <div className="flex flex-wrap items-baseline gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-sm font-[650]">In the registry, not on this roster</h2>
        <p className="text-[0.78125rem] text-muted">{others.length} · + adds</p>
      </div>
      <div className="pb-4">
        {registry === null ? (
          <div className="flex flex-wrap items-center gap-2 px-4">
            <p className="text-[0.8125rem] text-muted">
              {registryFailure ? registryFailure.line : 'Loading the teams…'}
            </p>
            {registryFailure && (
              <Button variant="secondary" size="sm" onClick={onRetryRegistry}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          othersShown.length > 0 && (
            <ul className={GRID}>
              {othersShown.map((t) => (
                <TeamCard
                  key={t.id}
                  number={t.number}
                  name={t.name}
                  dashed
                  busy={busy}
                  onAction={() => void saveRoster([...roster, toRow(t)])}
                />
              ))}
            </ul>
          )
        )}
        {othersShown.length === 0 && others.length > 0 && <NoMatch />}
      </div>
    </section>
  );
}

function NoMatch() {
  return <p className="px-4 text-[0.8125rem] text-muted">Nothing matches that filter.</p>;
}

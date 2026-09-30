import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { createTeamInput, updateTeamInput, type TeamRow } from '@frc/shared';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { StateMessage } from '@/components/StateMessage';
import { typedCall as defaultCall, type Rpc } from '@/data/rpc';
import { panelErrorLine, unreachable } from './adminMessages';
import { Checkbox, FormError, NumberField, TextField } from './fields';
import { loadAllTeams } from './teamsRegistry';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeader } from '@/components/ui/page-header';

/**
 * SPEC-FINAL 6.4 (task 1.21): the global team registry, with a roster checkbox per row for
 * the event `ManagePage` is currently managing, an "add team" form, and a per-row rename.
 * A team number is global and permanent (`updateTeam` does not take one) — the standing
 * note below says so, in the plan's own words. `rpc` is injectable, as the other panels are.
 */
export const TEAM_NUMBER_PERMANENT_NOTE = 'A team number is permanent. Only the name can change.';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; teams: TeamRow[]; rosterIds: ReadonlySet<string> }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

async function loadRoster(
  rpc: Rpc,
  eventId: string,
): Promise<{ teams: TeamRow[]; rosterIds: ReadonlySet<string> }> {
  const [teams, rosterOut] = await Promise.all([
    loadAllTeams(rpc),
    rpc.call('listEventRoster', { event_id: eventId }) as Promise<{
      // Tolerant of a roster row missing `number`/`name` (the plan's own test fixture):
      // this panel only needs `team_id` to know who is on the roster — the number and name
      // it shows come from the registry, never from this response.
      items: Array<{ team_id: string }>;
    }>,
  ]);
  return { teams, rosterIds: new Set(rosterOut.items.map((r) => r.team_id)) };
}

function matchesFilter(team: TeamRow, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return String(team.number).startsWith(q) || team.name.toLowerCase().includes(q);
}

export function TeamsPanel({
  eventId,
  rpc = { call: defaultCall },
}: {
  eventId: string;
  rpc?: Rpc;
}) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<TeamRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterId = useId();

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    loadRoster(rpc, eventId).then(
      (result) => {
        if (live) setLoad({ status: 'ready', ...result });
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          unreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: panelErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; only eventId/a retry re-fetches.
  }, [eventId, attempt]);

  /** Toggling one row sends the WHOLE new roster: `setEventRoster` replaces it (6.4). */
  async function toggleRoster(team: TeamRow, checked: boolean) {
    if (load.status !== 'ready') return;
    const nextIds = new Set(load.rosterIds);
    if (checked) nextIds.add(team.id);
    else nextIds.delete(team.id);
    // Built from the registry's own (wire) order, not re-sorted — see teamsRegistry.ts.
    const team_ids = load.teams.filter((t) => nextIds.has(t.id)).map((t) => t.id);
    setBusyId(team.id);
    setError(null);
    try {
      const out = (await rpc.call('setEventRoster', { event_id: eventId, team_ids })) as
        { items?: Array<{ team_id: string }> } | undefined;
      // Adopt the server's returned roster; fall back to the optimistic set if a test
      // double (or an old server build) answers without one, rather than crash.
      setLoad((prev) =>
        prev.status === 'ready'
          ? { ...prev, rosterIds: out?.items ? new Set(out.items.map((r) => r.team_id)) : nextIds }
          : prev,
      );
    } catch (e) {
      setError(panelErrorLine(e));
    } finally {
      setBusyId(null);
    }
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = createTeamInput.safeParse({ number: Number(number), name });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    setBusy(true);
    try {
      await rpc.call('createTeam', checked.data);
      setNumber('');
      setName('');
      reload();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitRename(team: TeamRow, newName: string) {
    setError(null);
    const checked = updateTeamInput.shape.name.safeParse(newName);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    setBusy(true);
    try {
      await rpc.call('updateTeam', { team_id: team.id, name: checked.data });
      setRenaming(null);
      reload();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={2}
        detail="Teams live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={2}
        title="Teams did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }

  const filtered =
    load.status === 'ready' ? load.teams.filter((t) => matchesFilter(t, filter)) : [];

  return (
    <section aria-label="Teams and roster">
      <SectionHeader title="Teams & roster" />
      <p className="mt-2 text-sm text-text-muted">{TEAM_NUMBER_PERMANENT_NOTE}</p>

      {/* Always visible, not gated behind a toggle: this is the whole global registry's
          only entry point, unlike the Seasons/Events "New …" forms (task 1.21 deviation). */}
      <form
        aria-label="Add team"
        noValidate
        onSubmit={(e) => void submitAdd(e)}
        className="mt-4 flex max-w-md flex-wrap items-end gap-3"
      >
        <div className="w-32">
          <NumberField label="Team number" value={number} onChange={setNumber} />
        </div>
        <div className="min-w-0 flex-1">
          <TextField label="Team name" value={name} onChange={setName} />
        </div>
        <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON} mb-0`}>
          {busy ? 'Adding…' : 'Add team'}
        </button>
      </form>

      <FormError message={error} />

      <div className="mt-6 max-w-xs">
        <Label htmlFor={filterId}>Filter teams</Label>
        <Input
          id={filterId}
          type="text"
          value={filter}
          dir="auto"
          placeholder="Number or name"
          className="mt-1.5"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {load.status === 'loading' ? (
        <p className="mt-4 text-text-muted">Loading the teams…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-text-muted">Nothing matches that filter.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface px-4">
          {filtered.map((team) => (
            <li key={team.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Checkbox
                label={<span dir="auto">{`${team.number} ${team.name}`}</span>}
                checked={load.rosterIds.has(team.id)}
                disabled={busyId !== null}
                onChange={(checked) => void toggleRoster(team, checked)}
              />
              <Button variant="ghost" dir="auto" onClick={() => setRenaming(team)}>
                <Pencil aria-hidden="true" />
                {`Rename ${team.number} ${team.name}`}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <RenameForm
          team={renaming}
          busy={busy}
          onSubmit={(newName) => void submitRename(renaming, newName)}
          onCancel={() => setRenaming(null)}
        />
      )}
    </section>
  );
}

function RenameForm({
  team,
  busy,
  onSubmit,
  onCancel,
}: {
  team: TeamRow;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(team.name);
  return (
    <Card className="mt-4 max-w-sm">
      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name);
        }}
      >
        <CardTitle id={titleId} level={3} dir="auto">
          {`Rename ${team.number} ${team.name}`}
        </CardTitle>
        <TextField label="Team name" value={name} onChange={setName} />
        <div className="tap-row mt-4 flex gap-2">
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
          <button type="button" disabled={busy} className={SECONDARY_BUTTON} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

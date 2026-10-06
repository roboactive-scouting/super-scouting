import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import {
  createMatchInput,
  updateMatchInput,
  MATCH_BULK_MAX,
  MATCH_NUMBER_MAX,
  MATCH_TYPES,
  type Alliance,
  type MatchRow,
  type MatchType,
  type RosterRow,
  type TeamRow,
} from '@frc/shared';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StateMessage } from '@/components/StateMessage';
import { adminRpc, type Rpc } from '@/data/rpc';
import { matchLabel } from '@/lib/matchLabel';
import { panelErrorLine, unreachable } from './adminMessages';
import { FormError, NumberField } from './fields';
import { loadAllTeams } from './teamsRegistry';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { SectionHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * SPEC-FINAL 6.4 (task 1.21): bulk-create matches of the chosen type by count, create one
 * match of that type, fill the six alliance slots from this event's roster (a slot may stay
 * empty), correct a match's type/number, and delete — behind the single destructive
 * pattern. `rpc` is injectable, as the other panels are.
 */

const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  practice: 'Practice',
  qualification: 'Qualification',
  playoff: 'Playoff',
};

const STATIONS: ReadonlyArray<{ alliance: Alliance; station: 1 | 2 | 3 }> = [
  { alliance: 'red', station: 1 },
  { alliance: 'red', station: 2 },
  { alliance: 'red', station: 3 },
  { alliance: 'blue', station: 1 },
  { alliance: 'blue', station: 2 },
  { alliance: 'blue', station: 3 },
];

/** The most matches one event's list will follow `next_cursor` through (common.md). */
const MAX_LISTED_MATCHES = 2000;

type Load =
  | { status: 'loading' }
  | { status: 'ready'; matches: MatchRow[]; roster: RosterRow[]; teams: TeamRow[] }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

/** Practice, then qualification, then playoff; by number within a type (matches.ts's own
 * documented `listMatches` order) — resorted defensively here, as SeasonsPanel/EventsPanel
 * resort their own lists rather than trust the wire. */
function sortMatches(items: MatchRow[]): MatchRow[] {
  return [...items].sort((a, b) => {
    const ta = MATCH_TYPES.indexOf(a.match_type);
    const tb = MATCH_TYPES.indexOf(b.match_type);
    return ta !== tb ? ta - tb : a.number - b.number;
  });
}

/** Tolerant of a match missing `slots` (the plan's own test fixture) — treated as none. */
async function loadAllMatches(rpc: Rpc, eventId: string): Promise<MatchRow[]> {
  const matches: MatchRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = (await rpc.call('listMatches', {
      event_id: eventId,
      ...(cursor ? { cursor } : {}),
    })) as
      | {
          items?: Array<Omit<MatchRow, 'slots'> & { slots?: MatchRow['slots'] }>;
          next_cursor?: string | null;
        }
      | undefined;
    for (const item of page?.items ?? []) {
      matches.push({ ...item, slots: item.slots ?? [] } as MatchRow);
    }
    if (!page?.next_cursor || matches.length >= MAX_LISTED_MATCHES) return matches;
    cursor = page.next_cursor;
  }
}

async function loadData(
  rpc: Rpc,
  eventId: string,
): Promise<{ matches: MatchRow[]; roster: RosterRow[]; teams: TeamRow[] }> {
  const [matches, rosterOut, teams] = await Promise.all([
    loadAllMatches(rpc, eventId),
    rpc.call('listEventRoster', { event_id: eventId }) as Promise<{ items: RosterRow[] }>,
    loadAllTeams(rpc),
  ]);
  return { matches: sortMatches(matches), roster: rosterOut.items ?? [], teams };
}

/** "Created 1 playoff match." / "Created 0 playoff matches; 1 already existed." */
function bulkResultLine({
  type,
  requested,
  created,
}: {
  type: MatchType;
  requested: number;
  created: number;
}): string {
  const noun = `${MATCH_TYPE_LABEL[type].toLowerCase()} ${created === 1 ? 'match' : 'matches'}`;
  return created < requested
    ? `Created ${created} ${noun}; ${requested - created} already existed.`
    : `Created ${created} ${noun}.`;
}

function rosterOptionLabel(r: { number?: number; name?: string }): string {
  return `${r.number ?? ''} ${r.name ?? ''}`.trim() || 'Unnamed team';
}

export function MatchesPanel({ eventId, rpc = adminRpc }: { eventId: string; rpc?: Rpc }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /**
   * Every match with a slot request in flight (branch review, finding 3). One shared value
   * let a finishing request re-enable ANOTHER match's row while its own request was still
   * out, and that row's next change then sent a stale full slot set, which the server
   * applies as a replacement, silently clearing a slot.
   */
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const matchTypeId = useId();

  // The type both create forms use — one selector above them, so the bulk form can never
  // quietly create a different type from the one the admin chose.
  const [matchType, setMatchType] = useState<MatchType>('qualification');

  // Bulk create (by count).
  const [bulkCount, setBulkCount] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    type: MatchType;
    requested: number;
    created: number;
  } | null>(null);

  // Single create (one match of the chosen type and a number).
  const [singleNumber, setSingleNumber] = useState('');
  const [singleBusy, setSingleBusy] = useState(false);

  // Correct a match's type and/or number.
  const [editing, setEditing] = useState<MatchRow | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  // Delete, behind the single destructive pattern (SPEC-FINAL 17.8). The refusal surfaces
  // through the dialog's own `error` slot (as UserDetailPage's DisableSection does), not
  // the panel's shared alert — the two must never both render at once.
  const [confirming, setConfirming] = useState<MatchRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    loadData(rpc, eventId).then(
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

  async function submitBulk(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBulkResult(null);
    // Only the user-entered field is run through the shared schema — `eventId` is an
    // internal row id, not user input (SeasonsPanel/EventsPanel's own pattern), and here
    // it is also not a real uuid in the plan's own test fixtures. `createMatchInput` is a
    // `.strict().refine(...)` (`ZodEffects`, not a `ZodObject`), so its per-field shape is
    // reached through `.innerType()` — `.shape` is not defined directly on it.
    const checked = createMatchInput.innerType().shape.count.safeParse(Number(bulkCount));
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    // `count` is `.optional()` on the shared schema (it is one of two mutually exclusive
    // fields on `createMatchInput`), so its own parsed type is `number | undefined` even
    // though this form always supplies one.
    const count = checked.data ?? 0;
    setBulkBusy(true);
    try {
      const out = (await rpc.call('createMatch', {
        event_id: eventId,
        match_type: matchType,
        count,
      })) as { created: number } | undefined;
      setBulkResult({ type: matchType, requested: count, created: out?.created ?? 0 });
      reload();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function submitSingle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = createMatchInput.innerType().shape.number.safeParse(Number(singleNumber));
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    setSingleBusy(true);
    try {
      await rpc.call('createMatch', {
        event_id: eventId,
        match_type: matchType,
        number: checked.data,
      });
      setSingleNumber('');
      reload();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setSingleBusy(false);
    }
  }

  /** `setMatchTeams` replaces the whole slot set (task 1.21 addendum): always send every
   * current slot, with only the one station changed or cleared — never just that slot,
   * or every other station is silently cleared. */
  async function changeSlot(
    match: MatchRow,
    alliance: Alliance,
    station: 1 | 2 | 3,
    teamId: string,
  ) {
    const others = match.slots.filter((s) => !(s.alliance === alliance && s.station === station));
    const slots = teamId ? [...others, { alliance, station, team_id: teamId }] : others;
    setBusyIds((prev) => new Set(prev).add(match.id));
    setError(null);
    const adopt = (row: MatchRow) =>
      setLoad((prev) =>
        prev.status === 'ready'
          ? { ...prev, matches: prev.matches.map((m) => (m.id === row.id ? row : m)) }
          : prev,
      );
    try {
      const updated = (await rpc.call('setMatchTeams', { match_id: match.id, slots })) as
        MatchRow | undefined;
      // Only this match's own answer is adopted, and only onto this match.
      if (updated?.id === match.id) adopt({ ...updated, slots: updated.slots ?? [] });
    } catch (e) {
      setError(panelErrorLine(e));
      // Refused or unanswered: what the server holds for this match is unknown here, so
      // it is listed again rather than trusting the slots on screen.
      try {
        const fresh = (await loadAllMatches(rpc, eventId)).find((m) => m.id === match.id);
        if (fresh) adopt(fresh);
      } catch {
        // Still unreachable: the error line above already says so.
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(match.id);
        return next;
      });
    }
  }

  async function submitEdit(match: MatchRow, patch: { match_type?: MatchType; number?: number }) {
    setError(null);
    setEditBusy(true);
    try {
      const updated = (await rpc.call('updateMatch', { match_id: match.id, ...patch })) as MatchRow;
      setLoad((prev) =>
        prev.status === 'ready'
          ? {
              ...prev,
              matches: sortMatches(prev.matches.map((m) => (m.id === updated.id ? updated : m))),
            }
          : prev,
      );
      setEditing(null);
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await rpc.call('deleteMatch', { match_id: confirming.id });
      const deletedId = confirming.id;
      setLoad((prev) =>
        prev.status === 'ready'
          ? { ...prev, matches: prev.matches.filter((m) => m.id !== deletedId) }
          : prev,
      );
      setConfirming(null);
    } catch (e) {
      setDeleteError(panelErrorLine(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={2}
        detail="Matches live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={2}
        title="Matches did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }

  const typeWord = MATCH_TYPE_LABEL[matchType].toLowerCase();
  const teamsById = load.status === 'ready' ? new Map(load.teams.map((t) => [t.id, t])) : new Map();
  const rosterIds =
    load.status === 'ready' ? new Set(load.roster.map((r) => r.team_id)) : new Set<string>();

  return (
    <section aria-label="Matches">
      <SectionHeader title="Matches" />

      <div className="mt-4 w-40">
        <Label htmlFor={matchTypeId}>Match type</Label>
        <NativeSelect
          id={matchTypeId}
          value={matchType}
          wrapperClassName="mt-1.5"
          onChange={(e) => setMatchType(e.target.value as MatchType)}
        >
          {MATCH_TYPES.map((t) => (
            <option key={t} value={t}>
              {MATCH_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <form
        aria-label={`Bulk create ${typeWord} matches`}
        noValidate
        onSubmit={(e) => void submitBulk(e)}
        className="tap-row mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="w-56">
          <NumberField
            label={`How many ${typeWord} matches?`}
            value={bulkCount}
            onChange={setBulkCount}
            max={MATCH_BULK_MAX}
          />
        </div>
        <button type="submit" disabled={bulkBusy} className={PRIMARY_BUTTON}>
          {bulkBusy ? 'Creating…' : 'Create matches'}
        </button>
      </form>
      {bulkResult && (
        <p role="status" className="mt-2 text-sm">
          {bulkResultLine(bulkResult)}
        </p>
      )}

      <form
        aria-label="Create one match"
        noValidate
        onSubmit={(e) => void submitSingle(e)}
        className="tap-row mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="w-32">
          <NumberField
            label="Match number"
            value={singleNumber}
            onChange={setSingleNumber}
            max={MATCH_NUMBER_MAX}
          />
        </div>
        <button type="submit" disabled={singleBusy} className={SECONDARY_BUTTON}>
          {singleBusy ? 'Creating…' : 'Create match'}
        </button>
      </form>

      <FormError message={error} />

      {load.status === 'loading' ? (
        <p className="mt-4 text-text-muted">Loading the matches…</p>
      ) : load.matches.length === 0 ? (
        <p className="mt-4 text-text-muted">No matches yet.</p>
      ) : (
        <Table containerClassName="mt-4 rounded-xl border border-border bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead numeric>Match</TableHead>
              <TableHead>Red 1</TableHead>
              <TableHead>Red 2</TableHead>
              <TableHead>Red 3</TableHead>
              <TableHead>Blue 1</TableHead>
              <TableHead>Blue 2</TableHead>
              <TableHead>Blue 3</TableHead>
              <TableHead>Edit</TableHead>
              <TableHead>Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {load.matches.map((match) => (
              <MatchRowView
                key={match.id}
                match={match}
                label={matchLabel(match)}
                roster={load.roster}
                teamsById={teamsById}
                rosterIds={rosterIds}
                busy={busyIds.has(match.id)}
                onSlotChange={(alliance, station, teamId) =>
                  void changeSlot(match, alliance, station, teamId)
                }
                onEdit={() => setEditing(match)}
                onDelete={() => {
                  setDeleteError(null);
                  setConfirming(match);
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <EditMatchForm
          match={editing}
          busy={editBusy}
          onSubmit={(patch) => void submitEdit(editing, patch)}
          onCancel={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this match?"
        objectName={confirming ? matchLabel(confirming) : ''}
        body="This removes the match. It is refused when the match already has entries recorded — correct the match instead."
        confirmLabel="Delete"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(null)}
      />
    </section>
  );
}

function MatchRowView({
  match,
  label,
  roster,
  teamsById,
  rosterIds,
  busy,
  onSlotChange,
  onEdit,
  onDelete,
}: {
  match: MatchRow;
  label: string;
  roster: RosterRow[];
  teamsById: Map<string, TeamRow>;
  rosterIds: Set<string>;
  busy: boolean;
  onSlotChange: (alliance: Alliance, station: 1 | 2 | 3, teamId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const slotsByStation = new Map(match.slots.map((s) => [`${s.alliance} ${s.station}`, s.team_id]));
  return (
    <TableRow className="align-top">
      <TableCell className="font-medium">{label}</TableCell>
      {STATIONS.map(({ alliance, station }) => {
        const key = `${alliance} ${station}`;
        const teamId = slotsByStation.get(key) ?? '';
        // The team may have since left the event roster (task 1.21 addendum): its slot is
        // kept by the server, and this still shows it — named from the global registry —
        // flagged, rather than silently hiding or blanking a filled station.
        const offRosterTeam = teamId && !rosterIds.has(teamId) ? teamsById.get(teamId) : undefined;
        return (
          <TableCell key={key}>
            <NativeSelect
              aria-label={`${label} ${key}`}
              value={teamId}
              disabled={busy}
              className="min-w-32"
              onChange={(e) => onSlotChange(alliance, station, e.target.value)}
            >
              <option value="">—</option>
              {roster.map((r) => (
                <option key={r.team_id} value={r.team_id} dir="auto">
                  {rosterOptionLabel(r)}
                </option>
              ))}
              {offRosterTeam && (
                <option key={offRosterTeam.id} value={offRosterTeam.id} dir="auto">
                  {rosterOptionLabel(offRosterTeam)}
                </option>
              )}
            </NativeSelect>
            {offRosterTeam && (
              <Notice tone="warning" still className="mt-1 px-2 py-1 text-xs">
                {`${offRosterTeam.number} is not on this event's roster`}
              </Notice>
            )}
          </TableCell>
        );
      })}
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit match ${match.number} (${match.match_type})`}
          title={`Edit match ${match.number} (${match.match_type})`}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          className="text-danger"
          aria-label={`Delete match ${match.number} (${match.match_type})`}
          title={`Delete match ${match.number} (${match.match_type})`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EditMatchForm({
  match,
  busy,
  onSubmit,
  onCancel,
}: {
  match: MatchRow;
  busy: boolean;
  onSubmit: (patch: { match_type?: MatchType; number?: number }) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const typeId = useId();
  const [type, setType] = useState<MatchType>(match.match_type);
  const [number, setNumber] = useState(String(match.number));
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    // Only the changed, user-entered fields are checked, each against the same rule the
    // create schema applies to it (SeasonForm's own pattern) — `match.id` is an internal
    // row id, not user input, so the full `updateMatchInput` (which also wants a uuid) is
    // never run against the whole payload.
    const patch: { match_type?: MatchType; number?: number } = {};
    if (type !== match.match_type) patch.match_type = type;
    const parsedNumber = Number(number);
    if (parsedNumber !== match.number) {
      const checkedNumber = updateMatchInput.innerType().shape.number.safeParse(parsedNumber);
      if (!checkedNumber.success) {
        setLocalError(checkedNumber.error.issues[0]?.message ?? 'that is not valid');
        return;
      }
      patch.number = checkedNumber.data;
    }
    if (Object.keys(patch).length === 0) {
      setLocalError('Change something before saving.');
      return;
    }
    onSubmit(patch);
  }

  return (
    <Card className="mt-4 max-w-sm">
      <form aria-labelledby={titleId} noValidate onSubmit={submit}>
        <CardTitle id={titleId} level={3}>
          {`Edit match ${match.number} (${match.match_type})`}
        </CardTitle>
        <div className="mt-4">
          <Label htmlFor={typeId}>Match type</Label>
          <NativeSelect
            id={typeId}
            value={type}
            wrapperClassName="mt-1.5"
            onChange={(e) => setType(e.target.value as MatchType)}
          >
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {MATCH_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <NumberField
          label="Match number"
          value={number}
          onChange={setNumber}
          max={MATCH_NUMBER_MAX}
        />
        <FormError message={localError} />
        <div className="tap-row mt-4 flex gap-2">
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" disabled={busy} className={SECONDARY_BUTTON} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

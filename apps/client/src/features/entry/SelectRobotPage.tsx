import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';
import { canSelfEdit, editableUntil, localEntries, type LocalEntry } from './localEntries';

type MatchRow = { id: string; event_id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type SlotRow = { match_id: string; alliance: 'red' | 'blue'; team_id: string };
type RosterRow = { event_id: string; team_id: string; deleted_at: string | null };

export function SelectRobotPage({
  eventId,
  authorUserId,
}: {
  eventId: string;
  authorUserId: string;
}) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [roster, setRoster] = useState<TeamRow[]>([]);
  const [matchType, setMatchType] = useState('qualification');
  const [number, setNumber] = useState('');
  const [alliance, setAlliance] = useState<'red' | 'blue' | null>(null);
  const [teamId, setTeamId] = useState('');
  const [entries, setEntries] = useState<LocalEntry[]>([]);

  useEffect(() => {
    void (async () => {
      setMatches((await cachedRows<MatchRow>('matches')).filter((m) => m.event_id === eventId));
      setSlots(await cachedRows<SlotRow>('match_teams'));
      const teamById = new Map((await cachedRows<TeamRow>('teams')).map((t) => [t.id, t]));
      const live = (await cachedRows<RosterRow>('event_teams')).filter(
        (r) => r.event_id === eventId && r.deleted_at == null,
      );
      setRoster(live.map((r) => teamById.get(r.team_id)).filter((t): t is TeamRow => Boolean(t)));
      setEntries((await localEntries(eventId)).filter((e) => e.form_kind === 'match'));
    })();
  }, [eventId]);

  const parsed = Number(number);
  const existing = matches.find((m) => m.match_type === matchType && m.number === parsed);
  const listed = existing
    ? slots
        .filter((s) => s.match_id === existing.id && s.alliance === alliance)
        .map((s) => s.team_id)
    : [];
  const choices = listed.length > 0 ? roster.filter((t) => listed.includes(t.id)) : roster;
  const ready = alliance !== null && parsed > 0;

  // A robot this device already holds an entry for, in this match, is never offered for
  // a second one (SPEC-FINAL 8.1, following the super-entry rule): it opens the existing
  // entry while the self-edit window (7.6) is open, and is shown locked after it.
  // Cross-device duplicates are not visible here and stay with the conflict path (9.5).
  const now = new Date();
  const scouted = new Map(
    existing ? entries.filter((e) => e.match_id === existing.id).map((e) => [e.team_id, e]) : [],
  );
  const isLocked = (id: string) => {
    const entry = scouted.get(id);
    return entry !== undefined && !canSelfEdit(entry, authorUserId, now);
  };

  // A robot chosen before the alliance or match changed may no longer be on the list.
  const chosen = ready ? choices.find((t) => t.id === teamId && !isLocked(t.id)) : undefined;
  const chosenEntry = chosen ? scouted.get(chosen.id) : undefined;

  function optionLabel(team: TeamRow): string {
    const name = `${formatCount(team.number)} ${team.name}`;
    const entry = scouted.get(team.id);
    if (!entry) return name;
    if (isLocked(team.id)) return `${name} — already scouted, locked`;
    const until = editableUntil(entry).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${name} — already scouted, editable until ${until}`;
  }

  function start() {
    if (!alliance || !chosen) return;
    const team = chosen;
    // Editing keeps the alliance the entry was recorded with.
    const side = chosenEntry?.alliance ?? alliance;
    void ensureMatchLocally().then((matchId) =>
      navigate(`/entry/${matchId}/${team.id}?alliance=${side}`),
    );
  }

  /**
   * SPEC-FINAL 6.4: a system action, not an admin capability. It creates the minimal row
   * — event, type, number, nothing else — rides the outbox, and works offline.
   */
  async function ensureMatchLocally(): Promise<string> {
    if (existing) return existing.id;
    const rowId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = { event_id: eventId, match_type: matchType, number: parsed };
    await enqueue({
      op_id: crypto.randomUUID(),
      entity: 'match',
      row_id: rowId,
      action: 'create',
      base_version: null,
      payload,
      author_user_id: authorUserId,
      client_created_at: now,
      client_updated_at: now,
      seq: await nextSeq(),
    });
    // Optimistic local write, so the picker and the entry screen see it at once.
    const localMatch: MatchRow = { id: rowId, ...payload };
    await db.rows.put({ ...localMatch, entity: 'matches', version: 1, updated_at: now });
    setMatches((current) => [...current, localMatch]);
    return rowId;
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <label className="block py-2">
        <span className="text-sm font-medium">Match type</span>
        <select
          className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          value={matchType}
          onChange={(e) => setMatchType(e.target.value)}
        >
          <option value="qualification">Qualification</option>
          <option value="practice">Practice</option>
          <option value="playoff">Playoff</option>
        </select>
      </label>

      <label className="block py-2">
        <span className="text-sm font-medium">Match number</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
      </label>

      {parsed > 0 && !existing && (
        <p role="status" className="rounded-lg border border-[var(--border)] p-2 text-sm">
          Match {formatCount(parsed)} is not on this device yet. It will be created when you submit
          — keep scouting.
        </p>
      )}

      <fieldset role="group" aria-label="Alliance" className="py-2">
        <legend className="text-sm font-medium">Alliance</legend>
        <div className="tap-row mt-1 flex">
          {(['red', 'blue'] as const).map((side) => (
            <label
              key={side}
              className="tap-target flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)]"
            >
              <input
                type="radio"
                name="alliance"
                aria-label={side}
                checked={alliance === side}
                onChange={() => setAlliance(side)}
              />
              <span className="capitalize">{side}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block py-2">
        <span className="text-sm font-medium">Robot</span>
        {/* Native, so a phone shows its own picker rather than a 30-row scroll. */}
        <select
          className="tap-target mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          value={chosen?.id ?? ''}
          disabled={!ready}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="" disabled>
            {ready ? 'Choose a robot' : 'Choose a match and alliance first'}
          </option>
          {choices.map((team) => (
            <option key={team.id} value={team.id} dir="auto" disabled={isLocked(team.id)}>
              {optionLabel(team)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={!chosen}
        className="tap-target mt-2 w-full rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)] disabled:opacity-50"
        onClick={start}
      >
        {chosenEntry ? 'Edit the existing entry' : 'Start entry'}
      </button>
      {chosenEntry && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This robot is already scouted in this match on this device. You can change that entry
          until{' '}
          {editableUntil(chosenEntry).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          ; a second one cannot be started.
        </p>
      )}
    </main>
  );
}

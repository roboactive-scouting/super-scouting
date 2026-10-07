import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { ChoiceGroup } from '@/components/entry/ChoiceGroup';
import { StickyActionBar } from '@/components/entry/StickyActionBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Notice } from '@/components/ui/notice';
import { cachedRows } from '@/data/cache';
import { notifyChanged } from '@/data/changes';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';
import {
  canSelfEdit,
  editableUntil,
  editsAnyTime,
  localEntries,
  type Editor,
  type LocalEntry,
} from './localEntries';
import { entryPath } from '@/lib/paths';

type MatchRow = { id: string; event_id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type SlotRow = { match_id: string; alliance: 'red' | 'blue'; team_id: string };
type RosterRow = { event_id: string; team_id: string; deleted_at: string | null };

/** What EntryRoute hands back through router state after a submit (SPEC-FINAL 8.1). */
export type SavedNotice = { matchLabel: string; teamLabel: string; edited: boolean };

const ALLIANCES = [
  { value: 'red', label: 'Red', ariaLabel: 'red', accent: 'var(--alliance-red)' },
  { value: 'blue', label: 'Blue', ariaLabel: 'blue', accent: 'var(--alliance-blue)' },
] as const;

export function SelectRobotPage({ eventId, author }: { eventId: string; author: Editor }) {
  const navigate = useNavigate();
  const saved = (useLocation().state as { saved?: SavedNotice } | null)?.saved;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [roster, setRoster] = useState<TeamRow[]>([]);
  const [matchType, setMatchType] = useState('qualification');
  const [number, setNumber] = useState('');
  const [alliance, setAlliance] = useState<'red' | 'blue' | null>(null);
  const [teamId, setTeamId] = useState('');
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const typeId = useId();
  const numberId = useId();
  const robotId = useId();

  useEffect(() => {
    void (async () => {
      // One read, one state update, so the page is never half-loaded.
      const [allMatches, allSlots, teams, eventTeams, allEntries] = await Promise.all([
        cachedRows<MatchRow>('matches'),
        cachedRows<SlotRow>('match_teams'),
        cachedRows<TeamRow>('teams'),
        cachedRows<RosterRow>('event_teams'),
        localEntries(eventId),
      ]);
      const teamById = new Map(teams.map((t) => [t.id, t]));
      const live = eventTeams.filter((r) => r.event_id === eventId && r.deleted_at == null);
      setMatches(allMatches.filter((m) => m.event_id === eventId));
      setSlots(allSlots);
      setRoster(live.map((r) => teamById.get(r.team_id)).filter((t): t is TeamRow => Boolean(t)));
      setEntries(allEntries.filter((e) => e.form_kind === 'match'));
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
    return entry !== undefined && !canSelfEdit(entry, author, now);
  };

  // A robot chosen before the alliance or match changed may no longer be on the list.
  const chosen = ready ? choices.find((t) => t.id === teamId && !isLocked(t.id)) : undefined;
  const chosenEntry = chosen ? scouted.get(chosen.id) : undefined;

  function optionLabel(team: TeamRow): string {
    const name = `${formatCount(team.number)} ${team.name}`;
    const entry = scouted.get(team.id);
    if (!entry) return name;
    if (isLocked(team.id)) return `${name} — already scouted, locked`;
    // A lead or admin edits at any time (SPEC-FINAL 7.6): there is no window to name.
    if (editsAnyTime(author)) return `${name} — already scouted`;
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
    void ensureMatchLocally().then((matchId) => navigate(entryPath(matchId, team.id, side)));
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
      author_user_id: author.id,
      client_created_at: now,
      client_updated_at: now,
      seq: await nextSeq(),
    });
    // Optimistic local write, so the picker and the entry screen see it at once.
    const localMatch: MatchRow = { id: rowId, ...payload };
    await db.rows.put({ ...localMatch, entity: 'matches', version: 1, updated_at: now });
    notifyChanged('rows');
    setMatches((current) => [...current, localMatch]);
    return rowId;
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6">
      {saved && (
        // Static on purpose (SPEC-FINAL 17.9): the confirmation stands still on the entry path.
        // Submitting only queues the entry; the connection indicator owns sync state.
        <Notice role="status" aria-label="Entry saved" tone="success" still className="mb-5">
          <p className="font-semibold">
            {saved.edited ? 'Changes saved on this device' : 'Entry saved on this device'}
          </p>
          <p className="mt-1">
            {saved.matchLabel} · <span dir="auto">{saved.teamLabel}</span>
          </p>
          <p className="mt-1 text-text-muted">
            It is queued to send and stays safe here with no network.
          </p>
        </Notice>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Scout a match</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={typeId}>Match type</Label>
          <NativeSelect
            id={typeId}
            wrapperClassName="mt-1.5"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
          >
            <option value="qualification">Qualification</option>
            <option value="practice">Practice</option>
            <option value="playoff">Playoff</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={numberId}>Match number</Label>
          <Input
            id={numberId}
            type="number"
            min={1}
            inputMode="numeric"
            className="mt-1.5 text-xl font-semibold tabular-nums"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      </div>

      {parsed > 0 && !existing && (
        <Notice role="status" className="mt-4">
          Match {formatCount(parsed)} is not on this device yet. It will be created when you submit
          — keep scouting.
        </Notice>
      )}

      <div className="mt-6">
        <ChoiceGroup
          legend="Alliance"
          name="alliance"
          value={alliance}
          options={ALLIANCES}
          onChange={(side) => setAlliance(side)}
        />
      </div>

      <div className="mt-6">
        <Label htmlFor={robotId}>Robot</Label>
        {/* Native, so a phone shows its own picker rather than a 30-row scroll. */}
        <NativeSelect
          id={robotId}
          wrapperClassName="mt-1.5"
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
        </NativeSelect>
      </div>

      {chosenEntry && (
        <p className="mt-3 text-sm text-text-muted">
          {editsAnyTime(author)
            ? 'This robot is already scouted in this match on this device. You can change that entry; a second one cannot be started.'
            : `This robot is already scouted in this match on this device. You can change that entry until ${editableUntil(
                chosenEntry,
              ).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}; a second one cannot be started.`}
        </p>
      )}

      <StickyActionBar>
        <Button variant="primary" size="block" disabled={!chosen} onClick={start}>
          {chosenEntry ? 'Edit the existing entry' : 'Start entry'}
        </Button>
      </StickyActionBar>
    </main>
  );
}

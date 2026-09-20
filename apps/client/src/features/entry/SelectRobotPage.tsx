import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCount } from '@frc/shared';
import { cachedRows } from '@/data/cache';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';

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

  useEffect(() => {
    void (async () => {
      setMatches((await cachedRows<MatchRow>('matches')).filter((m) => m.event_id === eventId));
      setSlots(await cachedRows<SlotRow>('match_teams'));
      const teamById = new Map((await cachedRows<TeamRow>('teams')).map((t) => [t.id, t]));
      const live = (await cachedRows<RosterRow>('event_teams')).filter(
        (r) => r.event_id === eventId && r.deleted_at == null,
      );
      setRoster(live.map((r) => teamById.get(r.team_id)).filter((t): t is TeamRow => Boolean(t)));
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

      <fieldset className="py-2" disabled={alliance === null || parsed <= 0}>
        <legend className="text-sm font-medium">Robot</legend>
        <div className="mt-1 grid gap-2">
          {choices.map((team) => (
            <button
              key={team.id}
              type="button"
              className="tap-target rounded-lg border border-[var(--border)] px-3 text-left"
              onClick={() => {
                if (!alliance) return;
                void ensureMatchLocally().then((matchId) =>
                  navigate(`/entry/${matchId}/${team.id}?alliance=${alliance}`),
                );
              }}
            >
              <span dir="auto">
                {formatCount(team.number)} {team.name}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </main>
  );
}

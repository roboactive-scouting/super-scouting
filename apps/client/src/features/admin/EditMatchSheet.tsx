import { useRef, useState } from 'react';
import {
  MATCH_NUMBER_MAX,
  type MatchRow,
  type MatchSlot,
  type MatchType,
  type RosterRow,
} from '@frc/shared';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorLine } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { matchLabel } from '@/lib/matchLabel';
import {
  MATCH_TYPE_OPTIONS,
  matchPatch,
  notOnRosterLine,
  STATIONS,
  withSlot,
  type MatchPatch,
} from './matchOps';
import { TeamField, type TeamFieldHandle } from './TeamField';
import type { TeamLookup } from './useOffRosterTeams';

const SECTION = 'mt-3 mb-1.5 text-xs font-[650] text-muted';

/**
 * The phone's "Edit a match" sheet (README): six typed stations, Red 1–3 beside Blue 1–3,
 * with roster suggestions; the match type and number; Save changes and Delete match.
 * Nothing is sent until Save changes; the line-up then goes as one full slot set. A
 * station still holding a number that is not on the roster stops Save with that line.
 */
export function EditMatchSheet({
  match,
  roster,
  teams,
  rosterIds,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  match: MatchRow;
  roster: readonly RosterRow[];
  teams: TeamLookup;
  rosterIds: ReadonlySet<string>;
  error: string | null;
  /** Resolves true when saved; the sheet then closes. */
  onSave: (slots: MatchSlot[], patch: MatchPatch) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const label = matchLabel(match);
  const [slots, setSlotsState] = useState<MatchSlot[]>(match.slots);
  const slotsRef = useRef(slots);
  /** Station label → the unknown number it still holds. */
  const unresolved = useRef(new Map<string, string>());
  /** Station label → its field, so Save commits what is typed (no blur needed first). */
  const fields = useRef(new Map<string, TeamFieldHandle>());
  const [type, setType] = useState<MatchType>(match.match_type);
  const [number, setNumber] = useState(String(match.number));
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    // iOS Safari may fire the tap before the field's blur: commit every station first.
    for (const field of fields.current.values()) field.commit();
    const [held] = unresolved.current.values();
    if (held !== undefined) return setLocalError(notOnRosterLine(held));
    setLocalError(null);
    const checked = matchPatch(match, type, number);
    if ('error' in checked) return setLocalError(checked.error);
    setBusy(true);
    const saved = await onSave(slotsRef.current, checked.patch);
    setBusy(false);
    if (saved) onClose();
  }

  const line = localError ?? error;
  return (
    // initialFocus 'panel': nothing is focused on open, so no keyboard, no zoom and no scroll
    // to a field (UF.9). The user picks what to edit.
    <Sheet
      open
      side="bottom"
      title={`Edit ${label}`}
      onClose={onClose}
      dismissible={!busy}
      initialFocus="panel"
    >
      <p className={SECTION}>Line-up · type a team number</p>
      <div className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-2">
        {STATIONS.map(({ alliance, station, label: where }) => {
          const teamId = slots.find(
            (s) => s.alliance === alliance && s.station === station,
          )?.team_id;
          return (
            <TeamField
              key={where}
              label={where}
              alliance={alliance}
              teamId={teamId ?? null}
              teams={teams}
              roster={roster}
              offRoster={teamId !== undefined && !rosterIds.has(teamId)}
              countLine={(n) => `${n} on the roster`}
              holdUnknown
              handle={(h) => {
                if (h) fields.current.set(where, h);
                else fields.current.delete(where);
              }}
              onCommit={(typed) => {
                if (typed.kind === 'unknown') {
                  unresolved.current.set(where, typed.text);
                  return setLocalError(notOnRosterLine(typed.text));
                }
                unresolved.current.delete(where);
                const [still] = unresolved.current.values();
                setLocalError(still === undefined ? null : notOnRosterLine(still));
                const next = withSlot(
                  slotsRef.current,
                  alliance,
                  station,
                  typed.kind === 'team' ? typed.teamId : null,
                );
                slotsRef.current = next;
                setSlotsState(next);
              }}
            />
          );
        })}
      </div>
      <p className={SECTION}>Match</p>
      <div className="flex gap-2">
        <Select
          aria-label="Match type"
          value={type}
          wrapperClassName="min-w-0 flex-1"
          onChange={(e) => setType(e.target.value as MatchType)}
        >
          {MATCH_TYPE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Match number"
          type="number"
          inputMode="numeric"
          min={1}
          max={MATCH_NUMBER_MAX}
          mono
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="flex-1"
        />
      </div>
      {line && <ErrorLine className="mt-3">{line}</ErrorLine>}
      <Button
        variant="primary"
        size="block"
        className="mt-3.5"
        busy={busy}
        busyLabel="Saving…"
        onClick={() => void save()}
      >
        Save changes
      </Button>
      <Button variant="ghost" className="mt-1.5 mb-4 w-full" disabled={busy} onClick={onDelete}>
        <Trash2 aria-hidden="true" />
        Delete match
      </Button>
    </Sheet>
  );
}

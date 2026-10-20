import { FileText } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatTime } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { stationLabel } from '@/components/ui/tag';
import { Toast } from '@/components/ui/toast';
import { cachedLiveSlots, cachedRows } from '@/data/cache';
import { db, type DraftRecord } from '@/data/db';
import type { Station } from '@/data/station';
import { useDeviceQuery } from '@/data/useDeviceQuery';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { matchLabel } from '@/lib/matchLabel';
import { entryPath, superTeamPath } from '@/lib/paths';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { usePracticeMode } from './practice';

type MatchRow = { id: string; match_type: string; number: number };
type TeamRow = { id: string; number: number; name: string };
type FormRow = { id: string; active_version_id: string | null };
type FieldRow = { form_version_id: string };
type EntryRow = {
  form_kind: string;
  match_id: string | null;
  team_id: string;
  deleted_at: string | null;
  client_updated_at?: string | null;
  updated_at?: string | null;
};

/** A draft on offer, described from what the device holds. */
export type DraftOffer = {
  record: DraftRecord;
  kind: 'match' | 'super';
  /** "Q39"; null when the match is no longer on this device. */
  match: string | null;
  /** "1690 Orbit"; null when the team is no longer on this device. */
  team: string | null;
  station: Station | null;
  alliance: 'red' | 'blue';
  /** Where Resume goes: the entry for that match and robot, or the team's super entry. */
  path: string;
  /** Begun on a form version that is no longer the active one (it still opens on it). */
  olderVersion: boolean;
  /** The device no longer holds the fields of the version it was begun on. */
  formGone: boolean;
  /** Resume can open it: the device holds its match, its team and its version's fields. */
  resumable: boolean;
};

/**
 * When an entry last changed: the writing device's own time of the change, else (a row from
 * before that was kept) the server's. NaN when the row says neither.
 */
function changedAt(entry: EntryRow): number {
  return Date.parse(String(entry.client_updated_at ?? entry.updated_at ?? ''));
}

/**
 * Every unfinished draft on this device (SPEC-FINAL 8.3), newest first. Only `drafts` is read —
 * never `practiceDrafts` (8.5). The key says which kind: `<version>:super:<team>` or
 * `<version>:<match>:<team>`.
 *
 * A draft that cannot be resumed because its entry was saved after the draft's last change (the
 * same match, team and form kind on this device, on any form version) is deleted here, unasked
 * (UF.23): it would otherwise be offered forever. A draft for a version that is no longer active,
 * or a match or team the device no longer holds, is still offered, and says so.
 */
export async function unfinishedDrafts(): Promise<DraftOffer[]> {
  const drafts = await db.drafts.orderBy('updated_at').reverse().toArray();
  if (drafts.length === 0) return [];
  const [matches, teams, slots, entries, forms, fields] = await Promise.all([
    cachedRows<MatchRow>('matches'),
    cachedRows<TeamRow>('teams'),
    cachedLiveSlots<LineupSlot>(),
    cachedRows<EntryRow>('scouting_entries'),
    cachedRows<FormRow>('forms'),
    cachedRows<FieldRow>('form_fields'),
  ]);
  const held = new Set(fields.map((f) => f.form_version_id));
  const active = new Set(forms.map((f) => f.active_version_id));
  const describe = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.number} ${team.name}` : null;
  };

  const stale: DraftRecord[] = [];
  const offers: DraftOffer[] = [];
  for (const record of drafts) {
    const [version = '', middle = '', last = ''] = record.key.split(':');
    const kind = middle === 'super' ? 'super' : 'match';
    const teamId =
      kind === 'super' && typeof record.payload.team_id === 'string'
        ? record.payload.team_id
        : last;
    const draftAt = Date.parse(record.updated_at);
    const saved = entries.some(
      (e) =>
        e.deleted_at == null &&
        e.form_kind === kind &&
        e.team_id === teamId &&
        (kind === 'super' || e.match_id === middle) &&
        changedAt(e) > draftAt,
    );
    if (saved) {
      stale.push(record);
      continue;
    }
    const formGone = !held.has(version);
    const olderVersion = !formGone && !active.has(version);
    const team = describe(teamId);
    if (kind === 'super') {
      offers.push({
        record,
        kind,
        match: null,
        team,
        station: null,
        alliance: 'red',
        path: superTeamPath(teamId),
        olderVersion,
        formGone,
        resumable: team !== null && !formGone,
      });
      continue;
    }
    const match = matches.find((m) => m.id === middle);
    const station = stationOf(slots, middle, teamId);
    // A draft keeps the alliance it was opened with (task 1.37); an older one takes the line-up's.
    const savedSide = record.payload.alliance;
    const alliance =
      savedSide === 'red' || savedSide === 'blue'
        ? savedSide
        : station?.[0] === 'B'
          ? 'blue'
          : 'red';
    offers.push({
      record,
      kind,
      match: match ? matchLabel(match) : null,
      team,
      station,
      alliance,
      path: entryPath(middle, teamId, alliance),
      olderVersion,
      formGone,
      resumable: match !== undefined && team !== null && !formGone,
    });
  }
  if (stale.length > 0) {
    // Only the very record read: a draft changed since (another tab still editing) is kept.
    await db.transaction('rw', db.drafts, async () => {
      for (const record of stale) {
        const now = await db.drafts.get(record.key);
        if (now?.updated_at === record.updated_at) await db.drafts.delete(record.key);
      }
    });
  }
  return offers;
}

/** "11:42" today; "09/03/2026 11:42" on another day. */
function lastChange(iso: string, now = new Date()): string {
  const sameDay = formatDate(iso) === formatDate(now.toISOString());
  return sameDay ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`;
}

/** The sentences after "You have an unfinished entry:". */
function offerText(offer: DraftOffer): string {
  const when = `last change ${lastChange(offer.record.updated_at)}, on this device.`;
  const team = offer.team ?? 'a team no longer on this device';
  let text: string;
  if (offer.kind === 'super') {
    text = `${team} — ${when}`;
  } else {
    const side = offer.station
      ? stationLabel(offer.station)
      : offer.alliance === 'red'
        ? 'Red alliance'
        : 'Blue alliance';
    text = `${offer.match ?? 'a match no longer on this device'} · ${team}, ${side} — ${when}`;
  }
  if (offer.formGone) text += ' Its form is no longer on this device.';
  else if (offer.olderVersion) text += ' It was started on an older version of the form.';
  if (!offer.resumable) text += ' It can no longer be opened here.';
  return text;
}

/** "… and 2 more unfinished entries" under the one on offer (UF.23). */
function moreText(more: number): string {
  return `… and ${more} more unfinished ${more === 1 ? 'entry' : 'entries'}`;
}

/**
 * "You have an unfinished entry" at the top of Scout (SPEC-FINAL 8.3, v1.23; entry parts, "Draft
 * recovery"): the Note (3 px `--ink` edge) naming the entry, its station and its last change, with
 * **Resume** (opens it where it was: values, phase, match clock and stopwatches come back from
 * the draft) and **Discard** (deletes that draft only, then "Draft discarded · Undo" puts the very
 * record back). One offer at a time, the most recent; when more are waiting the Note says how
 * many (UF.23), and after a discard the next one is offered. A draft that can no longer be
 * opened here says so and offers Discard only. Nothing is offered in practice, and a practice
 * draft never is.
 */
export function DraftRecovery() {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const practice = usePracticeMode();
  const [version, setVersion] = useState(0);
  const [undo, setUndo] = useState<DraftRecord | null>(null);
  const dismiss = useCallback(() => setUndo(null), []);
  const offers = useDeviceQuery(unfinishedDrafts, [version], ['rows']);
  const offer = offers?.[0];
  const more = (offers?.length ?? 1) - 1;

  async function discard(record: DraftRecord) {
    await db.drafts.delete(record.key);
    setUndo(record);
    setVersion((v) => v + 1);
  }

  async function restore(record: DraftRecord) {
    await db.drafts.put(record);
    setVersion((v) => v + 1);
  }

  const toast = (
    <Toast
      // A second Discard is a new toast with its own time to Undo.
      key={undo?.key}
      open={undo !== null}
      message="Draft discarded"
      action={{ label: 'Undo', onClick: () => undo && void restore(undo) }}
      onDismiss={dismiss}
      className={
        desktop
          ? 'bottom-6 left-1/2 w-[22rem] -translate-x-1/2'
          : // Portaled to <body>, outside the shell's --bottom-bar: above the bottom bar, the raised
            // Scout button and the Start entry bar, measured on a 375 px phone.
            'inset-x-3 bottom-[calc(11rem+env(safe-area-inset-bottom))]'
      }
    />
  );

  if (practice || !offer) return toast;
  return (
    <>
      <section
        aria-label="Unfinished entry"
        className={cn(
          'mb-3.5 flex flex-col gap-2.5 rounded-control border border-s-[3px] border-line border-s-ink bg-surface p-3 lg:mb-0',
          desktop && 'flex-row items-center gap-4 px-4',
        )}
      >
        <p className="flex min-w-0 flex-1 items-start gap-2.5 text-[0.84375rem] leading-[1.4] text-ink-2">
          <FileText aria-hidden="true" className="mt-px size-[18px] shrink-0 text-ink" />
          <span dir="auto">
            <b className="font-bold text-ink">
              {offer.kind === 'super'
                ? 'You have an unfinished super entry:'
                : 'You have an unfinished entry:'}
            </b>{' '}
            {offerText(offer)}
            {more > 0 && <span className="mt-1 block font-medium text-ink">{moreText(more)}</span>}
          </span>
        </p>
        <div className="flex gap-2">
          <Button
            className={cn('min-h-11 flex-1', desktop && 'flex-none')}
            onClick={() => void discard(offer.record)}
          >
            Discard
          </Button>
          {offer.resumable && (
            <Button
              variant="primary"
              className={cn('min-h-11 flex-1', desktop && 'flex-none')}
              onClick={() => navigate(offer.path)}
            >
              Resume
            </Button>
          )}
        </div>
      </section>
      {toast}
    </>
  );
}

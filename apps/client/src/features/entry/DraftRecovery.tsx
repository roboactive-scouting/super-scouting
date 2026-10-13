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

/** The draft on offer, described from what the device holds. */
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
};

/**
 * The most recent unfinished draft on this device (SPEC-FINAL 8.3), or null. Only `drafts` is
 * read — never `practiceDrafts` (8.5) — and a submitted entry's draft is already gone (submit
 * clears it). The key says which kind: `<version>:super:<team>` or `<version>:<match>:<team>`.
 */
export async function latestDraft(): Promise<DraftOffer | null> {
  const record = await db.drafts.orderBy('updated_at').last();
  if (!record) return null;
  const [, middle = '', last = ''] = record.key.split(':');
  const [matches, teams, slots] = await Promise.all([
    cachedRows<MatchRow>('matches'),
    cachedRows<TeamRow>('teams'),
    cachedLiveSlots<LineupSlot>(),
  ]);
  const describe = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    return team ? `${team.number} ${team.name}` : null;
  };
  if (middle === 'super') {
    const teamId = typeof record.payload.team_id === 'string' ? record.payload.team_id : last;
    return {
      record,
      kind: 'super',
      match: null,
      team: describe(teamId),
      station: null,
      alliance: 'red',
      path: superTeamPath(teamId),
    };
  }
  const match = matches.find((m) => m.id === middle);
  const station = stationOf(slots, middle, last);
  // A draft keeps the alliance it was opened with (task 1.37); an older one takes the line-up's.
  const saved = record.payload.alliance;
  const alliance =
    saved === 'red' || saved === 'blue' ? saved : station?.[0] === 'B' ? 'blue' : 'red';
  return {
    record,
    kind: 'match',
    match: match ? matchLabel(match) : null,
    team: describe(last),
    station,
    alliance,
    path: entryPath(middle, last, alliance),
  };
}

/** "11:42" today; "09/03/2026 11:42" on another day. */
function lastChange(iso: string, now = new Date()): string {
  const sameDay = formatDate(iso) === formatDate(now.toISOString());
  return sameDay ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`;
}

/** The sentence after "You have an unfinished entry:". */
function offerText(offer: DraftOffer): string {
  const when = `last change ${lastChange(offer.record.updated_at)}, on this device.`;
  const team = offer.team ?? 'a team no longer on this device';
  if (offer.kind === 'super') return `${team} — ${when}`;
  const side = offer.station
    ? stationLabel(offer.station)
    : offer.alliance === 'red'
      ? 'Red alliance'
      : 'Blue alliance';
  return `${offer.match ?? 'a match no longer on this device'} · ${team}, ${side} — ${when}`;
}

/**
 * "You have an unfinished entry" at the top of Scout (SPEC-FINAL 8.3, v1.23; entry parts, "Draft
 * recovery"): the Note (3 px `--ink` edge) naming the entry, its station and its last change, with
 * **Resume** (opens it where it was: values, phase, match clock and stopwatches come back from
 * the draft) and **Discard** (deletes that draft only, then "Draft discarded · Undo" puts the very
 * record back). One offer at a time, the most recent; after a discard the next one, if any, is
 * offered. Nothing is offered in practice, and a practice draft never is.
 */
export function DraftRecovery() {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const practice = usePracticeMode();
  const [version, setVersion] = useState(0);
  const [undo, setUndo] = useState<DraftRecord | null>(null);
  const dismiss = useCallback(() => setUndo(null), []);
  const offer = useDeviceQuery(latestDraft, [version], ['rows']);

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
          </span>
        </p>
        <div className="flex gap-2">
          <Button
            className={cn('min-h-11 flex-1', desktop && 'flex-none')}
            onClick={() => void discard(offer.record)}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            className={cn('min-h-11 flex-1', desktop && 'flex-none')}
            onClick={() => navigate(offer.path)}
          >
            Resume
          </Button>
        </div>
      </section>
      {toast}
    </>
  );
}

import { formatCount } from '@frc/shared';
import { Link } from 'react-router-dom';
import { StatTile } from '@/components/ui/stat-tile';
import { StationPill } from '@/components/ui/station-pill';
import type { Station } from '@/data/station';
import { entryPath } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { agoText, phoneSyncLine, syncNote, type LastEntry } from './homeData';

type Sync = { waiting: number; lastSyncAt: string | null };

/** An inline link with the 48 px hit area grown by an invisible ::after. */
const OPEN =
  "relative font-semibold text-accent-ink after:absolute after:-inset-x-2 after:-inset-y-4 after:content-['']";

function OpenLink({ entry, arrow = false }: { entry: LastEntry; arrow?: boolean }) {
  return (
    <Link
      to={entryPath(entry.matchId, entry.teamId, entry.alliance)}
      aria-label={`Open ${entry.match} · ${formatCount(entry.teamNumber)}`}
      className={OPEN}
    >
      Open{arrow ? ' ›' : ''}
    </Link>
  );
}

/**
 * The station opens Scout's station picker (SPEC-FINAL 17.9, UF.7). The pill keeps its look;
 * an invisible ::after grows the hit area to 48 px, like the Open link.
 */
function StationValue({ station, onChange }: { station: Station | null; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "hover-veil my-2 block w-fit rounded-full after:absolute after:-inset-2 after:content-['']",
        !station && 'font-sans text-[0.9375rem] font-semibold text-accent-ink after:-inset-y-4',
      )}
    >
      {station ? <StationPill station={station} /> : 'Choose'}
      <span className="sr-only">{station ? ' · Change station' : ' your station'}</span>
    </button>
  );
}

/** Desktop: Your station · Waiting to send · Your last entry (the Our-team card comes later). */
export function StatTiles({
  station,
  onStation,
  lastEntry,
  sync,
}: {
  station: Station | null;
  onStation: () => void;
  lastEntry: LastEntry | null;
  sync: Sync;
}) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2.5">
      <StatTile
        label="Your station"
        value={<StationValue station={station} onChange={onStation} />}
        note="Change it here or on Scout"
      />
      <StatTile
        label="Waiting to send"
        value={formatCount(sync.waiting)}
        tone={sync.waiting > 0 ? 'warn' : 'default'}
        note={syncNote(sync)}
      />
      <StatTile
        label="Your last entry"
        value={
          lastEntry ? (
            <span className="text-xl">
              <span className="text-[0.8125rem] font-medium text-muted">{lastEntry.match}</span> ·{' '}
              {formatCount(lastEntry.teamNumber)}
            </span>
          ) : (
            '—'
          )
        }
        note={
          lastEntry && (
            <>
              <span dir="auto">{lastEntry.teamName}</span> · {agoText(lastEntry.at)} ·{' '}
              <OpenLink entry={lastEntry} />
            </>
          )
        }
      />
    </div>
  );
}

const BOX = 'rounded-card border border-line bg-surface px-3 py-2.5';

/** Phone: a small station tile beside a larger last-entry tile, then one line about sending. */
export function PhoneTiles({
  station,
  onStation,
  lastEntry,
  sync,
}: {
  station: Station | null;
  onStation: () => void;
  lastEntry: LastEntry | null;
  sync: Sync;
}) {
  return (
    <>
      <div className="mt-3 grid grid-cols-[1fr_1.5fr] gap-2">
        <div className={BOX}>
          <p className="text-xs font-semibold text-muted">Your station</p>
          <StationValue station={station} onChange={onStation} />
        </div>
        <div className={cn(BOX, 'flex flex-col')}>
          <p className="text-xs font-semibold text-muted">Your last entry</p>
          {lastEntry ? (
            <>
              <p className="mt-1 text-[0.9375rem] font-[650]">
                <span className="num font-semibold">
                  {lastEntry.match} · {formatCount(lastEntry.teamNumber)}
                </span>{' '}
                <span dir="auto">{lastEntry.teamName}</span>
              </p>
              <p className="mt-0.5 flex items-center justify-between text-xs text-muted">
                <span>{agoText(lastEntry.at)}</span>
                <OpenLink entry={lastEntry} arrow />
              </p>
            </>
          ) : (
            <p className="num mt-1 text-[0.9375rem]">—</p>
          )}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[0.78125rem] text-ink-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-[7px] shrink-0 rounded-full',
            sync.waiting > 0 ? 'bg-warn' : 'bg-accent',
          )}
        />
        {phoneSyncLine(sync)}
      </p>
    </>
  );
}

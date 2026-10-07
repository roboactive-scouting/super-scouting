import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { StationPill } from '@/components/ui/station-pill';
import { stationLabel } from '@/components/ui/tag';
import { STATIONS, type Station } from '@/data/station';
import { cn } from '@/lib/utils';

/**
 * Scout README 1: "Choose your station", asked on the first visit and from "Change". It only
 * preselects a robot in the line-up; it is not an assignment. Red 1–3 above Blue 1–3.
 */
export function StationSheet({
  open,
  current,
  onUse,
  onClose,
}: {
  open: boolean;
  current: Station | null;
  onUse: (station: Station) => void;
  onClose: () => void;
}) {
  return (
    <ResponsiveDialog open={open} title="Choose your station" onClose={onClose} width={480}>
      {/* Remounted on each open, so a dismissed choice never lingers. */}
      {open && <StationChoice current={current} onUse={onUse} onClose={onClose} />}
    </ResponsiveDialog>
  );
}

function StationChoice({
  current,
  onUse,
  onClose,
}: {
  current: Station | null;
  onUse: (station: Station) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Station | null>(current);
  return (
    <>
      <p className="-mt-1 text-[0.8125rem] text-muted">
        Your station is picked for you in every match. You can still scout any robot, and change
        your station at any time.
      </p>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {STATIONS.map((s) => {
          const red = s[0] === 'R';
          const on = chosen === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setChosen(s)}
              className={cn(
                'tap-target hover-veil motion-safe:transition motion-safe:active:not-disabled:scale-[0.97] grid min-h-14 place-items-center rounded-control text-sm font-bold',
                red
                  ? 'bg-alliance-red-tint text-alliance-red'
                  : 'bg-alliance-blue-tint text-alliance-blue',
                on &&
                  (red
                    ? 'ring-2 ring-alliance-red ring-inset'
                    : 'ring-2 ring-alliance-blue ring-inset'),
              )}
            >
              {stationLabel(s)}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2.5">
        <Button size="lg" className="flex-1 px-3" onClick={onClose}>
          Not now
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1 px-3"
          disabled={!chosen}
          onClick={() => chosen && onUse(chosen)}
        >
          {chosen ? `Use ${stationLabel(chosen)}` : 'Choose your station'}
        </Button>
      </div>
    </>
  );
}

/** "Your station · Blue 2 · Change" (Scout README 1). */
function StationBar({
  station,
  onChange,
  className,
}: {
  station: Station | null;
  onChange: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2.5 lg:px-2.5 lg:py-1.5',
        className,
      )}
    >
      <span className="text-xs font-semibold text-muted">Your station</span>
      {station && <StationPill station={station} />}
      <Button
        variant="ghost"
        size="sm"
        className="ms-auto px-2 text-accent-ink lg:text-[0.9375rem]"
        onClick={onChange}
      >
        {station ? 'Change' : 'Choose your station'}
      </Button>
    </div>
  );
}

/**
 * "Scout a match" and the station bar. On a phone the top bar already says Scout, so the
 * heading shows only while no station is set ("Where are you sitting today?").
 */
export function StationHeading({
  station,
  onChange,
}: {
  /** undefined while the device read is in flight. */
  station: Station | null | undefined;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
      <div className={cn(station !== null && 'max-lg:sr-only')}>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.02em] lg:text-[1.75rem]">
          Scout a match
        </h1>
        {station === null && (
          <p className="mt-1 text-[0.8125rem] text-muted">Where are you sitting today?</p>
        )}
      </div>
      <StationBar
        station={station ?? null}
        onChange={onChange}
        className="max-lg:w-full lg:ms-auto"
      />
    </div>
  );
}

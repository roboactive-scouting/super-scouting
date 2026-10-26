import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormFieldDefinition, RobotStatus } from '@frc/shared';
import { ErrorLine, SuccessBanner } from '@/components/ui/notice';
import { cachedFormFields, cachedLiveSlots } from '@/data/cache';
import type { Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { EntryAnswers, useMapView } from './EntryAnswers';
import { EntryContext } from './entryContext';
import { EntryHeader, EntryTag } from './EntryHeader';
import { MapFieldView } from './map/MapFieldView';
import { ReadOnlyTag } from './SuperReadOnly';
import { useEntryForm } from './useEntryForm';

export type MatchReadOnlyProps = {
  formVersionId: string;
  matchId: string;
  teamId: string;
  alliance: 'red' | 'blue';
  matchLabel: string;
  teamLabel: string;
  fieldImagePath?: string | null;
  /** The entry as saved: its robot status and its data. */
  entry: { robot_status: string | null; data: Record<string, unknown> };
  /**
   * What the save at the 5-minute mark did, for the line above the answers: the Success banner
   * ("Saved — the 5 minutes are up.") with a "Not kept: …" line per change put back, or — when
   * nothing could be saved — an Error line with why. None when the entry was opened read only.
   */
  outcome?: { notKept: readonly string[]; failed: string | null };
  /** Who can still change it, beside a lock (e.g. "Only a lead or an admin can change it now."). */
  note: string;
};

/**
 * A match entry read only (SPEC-FINAL 7.6 v1.45; Phase 1 H side task 5): the entry route's view
 * of an entry this scouter can no longer edit, and what a form left open becomes at the 5-minute
 * mark. The header with a Read only chip, the banner when there is one, the lock line, then the
 * answers by phase as the confirmation draws them (`EntryAnswers`; a map field opens its map view
 * only). No control edits: no phase tabs, no field, no Review entry. The read-only entry preview
 * at `/entries/:id` (page 25) is task 1.52; this stands in for it until then.
 */
export function MatchReadOnly(props: MatchReadOnlyProps) {
  const desktop = useIsDesktop();
  const map = useMapView();
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const status = (props.entry.robot_status as RobotStatus | null) ?? null;
  const dead = status === 'no_show' || status === 'disabled';
  const form = useEntryForm({ fields, data: props.entry.data, skipChecks: true });

  useEffect(() => {
    void cachedFormFields(props.formVersionId).then(setFields);
  }, [props.formVersionId]);
  useEffect(() => {
    void cachedLiveSlots<LineupSlot>().then((slots) =>
      setStation(stationOf(slots, props.matchId, props.teamId)),
    );
  }, [props.matchId, props.teamId]);
  // The form the scout was in is gone: focus goes to what replaced it, the banner.
  useEffect(() => {
    bannerRef.current?.focus();
  }, []);

  const tag = (
    <span className="flex items-center gap-1.5">
      <ReadOnlyTag />
      <EntryTag alliance={props.alliance} station={station} desktop={desktop} />
    </span>
  );

  return (
    <EntryContext
      value={{
        alliance: props.alliance,
        station,
        fieldImagePath: props.fieldImagePath ?? null,
        caption: `${props.matchLabel} · ${props.teamLabel.split(' ')[0] ?? ''}`,
      }}
    >
      <main className={cn(desktop ? 'w-full max-w-[760px] px-8 py-6' : 'flex flex-1 flex-col')}>
        <EntryHeader
          desktop={desktop}
          matchLabel={props.matchLabel}
          teamLabel={props.teamLabel}
          savedAt={null}
          tag={tag}
        />
        <div className={cn('flex flex-col gap-3', desktop ? 'mt-5' : 'px-4 pt-3 pb-5')}>
          {props.outcome && (
            <div ref={bannerRef} tabIndex={-1} className="outline-none">
              <Outcome {...props.outcome} />
            </div>
          )}
          <p className="mx-0.5 flex items-center gap-1.5 text-[0.78125rem] text-muted">
            <Lock aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{props.note}</span>
          </p>
          <EntryAnswers
            phases={dead ? [] : form.phases}
            data={form.saved}
            status={status}
            map={map}
            stackLong
          />
        </div>
        {map.viewing && (
          <MapFieldView
            field={map.viewing}
            value={form.saved[map.viewing.key]}
            onClose={map.close}
          />
        )}
      </main>
    </EntryContext>
  );
}

/** The save at the mark, said: the Success banner, or the Error line when nothing was saved. */
function Outcome({ notKept, failed }: { notKept: readonly string[]; failed: string | null }) {
  if (failed !== null) {
    return (
      <ErrorLine>
        Not saved — the 5 minutes are up. A lead can save it for you.
        <span className="mt-0.5 block font-normal text-ink-2">{failed}</span>
      </ErrorLine>
    );
  }
  return (
    <div role="status">
      <SuccessBanner title="Saved — the 5 minutes are up.">
        {notKept.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {notKept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </SuccessBanner>
    </div>
  );
}

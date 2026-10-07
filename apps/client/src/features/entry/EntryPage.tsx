import { useEffect, useMemo, useRef, useState } from 'react';
import type { FieldPhase, FormFieldDefinition, RobotStatus } from '@frc/shared';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { cachedFormFields, cachedRows } from '@/data/cache';
import type { Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { ConfirmEntry } from './ConfirmEntry';
import { EntryHeader, EntryTag } from './EntryHeader';
import { EntrySummary } from './EntrySummary';
import { FieldInput } from './FieldInput';
import { canSelfEdit, editsAnyTime, type Editor, type LocalEntry } from './localEntries';
import { PhaseTabs } from './PhaseTabs';
import { donePhases, phasesOf } from './phases';
import { RobotStatusPicker } from './RobotStatusPicker';
import { submitEntry } from './submitEntry';
import { useDraft } from './useDraft';

export type EntryPageProps = {
  eventId: string;
  formVersionId: string;
  matchId: string;
  teamId: string;
  alliance: 'red' | 'blue';
  /** The signed-in user: the author of every op and of a new entry (SPEC-FINAL 7.5). */
  author: Editor;
  teamLabel: string;
  matchLabel: string;
  onSubmitted?: (rowId: string) => void;
  /** This device's entry for the same match and robot: the page edits it (SPEC-FINAL 7.6). */
  existing?: LocalEntry;
};

export function EntryPage(props: EntryPageProps) {
  const draftKey = `${props.formVersionId}:${props.matchId}:${props.teamId}`;
  const { draft, loaded, savedAt, save } = useDraft(draftKey);
  const desktop = useIsDesktop();
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [breakdownSeconds, setBreakdownSeconds] = useState<number>(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [phase, setPhase] = useState<FieldPhase>('auto');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // "Q38 · 5951": the team's number is the label's first word ("5951 Tiny Titans").
  usePageTitle(`${props.matchLabel} · ${props.teamLabel.split(' ')[0] ?? ''}`);
  // The desktop crumb keeps the team's name: "Scout / Q39 · 1690 Orbit" (Entry final).
  usePageCrumb(['Scout', `${props.matchLabel} · ${props.teamLabel}`]);

  // A failed submit keeps the entry and the sheet; the reason is moved into view and
  // focused, beside the button the scout just pressed.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    void cachedFormFields(props.formVersionId).then(setFields);
  }, [props.formVersionId]);

  useEffect(() => {
    void cachedRows<LineupSlot>('match_teams').then((slots) =>
      setStation(stationOf(slots, props.matchId, props.teamId)),
    );
  }, [props.matchId, props.teamId]);

  useEffect(() => {
    if (!loaded) return;
    // An unsent draft wins over the saved entry: it is the newer of the two.
    const source = draft ?? props.existing ?? null;
    if (source === null) return;
    setStatus((source.robot_status as RobotStatus | null) ?? null);
    setData((source.data as Record<string, unknown>) ?? {});
    setBreakdownSeconds(Number(source.breakdown_seconds ?? 0));
  }, [loaded, draft, props.existing]);

  const dead = status === 'no_show' || status === 'disabled';
  const phases = useMemo(() => phasesOf(fields), [fields]);
  const done = useMemo(() => donePhases(phases, data), [phases, data]);
  const current = phases.find((p) => p.key === phase) ?? phases[0];
  const showPhases = status !== null && !dead && current !== undefined;

  function update(next: {
    status?: RobotStatus;
    data?: Record<string, unknown>;
    seconds?: number;
  }) {
    const nextStatus = next.status ?? status;
    const nextData = next.data ?? data;
    const nextSeconds = next.seconds ?? breakdownSeconds;
    setStatus(nextStatus);
    setData(nextData);
    setBreakdownSeconds(nextSeconds);
    save({ robot_status: nextStatus, data: nextData, breakdown_seconds: nextSeconds });
  }

  async function commit() {
    setError(null);
    if (props.existing && !canSelfEdit(props.existing, props.author, new Date())) {
      // SPEC-FINAL 7.6: the window closed while the scout was on this screen.
      setError('This entry is locked — ask a lead to change it.');
      return;
    }
    try {
      const { row_id } = await submitEntry({
        fields,
        eventId: props.eventId,
        formVersionId: props.formVersionId,
        formKind: 'match',
        matchId: props.matchId,
        teamId: props.teamId,
        alliance: props.alliance,
        authorUserId: props.author.id,
        robotStatus: status,
        breakdownSeconds,
        data,
        draftKey,
        ...(props.existing ? { rowId: props.existing.id } : {}),
      });
      setReviewing(false);
      props.onSubmitted?.(row_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not submit');
    }
  }

  const tag = <EntryTag alliance={props.alliance} station={station} desktop={desktop} />;
  const header = (
    <EntryHeader
      desktop={desktop}
      matchLabel={props.matchLabel}
      teamLabel={props.teamLabel}
      savedAt={savedAt}
      tag={tag}
    />
  );

  const statusBlock = (
    <RobotStatusPicker
      value={status}
      onChange={(s) => update({ status: s })}
      breakdownSeconds={breakdownSeconds}
      onBreakdownSeconds={(seconds) => update({ seconds })}
    />
  );

  const pane = showPhases && (
    <PhaseTabs phases={phases} value={current.key} onChange={setPhase} done={done} phone={!desktop}>
      {current.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={data[field.key]}
          onChange={(value) => update({ data: { ...data, [field.key]: value } })}
        />
      ))}
    </PhaseTabs>
  );

  const confirm = (
    <ConfirmEntry
      open={reviewing}
      matchLabel={props.matchLabel}
      teamLabel={props.teamLabel}
      tag={tag}
      status={status}
      phases={dead ? [] : phases}
      data={data}
      windowApplies={!editsAnyTime(props.author) && !props.existing}
      error={error}
      errorRef={errorRef}
      onBack={() => setReviewing(false)}
      onSubmit={() => void commit()}
    />
  );

  if (desktop) {
    return (
      <main className="grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] gap-6 px-8 py-6">
        <div className="min-w-0">
          {header}
          <div className="mt-5">{statusBlock}</div>
          {pane && (
            <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
              {pane}
            </div>
          )}
        </div>
        <EntrySummary
          status={status}
          phases={dead ? [] : phases}
          data={data}
          current={current?.key ?? 'auto'}
          done={done}
          onPick={setPhase}
          onReview={() => setReviewing(true)}
        />
        {confirm}
      </main>
    );
  }

  return (
    <main data-pinned-foot="" className="flex flex-1 flex-col">
      {header}
      <div className="px-4 py-3">{statusBlock}</div>
      <div className="flex-1">{pane}</div>
      {/* The wrapper is the sticky element and a direct child of <main>, which is taller than
          the bar: pinned at the bottom while a long phase scrolls. Its mt-0 override drops the
          bar's own top margin, so no scrolled content shows in a gap above the border. */}
      <div className="sticky bottom-[var(--bottom-bar,0px)] z-20 mt-6 px-4 [&>div]:mt-0">
        <ActionBar>
          <Button
            variant="primary"
            size="block"
            disabled={status === null}
            onClick={() => setReviewing(true)}
          >
            Review entry
          </Button>
        </ActionBar>
      </div>
      {confirm}
    </main>
  );
}

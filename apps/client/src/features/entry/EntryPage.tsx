import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FieldPhase, FormFieldDefinition, RobotStatus, TimerConfig } from '@frc/shared';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { cachedFormFields, cachedLiveSlots } from '@/data/cache';
import { keepScreenOn, useBoolPref } from '@/lib/devicePrefs';
import { haptics } from '@/lib/haptics';
import type { Station } from '@/data/station';
import { stationOf, type LineupSlot } from '@/lib/derive/entries';
import { usePageCrumb, usePageTitle } from '@/lib/pageTitle';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { ConfirmEntry } from './ConfirmEntry';
import { EntryContext, type EntryContextValue } from './entryContext';
import { EntryHeader, EntryTag } from './EntryHeader';
import { BREAKDOWN_KEY } from './entryRules';
import { EntrySummary } from './EntrySummary';
import { FieldInput } from './FieldInput';
import { canSelfEdit, editsAnyTime, type Editor, type LocalEntry } from './localEntries';
import { asClockOrigin, matchClock } from './matchClock';
import { MatchTimer } from './lazyParts';
import { PHASE_NAME } from './phases';
import { PhaseTabs } from './PhaseTabs';
import { usePracticeMode } from './practice';
import { ProblemsDialog } from './ProblemsDialog';
import { RobotStatusPicker } from './RobotStatusPicker';
import { asStopwatches, stopwatches } from './stopwatches';
import { submitEntry } from './submitEntry';
import { useDraft } from './useDraft';
import { useEntryForm } from './useEntryForm';
import { useWakeLock } from './useWakeLock';

/**
 * The "Practice finished" sheet (SPEC-FINAL 8.5) only ever shows in practice: a small lazy chunk,
 * precached, kept off the competition path's initial bundle (task 1.37).
 */
const PracticeFinished = lazy(() =>
  import('./PracticeFinished').then((m) => ({ default: m.PracticeFinished })),
);

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
  /**
   * The form's match timer (`forms.timer_config`, SPEC-FINAL 8.4). No phases, or none given: the
   * sticky timer is not drawn.
   */
  timerConfig?: TimerConfig | null;
  /** The season's game image (`seasons.field_image_path`) for the map fields (5.6, 16.7). */
  fieldImagePath?: string | null;
};

/** The match draft's key (SPEC-FINAL 8.3): one per (form version, match, team). */
export function matchDraftKey(formVersionId: string, matchId: string, teamId: string): string {
  return `${formVersionId}:${matchId}:${teamId}`;
}

const isPhase = (value: unknown): value is FieldPhase =>
  typeof value === 'string' && Object.hasOwn(PHASE_NAME, value);

/** The match clock and the stopwatches as one comparable string: did either move? */
const timersKey = () =>
  JSON.stringify({ clock: matchClock.snapshot(), stopwatches: stopwatches.snapshot() });

export function EntryPage(props: EntryPageProps) {
  const draftKey = matchDraftKey(props.formVersionId, props.matchId, props.teamId);
  const practice = usePracticeMode();
  // In practice the draft goes to its own store (SPEC-FINAL 8.5), through the same hook.
  const { draft, loaded, savedAt, save } = useDraft(draftKey);
  /** Finish practice let through: the "Practice finished" sheet is open (8.5). */
  const [finished, setFinished] = useState(false);
  const desktop = useIsDesktop();
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  // Null while the field is empty: a Broke down entry then fails SPEC-FINAL 3.5's check.
  const [breakdownSeconds, setBreakdownSeconds] = useState<number | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  /** The draft's clock, stopwatches and phase have been put back (once per opening). */
  const restored = useRef(false);
  /** The timers as last written to the draft, so putting them back is not a change. */
  const savedTimers = useRef('');
  /** Writes the draft from the page as it stands, plus `next`; set every render (below). */
  const persist = useRef<(next?: Record<string, unknown>) => void>(() => undefined);
  // "Q38 · 5951": the team's number is the label's first word ("5951 Tiny Titans").
  usePageTitle(`${props.matchLabel} · ${props.teamLabel.split(' ')[0] ?? ''}`);
  // The desktop crumb keeps the team's name: "Scout / Q39 · 1690 Orbit" (Entry final).
  usePageCrumb(['Scout', `${props.matchLabel} · ${props.teamLabel}`]);

  // One entry, one origin (SPEC-FINAL 5.5): the match clock and the Timer fields' stopwatches
  // start empty as an entry opens and are cleared as it closes, so nothing leaks between entries.
  // While the entry is open, a Start match, a reset or a stopwatch start or stop writes the draft
  // (8.3: the draft survives a crash; task 1.37). The listeners go before the closing reset.
  useEffect(() => {
    restored.current = false;
    matchClock.reset();
    stopwatches.resetAll();
    const onTimers = () => {
      if (!restored.current || timersKey() === savedTimers.current) return;
      persist.current();
    };
    const offClock = matchClock.subscribe(onTimers);
    const offWatches = stopwatches.subscribe(onTimers);
    return () => {
      offClock();
      offWatches();
      matchClock.reset();
      stopwatches.resetAll();
    };
  }, [draftKey]);

  // SPEC-FINAL 8.6 (task 1.38): no dimming mid-match while the entry is open, unless this device
  // turned Keep the screen on off. Its own effect: the one above is about the match clock.
  useWakeLock(useBoolPref(keepScreenOn));

  // A failed submit keeps the entry and the sheet; the reason is moved into view and
  // focused, beside the button the scout just pressed.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    void cachedFormFields(props.formVersionId).then(setFields);
  }, [props.formVersionId]);

  useEffect(() => {
    void cachedLiveSlots<LineupSlot>().then((slots) =>
      setStation(stationOf(slots, props.matchId, props.teamId)),
    );
  }, [props.matchId, props.teamId]);

  useEffect(() => {
    if (!loaded) return;
    // An unsent draft wins over the saved entry: it is the newer of the two.
    const source = draft ?? props.existing ?? null;
    if (source !== null) {
      setStatus((source.robot_status as RobotStatus | null) ?? null);
      setData((source.data as Record<string, unknown>) ?? {});
      setBreakdownSeconds(
        typeof source.breakdown_seconds === 'number' ? source.breakdown_seconds : null,
      );
    }
    if (restored.current) return;
    // Resume opens the entry where it was (8.3, task 1.37): the match clock and the stopwatches
    // as they stood (a running one is still running: its time is read from timestamps), and the
    // phase on screen. A draft written before task 1.37 has none of them.
    if (draft) {
      matchClock.restore(asClockOrigin(draft.clock));
      stopwatches.restore(asStopwatches(draft.stopwatches));
      if (isPhase(draft.phase)) form.setPhase(draft.phase);
    }
    savedTimers.current = timersKey();
    restored.current = true;
    // `form.setPhase` is a state setter: stable.
  }, [loaded, draft, props.existing]);

  const dead = status === 'no_show' || status === 'disabled';
  // Task 1.36: what is shown and saved (5.7, 5.8) and what holds Review entry (8.2, 15.1). No
  // show and Disabled skip every check; they record no field data at all.
  const form = useEntryForm({
    fields,
    data,
    skipChecks: dead,
    breakdownMissing: status === 'broke_down' && breakdownSeconds === null,
  });
  const { phases, current, done } = form;
  const showPhases = status !== null && !dead && current !== undefined;

  /**
   * Review entry: the confirmation, or — when anything holds it — the problems to fix first. In
   * practice it is Finish practice: the same rules, then the "Practice finished" sheet (8.5).
   */
  function review() {
    if (!form.review()) return;
    if (practice) setFinished(true);
    else setReviewing(true);
  }

  /**
   * The draft (8.3): what the scout set (`data` holds no starting values), the robot status and
   * breakdown time, and — so Resume opens it where it was (task 1.37) — the alliance, the phase
   * on screen, the match clock and the stopwatches.
   */
  persist.current = (next = {}) => {
    savedTimers.current = timersKey();
    save({
      robot_status: status,
      data,
      breakdown_seconds: breakdownSeconds,
      alliance: props.alliance,
      phase: form.current?.key ?? null,
      clock: matchClock.snapshot(),
      stopwatches: stopwatches.snapshot(),
      ...next,
    });
  };

  /** A phase picked by tab, swipe or the desktop panel: kept in a draft that already exists. */
  function pickPhase(phase: FieldPhase) {
    form.setPhase(phase);
    if (savedAt !== null) persist.current({ phase });
  }

  function update(next: {
    status?: RobotStatus;
    data?: Record<string, unknown>;
    seconds?: number | null;
  }) {
    const nextStatus = next.status ?? status;
    const nextData = next.data ?? data;
    const nextSeconds = next.seconds !== undefined ? next.seconds : breakdownSeconds;
    setStatus(nextStatus);
    setData(nextData);
    setBreakdownSeconds(nextSeconds);
    persist.current({ robot_status: nextStatus, data: nextData, breakdown_seconds: nextSeconds });
  }

  /** One tap, one entry and one outbox operation, however fast the second tap comes. */
  async function commit() {
    if (inFlight.current) return;
    setError(null);
    if (props.existing && !canSelfEdit(props.existing, props.author, new Date())) {
      // SPEC-FINAL 7.6: the window closed while the scout was on this screen.
      setError('This entry is locked — ask a lead to change it.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
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
        // The entry as it is saved: the starting values under the scout's, computed fields
        // worked out, hidden fields left out (SPEC-FINAL 5.7, 5.8). A dead robot sends none.
        data: dead ? {} : form.saved,
        draftKey,
        ...(props.existing ? { rowId: props.existing.id } : {}),
      });
      setReviewing(false);
      props.onSubmitted?.(row_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not submit');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const tag = <EntryTag alliance={props.alliance} station={station} desktop={desktop} />;
  const header = (
    <EntryHeader
      desktop={desktop}
      matchLabel={props.matchLabel}
      teamLabel={props.teamLabel}
      savedAt={savedAt}
      practice={practice}
      tag={tag}
    />
  );

  const statusBlock = (
    <RobotStatusPicker
      value={status}
      onChange={(s) => {
        haptics.tap();
        update({ status: s });
      }}
      breakdownSeconds={breakdownSeconds}
      onBreakdownSeconds={(seconds) => update({ seconds })}
      breakdownProblem={form.marks.get(BREAKDOWN_KEY) ?? null}
    />
  );

  const pane = showPhases && (
    <PhaseTabs
      phases={phases}
      value={current.key}
      onChange={pickPhase}
      done={done}
      phone={!desktop}
      swipeArea={mainRef}
    >
      {current.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={form.values[field.key]}
          onChange={(value) => update({ data: { ...data, [field.key]: value } })}
          // A computed field is worked out from the entry as it stands (SPEC-FINAL 5.7).
          siblingValues={form.values}
          problem={form.marks.get(field.key) ?? null}
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
      data={form.saved}
      windowApplies={!editsAnyTime(props.author) && !props.existing}
      error={error}
      errorRef={errorRef}
      submitting={submitting}
      onBack={() => setReviewing(false)}
      onSubmit={() => void commit()}
    />
  );

  const problems = (
    <>
      <ProblemsDialog
        open={form.problemsOpen}
        problems={form.problems}
        onGoTo={form.goTo}
        onClose={form.closeProblems}
      />
      {practice && (
        <Suspense fallback={null}>
          <PracticeFinished
            open={finished}
            onClose={() => setFinished(false)}
            after={props.matchId}
          />
        </Suspense>
      )}
    </>
  );
  const reviewLabel = practice ? 'Finish practice' : 'Review entry';

  const context: EntryContextValue = {
    alliance: props.alliance,
    station,
    fieldImagePath: props.fieldImagePath ?? null,
    caption: `${props.matchLabel} · ${props.teamLabel.split(' ')[0] ?? ''}`,
  };
  // Guidance only (SPEC-FINAL 8.4): it is handed nothing it could open, lock or submit.
  const timer = <MatchTimer config={props.timerConfig} layout={desktop ? 'desktop' : 'phone'} />;
  const hasTimer = (props.timerConfig?.phases.length ?? 0) > 0;

  if (desktop) {
    return (
      <EntryContext value={context}>
        <main className="grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] gap-6 px-8 py-6">
          <div className="min-w-0">
            {header}
            <div className="mt-5">{statusBlock}</div>
            {(pane || hasTimer) && (
              // overflow-clip, not -hidden: the timer bar stays sticky inside the rounded card.
              <div className="mt-4 overflow-clip rounded-card border border-line bg-surface">
                {timer}
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
            toFix={form.toFix}
            onPick={pickPhase}
            onReview={review}
            reviewLabel={reviewLabel}
          />
          {confirm}
          {problems}
        </main>
      </EntryContext>
    );
  }

  return (
    // The whole page takes the phase swipe (PhaseTabs), the space below a short form too;
    // the browser keeps the vertical scroll and the pinch zoom.
    <EntryContext value={context}>
      <main
        ref={mainRef}
        data-pinned-foot=""
        className="flex flex-1 touch-pan-y touch-pinch-zoom flex-col"
      >
        {/* Pinned under the top bar while the page scrolls (entry parts, the sticky match timer). */}
        {timer}
        {header}
        <div className="px-4 py-3">{statusBlock}</div>
        <div className="flex flex-1 flex-col">{pane}</div>
        {/* The wrapper is the sticky element and a direct child of <main>, which is taller than
          the bar: pinned at the bottom while a long phase scrolls. Its mt-0 override drops the
          bar's own top margin, so no scrolled content shows in a gap above the border. */}
        <div className="sticky bottom-[var(--bottom-bar,0px)] z-20 mt-6 px-4 [&>div]:mt-0">
          <ActionBar>
            <Button variant="primary" size="block" disabled={status === null} onClick={review}>
              {reviewLabel}
            </Button>
          </ActionBar>
        </div>
        {confirm}
        {problems}
      </main>
    </EntryContext>
  );
}

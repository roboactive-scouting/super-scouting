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
import { EditCountdown } from './EditCountdown';
import type { Settled } from './editWindow';
import { EntryContext, type EntryContextValue } from './entryContext';
import { EntryHeader, EntryTag } from './EntryHeader';
import { BREAKDOWN_KEY } from './entryRules';
import { EntrySummary } from './EntrySummary';
import { FieldInput } from './FieldInput';
import {
  canSelfEdit,
  editableUntil,
  editsAnyTime,
  type Editor,
  type LocalEntry,
} from './localEntries';
import { asClockOrigin, matchClock } from './matchClock';
import { loadTimedParts, MatchReadOnly, MatchTimer } from './lazyParts';
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

/** What the page became at the 5-minute mark (SPEC-FINAL 7.6 v1.45): the entry, read only. */
type Closed = {
  /** The entry as it now stands saved (or, when nothing could be saved, as it was). */
  entry: { robot_status: string | null; data: Record<string, unknown> };
  notKept: string[];
  /** Why nothing was saved; null when the save went through. */
  failed: string | null;
};

/** The match clock and the stopwatches as one comparable string: did either move? */
const timersKey = () =>
  JSON.stringify({ clock: matchClock.snapshot(), stopwatches: stopwatches.snapshot() });

export function EntryPage(props: EntryPageProps) {
  const draftKey = matchDraftKey(props.formVersionId, props.matchId, props.teamId);
  const practice = usePracticeMode();
  // In practice the draft goes to its own store (SPEC-FINAL 8.5), through the same hook.
  const { draft, loaded, savedAt, save, close } = useDraft(draftKey);
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
  /**
   * SPEC-FINAL 7.6 v1.45: a scouter's own match entry runs down with its window — leads, admins
   * and super entries never do (a super entry is never this page). The mark is `client_created_at`
   * + 5:00, the same clock `canSelfEdit` reads.
   */
  const own = props.existing;
  const deadline =
    own &&
    own.form_kind === 'match' &&
    own.scouter_id === props.author.id &&
    !editsAnyTime(props.author)
      ? editableUntil(own).getTime()
      : null;
  /**
   * The window was still open when the page opened: only then does the mark save. An entry
   * opened after it closed is the route's read-only view; here `commit()`'s lock is the guard.
   */
  const [armed] = useState(() => deadline !== null && deadline > Date.now());
  const [closed, setClosed] = useState<Closed | null>(null);
  /** The save at the mark: set every render (below), so its timer reads the form as it stands. */
  const mark = useRef<() => Promise<void>>(async () => undefined);
  const marked = useRef(false);
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

  // At 5:00 the form saves what is typed and locks (SPEC-FINAL 7.6 v1.45). One timer for the
  // mark; the countdown ticks on its own (EditCountdown), so the form does not re-render each second.
  useEffect(() => {
    if (!armed || deadline === null) return;
    const id = setTimeout(() => void mark.current(), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(id);
  }, [armed, deadline]);

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
   * practice it is Finish practice: the same review, its confirm button Finish practice, then the
   * "Practice finished" sheet (8.5; UF.26).
   */
  function review() {
    if (form.review()) setReviewing(true);
  }

  /** The confirmation's primary button: a real submit, or — in practice — the end sheet. */
  function confirmed() {
    if (!practice) return void commit();
    setReviewing(false);
    setFinished(true);
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

  /**
   * The 5-minute mark (SPEC-FINAL 7.6 v1.45): the form saves what can be saved, stamped
   * `client_created_at` + 5:00 exactly — however late this runs, so the server's window check
   * passes — then becomes the entry read only. A change the save would refuse keeps its last
   * saved value and is named (`keepSavable`); nothing else typed is lost. A submit already in
   * flight was stamped inside the window and goes on; if it fails, the next submit comes here.
   */
  mark.current = async () => {
    if (marked.current || inFlight.current || !own || deadline === null) return;
    marked.current = true;
    inFlight.current = true;
    setSubmitting(true);
    setReviewing(false);
    form.closeProblems();
    close(true);
    const typed = { status, breakdownSeconds, data };
    let settled: Settled | null = null;
    let failed: string | null = null;
    try {
      // The timed parts' chunk, loaded since the app started (and precached): what to keep.
      const { keepSavable } = await loadTimedParts().catch(() => {
        throw new Error('Part of the app didn’t load. What was typed stays on this device.');
      });
      settled = keepSavable({
        fields,
        last: {
          status: (own.robot_status as RobotStatus | null) ?? null,
          breakdownSeconds:
            typeof own.breakdown_seconds === 'number' ? own.breakdown_seconds : null,
          data: own.data ?? {},
        },
        typed,
        running: (key) => stopwatches.running(key),
      });
      if (settled.refused) {
        failed = 'It no longer passes the form’s checks as it was saved.';
      } else {
        await submitEntry({
          fields,
          eventId: props.eventId,
          formVersionId: props.formVersionId,
          formKind: 'match',
          matchId: props.matchId,
          teamId: props.teamId,
          alliance: props.alliance,
          authorUserId: props.author.id,
          robotStatus: settled.status,
          breakdownSeconds: settled.breakdownSeconds,
          data: settled.saved,
          draftKey,
          rowId: own.id,
          clientUpdatedAt: new Date(deadline).toISOString(),
        });
      }
    } catch (e) {
      failed = e instanceof Error ? e.message : 'could not save';
    }
    setClosed(
      failed === null && settled
        ? {
            entry: { robot_status: settled.status, data: settled.saved },
            notKept: settled.notKept,
            failed,
          }
        : { entry: { robot_status: own.robot_status, data: own.data ?? {} }, notKept: [], failed },
    );
    inFlight.current = false;
    setSubmitting(false);
  };

  /** One tap, one entry and one outbox operation, however fast the second tap comes. */
  async function commit() {
    if (inFlight.current) return;
    setError(null);
    // The mark passed while its timer had not yet run (a sleeping tab): it saves now, as at 5:00.
    if (armed && deadline !== null && Date.now() >= deadline) return void mark.current();
    if (props.existing && !canSelfEdit(props.existing, props.author, new Date())) {
      // SPEC-FINAL 7.6, the last guard only (v1.45): the window closed with no mark to save at.
      setError('This entry is locked — ask a lead to change it.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    // From here the draft is the submit's to clear: nothing writes it back (UF.23).
    close(true);
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
      close(false);
      setError(e instanceof Error ? e.message : 'could not submit');
      // The mark passed while this submit was in flight: the form still saves and locks now.
      if (armed && deadline !== null && Date.now() >= deadline) {
        inFlight.current = false;
        void mark.current();
      }
    } finally {
      if (!marked.current) {
        inFlight.current = false;
        setSubmitting(false);
      }
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
      practice={practice}
      error={error}
      errorRef={errorRef}
      submitting={submitting}
      onBack={() => setReviewing(false)}
      onSubmit={confirmed}
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
  // The last minute, above Review entry (SPEC-FINAL 7.6 v1.45); it draws nothing before then.
  const countdown = armed && deadline !== null ? <EditCountdown deadline={deadline} /> : null;

  // After the mark: the entry read only, in place (the preview at /entries/:id is task 1.52).
  if (closed) {
    return (
      <MatchReadOnly
        formVersionId={props.formVersionId}
        matchId={props.matchId}
        teamId={props.teamId}
        alliance={props.alliance}
        matchLabel={props.matchLabel}
        teamLabel={props.teamLabel}
        fieldImagePath={props.fieldImagePath}
        entry={closed.entry}
        note="Only a lead or an admin can change it now."
        outcome={closed}
      />
    );
  }

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
            foot={countdown}
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
            {countdown ? (
              // The countdown stands above the button, in the same bar (SPEC-FINAL 7.6 v1.45).
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {countdown}
                <Button
                  variant="primary"
                  size="block"
                  className="min-h-13"
                  disabled={status === null}
                  onClick={review}
                >
                  {reviewLabel}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="block" disabled={status === null} onClick={review}>
                {reviewLabel}
              </Button>
            )}
          </ActionBar>
        </div>
        {confirm}
        {problems}
      </main>
    </EntryContext>
  );
}

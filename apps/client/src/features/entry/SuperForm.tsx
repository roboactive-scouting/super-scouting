import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTime, type FormFieldDefinition } from '@frc/shared';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Note, Notice } from '@/components/ui/notice';
import { cachedFormFields } from '@/data/cache';
import { keepScreenOn, useBoolPref } from '@/lib/devicePrefs';
import { PATHS } from '@/lib/paths';
import { cn } from '@/lib/utils';
import { ConfirmEntry } from './ConfirmEntry';
import { EntryContext } from './entryContext';
import { FieldInput } from './FieldInput';
import { canSelfEdit, editsAnyTime, type Editor } from './localEntries';
import { matchClock } from './matchClock';
import { PhaseTabs } from './PhaseTabs';
import { usePracticeMode } from './practice';
import { PracticeFinished } from './PracticeFinished';
import { ProblemsDialog } from './ProblemsDialog';
import { stopwatches } from './stopwatches';
import { submitEntry } from './submitEntry';
import { superDoneAt } from './SuperPicker';
import type { SuperTeam } from './superData';
import { useDraft } from './useDraft';
import { useEntryForm } from './useEntryForm';
import { useWakeLock } from './useWakeLock';

/** The dark SUPER tag (15-super final): `--rail` with white text, like the admin tag. */
function SuperTag() {
  return (
    <span className="inline-flex h-6 items-center rounded-tag bg-rail px-[9px] text-[0.71875rem] font-bold tracking-[0.04em] text-surface">
      SUPER
    </span>
  );
}

/**
 * The draft key of a super entry: one per (form version, team) — there is no match. Task 1.37's
 * draft recovery tells it from a match draft (`version:match:team`) by the middle word.
 */
export function superDraftKey(formVersionId: string, teamId: string): string {
  return `${formVersionId}:super:${teamId}`;
}

/**
 * One team's super entry (SPEC-FINAL 8.1; 15-super final): the active season's `super` form for
 * a team from the roster, and **no match, no alliance, no robot status and no match timer**. The
 * header names the team, the event and the matches this device scouted the team in; a team this
 * device already holds a super entry for opens that entry, and saving updates it (its `rowId`),
 * never a second row. The fields, phase tabs, rules, problems and confirmation are the match
 * entry's own (`useEntryForm`, `PhaseTabs`, `FieldInput`, `ProblemsDialog`, `ConfirmEntry`).
 *
 * In practice (SPEC-FINAL 8.5; task 1.37) it is routed like the match entry: the draft goes to
 * the practice store, the device's entry is not opened (practice starts blank), the header says
 * "Practice · not saved" and Review entry is Finish practice.
 */
export function SuperForm({
  eventId,
  eventName,
  author,
  team,
  formVersionId,
  desktop,
  onSubmitted,
}: {
  eventId: string;
  eventName: string;
  author: Editor;
  team: SuperTeam;
  /** The version the existing entry was recorded with, else the form's published one. */
  formVersionId: string;
  desktop: boolean;
  onSubmitted: (rowId: string) => void;
}) {
  const practice = usePracticeMode();
  /** Finish practice let through: the "Practice finished" sheet is open (8.5). */
  const [finished, setFinished] = useState(false);
  // The entry as the page opened: a later sync re-reading the rows must not reset the form.
  const existing = useRef(practice ? undefined : team.entry).current;
  const draftKey = superDraftKey(formVersionId, team.id);
  const { draft, loaded, savedAt, save, close } = useDraft(draftKey);
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const restored = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const form = useEntryForm({ fields, data });
  const teamLabel = `${team.number} ${team.name}`;
  // SPEC-FINAL 8.6 (task 1.38): the screen stays on while the super entry is open, as on a match.
  useWakeLock(useBoolPref(keepScreenOn));

  useEffect(() => {
    void cachedFormFields(formVersionId).then(setFields);
  }, [formVersionId]);

  // One entry, one origin (as EntryPage): the Timer fields' stopwatches start empty.
  useEffect(() => {
    matchClock.reset();
    stopwatches.resetAll();
    return () => {
      matchClock.reset();
      stopwatches.resetAll();
    };
  }, [draftKey]);

  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    // An unsent draft wins over the saved entry: it is the newer of the two.
    const source = (draft?.data as Record<string, unknown> | undefined) ?? existing?.data;
    if (source) setData(source);
  }, [loaded, draft, existing]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const locked = existing !== undefined && !canSelfEdit(existing, author, new Date());

  function update(next: Record<string, unknown>) {
    setData(next);
    save({ form_kind: 'super', team_id: team.id, data: next });
  }

  function review() {
    if (!form.review()) return;
    if (practice) setFinished(true);
    else setReviewing(true);
  }
  const reviewLabel = practice ? 'Finish practice' : 'Review entry';

  async function commit() {
    if (inFlight.current) return;
    setError(null);
    if (existing && !canSelfEdit(existing, author, new Date())) {
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
        eventId,
        formVersionId,
        formKind: 'super',
        // SPEC-FINAL 3.5, 8.1: a super entry has no match, alliance, robot status or breakdown.
        matchId: null,
        teamId: team.id,
        alliance: null,
        authorUserId: author.id,
        robotStatus: null,
        breakdownSeconds: null,
        data: form.saved,
        draftKey,
        ...(existing ? { rowId: existing.id } : {}),
      });
      setReviewing(false);
      onSubmitted(row_id);
    } catch (e) {
      close(false);
      setError(e instanceof Error ? e.message : 'could not submit');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  // The picker is the page's h1 beside the form on a computer; on a phone the form is the page.
  const Title = desktop ? 'h2' : 'h1';
  const doneAt = existing ? superDoneAt({ ...team, entry: existing }) : null;
  const header = (
    <header
      className={cn(
        desktop ? 'px-7 pt-5 pb-4' : 'border-b border-line bg-surface px-4 pt-2 pb-3.5',
      )}
    >
      <div className="flex items-center justify-between gap-2.5">
        <Link
          to={PATHS.super}
          className={cn(
            'hover-veil -ms-2 flex min-h-12 items-center rounded-control px-2 text-muted',
            desktop ? 'text-[0.9375rem]' : 'text-[0.8125rem] font-medium',
          )}
        >
          ‹ Super scouting
        </Link>
        <SuperTag />
      </div>
      <Title
        className={cn(
          'font-[750] tracking-[-0.02em] text-ink',
          desktop ? 'text-[1.75rem]' : 'text-[1.375rem]',
        )}
      >
        <span className="num font-semibold">{team.number}</span> <span dir="auto">{team.name}</span>
      </Title>
      <p
        className={cn(
          'mt-1 flex items-center gap-2 text-muted',
          desktop ? 'text-[0.9375rem]' : 'text-[0.78125rem]',
        )}
      >
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-accent" />
        <span dir="auto">
          {eventName} · the whole event
          {practice
            ? ' · practice · not saved'
            : savedAt
              ? ` · draft saved ${formatTime(savedAt)}`
              : ''}
        </span>
      </p>
      {existing && !locked && (
        <p className="mt-2.5 flex items-start gap-2 rounded-control bg-accent-tint px-3 py-2 text-[0.8125rem] font-semibold text-accent-ink">
          <Pencil aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>Editing your entry from {doneAt} — your changes update it</span>
        </p>
      )}
      {team.seen.length > 0 && (
        <p
          className={cn(
            'mt-2.5 flex flex-wrap items-center gap-1.5 text-muted',
            desktop ? 'text-[0.9375rem]' : 'text-[0.75rem]',
          )}
        >
          <span className="me-0.5">Seen here in</span>
          {team.seen.map((label) => (
            <span
              key={label}
              className="num rounded-tag bg-line-2 px-1.5 py-0.5 text-[0.75rem] font-semibold text-ink-2"
            >
              {label}
            </span>
          ))}
        </p>
      )}
    </header>
  );

  if (locked) {
    return (
      <div className={cn(desktop && 'rounded-card border border-line bg-surface pb-5')}>
        {header}
        <div className={desktop ? 'px-7' : 'px-4 pt-4'}>
          <Notice role="alert" tone="warning" still>
            The super entry for <span dir="auto">{teamLabel}</span> is locked — ask a lead to change
            it.
          </Notice>
        </div>
      </div>
    );
  }

  const current = form.current;
  const pane = current ? (
    <PhaseTabs
      phases={form.phases}
      value={current.key}
      onChange={form.setPhase}
      done={form.done}
      phone={!desktop}
      swipeArea={mainRef}
    >
      {current.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={form.values[field.key]}
          onChange={(value) => update({ ...data, [field.key]: value })}
          siblingValues={form.values}
          problem={form.marks.get(field.key) ?? null}
        />
      ))}
    </PhaseTabs>
  ) : (
    fields.length === 0 &&
    loaded && (
      <div className="px-4 py-4">
        <Note>This super form has no fields yet. An admin adds them in the form builder.</Note>
      </div>
    )
  );

  const dialogs = (
    <>
      <ProblemsDialog
        open={form.problemsOpen}
        problems={form.problems}
        onGoTo={form.goTo}
        onClose={form.closeProblems}
      />
      <ConfirmEntry
        open={reviewing}
        title="Submit the super entry?"
        summary={
          <p className="text-ink-2">
            <b className="font-bold text-ink" dir="auto">
              {teamLabel}
            </b>{' '}
            · <span dir="auto">{eventName}</span> · the whole event. No match is recorded.
          </p>
        }
        status={null}
        showStatus={false}
        phases={form.phases}
        data={form.saved}
        windowApplies={!editsAnyTime(author) && !existing}
        error={error}
        errorRef={errorRef}
        submitting={submitting}
        onBack={() => setReviewing(false)}
        onSubmit={() => void commit()}
      />
      {practice && (
        <PracticeFinished open={finished} onClose={() => setFinished(false)} after={null} />
      )}
    </>
  );

  // A super form's map fields have no alliance of their own: the default red end, the team named.
  const context = {
    alliance: 'red' as const,
    station: null,
    fieldImagePath: null,
    caption: teamLabel,
  };

  if (desktop) {
    return (
      <EntryContext value={context}>
        <div className="overflow-clip rounded-card border border-line bg-surface">
          {header}
          {pane}
          <div className="px-7 pt-2 pb-6">
            <Button variant="primary" size="block" className="min-h-14" onClick={review}>
              {reviewLabel}
            </Button>
          </div>
        </div>
        {dialogs}
      </EntryContext>
    );
  }

  // Inside the page's <main> (SuperEntryPage), which carries the pinned foot.
  return (
    <EntryContext value={context}>
      <div ref={mainRef} className="flex flex-1 touch-pan-y touch-pinch-zoom flex-col">
        {header}
        <div className="flex flex-1 flex-col">{pane}</div>
        <div className="sticky bottom-[var(--bottom-bar,0px)] z-20 mt-6 px-4 [&>div]:mt-0">
          <ActionBar>
            <Button variant="primary" size="block" onClick={review}>
              {reviewLabel}
            </Button>
          </ActionBar>
        </div>
        {dialogs}
      </div>
    </EntryContext>
  );
}

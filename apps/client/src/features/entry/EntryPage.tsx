import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FormFieldDefinition, RobotStatus } from '@frc/shared';
import { StickyActionBar } from '@/components/entry/StickyActionBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/ui/notice';
import { useModalFocus } from '@/components/ui/useModalFocus';
import { cachedFormFields } from '@/data/cache';
import { FieldInput } from './FieldInput';
import { RobotStatusPicker } from './RobotStatusPicker';
import { canSelfEdit, type Editor, type LocalEntry } from './localEntries';
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

const PHASE_ORDER = ['auto', 'teleop', 'endgame', 'post_match'] as const;
const PHASE_LABEL: Record<string, string> = {
  auto: 'Autonomous',
  teleop: 'Teleop',
  endgame: 'Endgame',
  post_match: 'Post-match',
};

export function EntryPage(props: EntryPageProps) {
  const draftKey = `${props.formVersionId}:${props.matchId}:${props.teamId}`;
  const { draft, loaded, save } = useDraft(draftKey);
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [breakdownSeconds, setBreakdownSeconds] = useState<number>(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const breakdownId = useId();

  // A failed submit keeps the entry and the sheet; the reason is moved into view and
  // focused, beside the button the scout just pressed.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    void cachedFormFields(props.formVersionId).then(setFields);
  }, [props.formVersionId]);

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

  const byPhase = useMemo(() => {
    const groups = new Map<string, FormFieldDefinition[]>();
    for (const field of fields) {
      const phase = field.phase ?? 'post_match';
      groups.set(phase, [...(groups.get(phase) ?? []), field]);
    }
    return groups;
  }, [fields]);

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

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h1 className="text-xl font-semibold">
          {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
        </h1>
        <Badge tone={props.alliance === 'red' ? 'alliance-red' : 'alliance-blue'}>
          {props.alliance === 'red' ? 'Red alliance' : 'Blue alliance'}
        </Badge>
      </header>

      <div className="mt-5">
        <RobotStatusPicker value={status} onChange={(s) => update({ status: s })} />
      </div>

      {status === 'broke_down' && (
        <div className="mt-5">
          <Label htmlFor={breakdownId}>Breakdown time (seconds from match start)</Label>
          <Input
            id={breakdownId}
            type="number"
            min={0}
            inputMode="numeric"
            className="mt-1.5"
            value={breakdownSeconds}
            onChange={(e) => update({ seconds: Number(e.target.value) })}
          />
        </div>
      )}

      {status !== null &&
        !dead &&
        PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? []).length > 0).map((phase) => (
          <details
            key={phase}
            open
            className="group mt-4 rounded-xl border border-border bg-surface"
          >
            <summary className="tap-target flex cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {PHASE_LABEL[phase]}
              <ChevronDown
                aria-hidden="true"
                className="motion-transition size-4 text-text-muted group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-border px-4 pb-2">
              {(byPhase.get(phase) ?? []).map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={data[field.key]}
                  onChange={(value) => update({ data: { ...data, [field.key]: value } })}
                />
              ))}
            </div>
          </details>
        ))}

      {dead && (
        <Notice still className="mt-5">
          No fields are recorded for a {status === 'no_show' ? 'no-show' : 'disabled'} robot. The
          entry records the status only — never zeros.
        </Notice>
      )}

      <StickyActionBar>
        <Button
          variant="primary"
          size="block"
          disabled={status === null}
          onClick={() => setReviewing(true)}
        >
          Review entry
        </Button>
      </StickyActionBar>

      {reviewing && (
        <ReviewDialog
          matchLabel={props.matchLabel}
          teamLabel={props.teamLabel}
          alliance={props.alliance}
          status={status}
          dead={dead}
          fields={fields}
          data={data}
          error={error}
          errorRef={errorRef}
          onBack={() => setReviewing(false)}
          onSubmit={() => void commit()}
        />
      )}
    </main>
  );
}

/**
 * The confirmation summary of the whole entry (SPEC-FINAL 8.2). A full-screen sheet that
 * slides up — the scout must notice they are now confirming, not editing — with
 * ConfirmDialog's focus rules: first focus on Keep editing, Escape keeps editing.
 */
function ReviewDialog(props: {
  matchLabel: string;
  teamLabel: string;
  alliance: 'red' | 'blue';
  status: RobotStatus | null;
  dead: boolean;
  fields: FormFieldDefinition[];
  data: Record<string, unknown>;
  error: string | null;
  errorRef: RefObject<HTMLParagraphElement | null>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const { panel, onKeyDown } = useModalFocus(props.onBack, back);
  const rows: { label: string; value: string; hebrew: boolean }[] = [
    { label: 'Match', value: props.matchLabel, hebrew: false },
    { label: 'Team', value: props.teamLabel, hebrew: true },
    { label: 'Alliance', value: props.alliance, hebrew: false },
    { label: 'Status', value: props.status ?? '', hebrew: false },
    ...(props.dead
      ? []
      : props.fields.map((field) => ({
          label: field.label,
          value: String(props.data[field.key] ?? '—'),
          hebrew: true,
        }))),
  ];
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm this entry"
      onKeyDown={onKeyDown}
      className="enter-sheet-up fixed inset-0 z-40 flex flex-col overflow-auto bg-bg"
    >
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <h2 className="text-xl font-semibold">Confirm this entry</h2>
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface text-sm">
          {rows.map((row, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-text-muted" dir={row.hebrew ? 'auto' : undefined}>
                {row.label}
              </dt>
              <dd
                className="text-end font-medium tabular-nums"
                dir={row.hebrew ? 'auto' : undefined}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {/* The failed-submit reason is a DIRECT child of this .sticky footer: in view, beside
          the button just pressed (EntryPage.test.tsx asserts the parent). */}
      <div className="sticky bottom-0 border-t border-border bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {props.error && (
          <p
            ref={props.errorRef}
            role="alert"
            tabIndex={-1}
            dir="auto"
            className="mx-auto mb-3 max-w-xl rounded-lg border border-s-4 border-border border-s-danger bg-surface p-3 text-sm"
          >
            <span className="font-semibold">Not saved. </span>
            {props.error}
          </p>
        )}
        <div className="tap-row mx-auto flex max-w-xl">
          <Button
            ref={back}
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={props.onBack}
          >
            Keep editing
          </Button>
          <Button variant="primary" size="lg" className="flex-1" onClick={props.onSubmit}>
            Submit entry
          </Button>
        </div>
      </div>
    </div>
  );
}

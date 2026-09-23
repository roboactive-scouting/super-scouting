import { useEffect, useMemo, useState } from 'react';
import type { FormFieldDefinition, RobotStatus } from '@frc/shared';
import { cachedFormFields } from '@/data/cache';
import { FieldInput } from './FieldInput';
import { RobotStatusPicker } from './RobotStatusPicker';
import { canSelfEdit, type LocalEntry } from './localEntries';
import { submitEntry } from './submitEntry';
import { useDraft } from './useDraft';

export type EntryPageProps = {
  eventId: string;
  formVersionId: string;
  matchId: string;
  teamId: string;
  alliance: 'red' | 'blue';
  authorUserId: string;
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
    if (props.existing && !canSelfEdit(props.existing, props.authorUserId, new Date())) {
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
        authorUserId: props.authorUserId,
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
    <main className="mx-auto max-w-xl p-4 pb-32">
      <header className="mb-2">
        <h1 className="text-lg font-semibold">
          {props.matchLabel} · <span dir="auto">{props.teamLabel}</span>
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {props.alliance === 'red' ? 'Red alliance' : 'Blue alliance'}
        </p>
      </header>

      <RobotStatusPicker value={status} onChange={(s) => update({ status: s })} />

      {status === 'broke_down' && (
        <label className="block py-3">
          <span className="text-sm font-medium">Breakdown time (seconds from match start)</span>
          <input
            type="number"
            min={0}
            className="tap-target mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            value={breakdownSeconds}
            onChange={(e) => update({ seconds: Number(e.target.value) })}
          />
        </label>
      )}

      {status !== null &&
        !dead &&
        PHASE_ORDER.filter((phase) => (byPhase.get(phase) ?? []).length > 0).map((phase) => (
          <details key={phase} open className="mt-4 rounded-lg border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-semibold">{PHASE_LABEL[phase]}</summary>
            {(byPhase.get(phase) ?? []).map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={data[field.key]}
                onChange={(value) => update({ data: { ...data, [field.key]: value } })}
              />
            ))}
          </details>
        ))}

      {dead && (
        <p className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">
          No fields are recorded for a {status === 'no_show' ? 'no-show' : 'disabled'} robot. The
          entry records the status only — never zeros.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--surface)] p-3">
        <button
          type="button"
          disabled={status === null}
          className="tap-target w-full rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)] disabled:opacity-50"
          onClick={() => setReviewing(true)}
        >
          Review entry
        </button>
      </div>

      {reviewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm this entry"
          className="fixed inset-0 z-10 overflow-auto bg-[var(--bg)] p-4"
        >
          <h2 className="text-lg font-semibold">Confirm this entry</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div>
              <dt className="inline font-medium">Match: </dt>
              <dd className="inline">{props.matchLabel}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Team: </dt>
              <dd className="inline" dir="auto">
                {props.teamLabel}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Alliance: </dt>
              <dd className="inline">{props.alliance}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Status: </dt>
              <dd className="inline">{status}</dd>
            </div>
            {!dead &&
              fields.map((field) => (
                <div key={field.key}>
                  <dt className="inline font-medium" dir="auto">
                    {field.label}:{' '}
                  </dt>
                  <dd className="inline" dir="auto">
                    {String(data[field.key] ?? '—')}
                  </dd>
                </div>
              ))}
          </dl>
          {error && (
            <p role="alert" className="mt-3 text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="tap-row mt-4 flex gap-2">
            <button
              type="button"
              className="tap-target flex-1 rounded-lg border border-[var(--border)]"
              onClick={() => setReviewing(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="tap-target flex-1 rounded-lg bg-[var(--brand-plate)] font-semibold text-[var(--brand)]"
              onClick={() => void commit()}
            >
              Submit entry
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

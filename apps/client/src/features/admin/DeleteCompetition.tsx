import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DeleteImpactOutput } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { ErrorLine } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { MANAGE_UNREACHABLE, panelErrorLine } from './adminMessages';

/** The use cases' own refusals (SPEC-FINAL 3.9), shown before the admin even asks. */
export const SWITCH_SEASON_FIRST = 'Switch the active season first.';
export const SWITCH_EVENT_FIRST = 'Switch the default event first.';

export type DeleteTarget = {
  kind: 'season' | 'event';
  id: string;
  /** What the admin types back to confirm: the season's year or the event's name. */
  name: string;
  /** The object named in full in the confirmation: "2025 — CRESCENDO", or the event. */
  label: string;
  /** The active season or the default event, which cannot be deleted. */
  active: boolean;
};

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The damage as one sentence (SPEC-FINAL 17.8: exact counts). A season names its events
 * (and its forms, when it has any); an event names its matches and entries.
 */
export function damageLine(kind: DeleteTarget['kind'], impact: DeleteImpactOutput): string {
  const parts = kind === 'season' ? [counted(impact.events, 'event', 'events')] : [];
  parts.push(counted(impact.matches, 'match', 'matches'));
  parts.push(counted(impact.entries, 'entry', 'entries'));
  if (kind === 'season' && impact.forms > 0) parts.push(counted(impact.forms, 'form', 'forms'));
  const last = parts.pop();
  return `This deletes ${parts.join(', ')} and ${last} for good.`;
}

/**
 * "Delete …", the secondary action of the Edit season dialog and the event's ✎ dialog
 * (SPEC-FINAL 3.9, 17.8; task RB.20). Online only. It first asks the server for the
 * damage (`dry_run`), then opens the one destructive pattern with the counts, the backup
 * line, and type-to-confirm on the name. The active season or default event shows the
 * action off with the server's own refusal. `onDeleted` runs once the server deleted it.
 */
export function DeleteCompetition({
  target,
  rpc,
  onDeleted,
}: {
  target: DeleteTarget;
  rpc: Rpc;
  onDeleted: (id: string) => void;
}) {
  const noteId = useId();
  const online = useOnline();
  const [impact, setImpact] = useState<DeleteImpactOutput | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const season = target.kind === 'season';
  const useCase = season ? 'deleteSeason' : 'deleteEvent';
  const ids = season ? { season_id: target.id } : { event_id: target.id };
  const refusal = target.active
    ? season
      ? SWITCH_SEASON_FIRST
      : SWITCH_EVENT_FIRST
    : online
      ? null
      : MANAGE_UNREACHABLE;

  async function askDamage() {
    setError(null);
    setConfirmError(null);
    setChecking(true);
    try {
      setImpact((await rpc.call(useCase, { ...ids, dry_run: true })) as DeleteImpactOutput);
    } catch (e) {
      setError(panelErrorLine(e));
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setConfirmError(null);
    try {
      await rpc.call(useCase, { ...ids, confirm_name: target.name });
      setBusy(false);
      setImpact(null);
      onDeleted(target.id);
    } catch (e) {
      setBusy(false);
      setConfirmError(panelErrorLine(e));
    }
  }

  return (
    <div className="mt-2 border-t border-line pt-4">
      <Button
        variant="secondary"
        disabled={refusal !== null}
        busy={checking}
        aria-describedby={refusal ? noteId : undefined}
        onClick={() => void askDamage()}
      >
        <Trash2 aria-hidden="true" />
        <span dir="auto">{`Delete ${target.name}`}</span>
      </Button>
      {refusal && (
        <p id={noteId} className="mt-1.5 text-[0.8125rem] text-muted">
          {refusal}
        </p>
      )}
      {error && <ErrorLine className="mt-3">{error}</ErrorLine>}
      {/* The confirm opens over a dialog: its keys (Escape, Tab) must not reach that
          dialog's own handlers through the React tree and close or trap it too. */}
      <div className="contents" onKeyDown={(e) => e.stopPropagation()}>
        <DestructiveConfirm
          open={impact !== null}
          title={season ? 'Delete this season?' : 'Delete this event?'}
          objectName={target.label}
          body={
            <>
              {impact && (
                <p className="font-semibold text-ink">{damageLine(target.kind, impact)}</p>
              )}
              <p className="mt-1.5">
                It cannot be undone. Run <code className="num">supabase db dump</code> first if you
                might need them.
              </p>
            </>
          }
          confirmLabel={`Delete ${target.name} for good`}
          icon={Trash2}
          typeToConfirm={target.name}
          busy={busy}
          error={confirmError}
          onConfirm={() => void confirm()}
          onCancel={() => setImpact(null)}
        />
      </div>
    </div>
  );
}

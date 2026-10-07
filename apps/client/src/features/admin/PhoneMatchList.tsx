import { useState } from 'react';
import type { MatchRow, MatchSlot, MatchType } from '@frc/shared';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { Segmented } from '@/components/ui/segmented';
import type { Rpc } from '@/data/rpc';
import { matchLabel } from '@/lib/matchLabel';
import { AddMatchesSheet } from './AddMatchesSheet';
import { EditMatchSheet } from './EditMatchSheet';
import { LeaveGuard } from './LeaveGuard';
import { MatchCard } from './MatchCard';
import { MatchErrors } from './MatchErrors';
import { COMPUTER_LINE, DELETE_MATCH_BODY, MATCH_TYPE_OPTIONS, type MatchPatch } from './matchOps';
import { useMatchEditing } from './useMatchEditing';
import { useOffRosterTeams } from './useOffRosterTeams';
import type { usePhoneMatches } from './usePhoneMatches';

/**
 * The phone matches view once loaded (README "Match list"): the type, one card per match,
 * Add matches pinned at the bottom with the one line saying the rest needs a computer, and
 * the edit sheet, add sheet and delete confirmation.
 */
export function PhoneMatchList({
  rpc,
  eventId,
  eventName,
  online,
  data,
}: {
  rpc: Rpc;
  eventId: string;
  eventName: string;
  online: boolean;
  data: ReturnType<typeof usePhoneMatches>;
}) {
  const { matches, roster } = data;
  const editing = useMatchEditing({
    rpc,
    eventId,
    roster,
    matches,
    onMatchesChange: data.setMatches,
    onRosterChange: data.setRoster,
    saves: data.saves,
  });
  const { rosterIds, byId } = useOffRosterTeams(rpc, matches, roster, editing.savedCount);
  const [type, setType] = useState<MatchType>('qualification');
  const [open, setOpen] = useState<MatchRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<MatchRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // A "Not saved" match stays in sight, marked, whatever the type shown.
  const shown = matches.filter((m) => m.match_type === type || editing.unsaved.has(m.id));
  const sheetOpen = open !== null || adding;

  async function save(match: MatchRow, slots: MatchSlot[], patch: MatchPatch) {
    if (Object.keys(patch).length > 0 && !(await editing.update(match, patch))) return false;
    void editing.saveSlots(match.id, slots);
    return true;
  }

  async function confirmDelete() {
    if (!confirming) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await editing.remove(confirming);
      setConfirming(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    // data-pinned-foot: a short list still has Add matches at the bottom (see ActionBar).
    <main data-pinned-foot="" className="flex flex-1 flex-col gap-2 px-4 pt-3">
      {!online && (
        <p role="status" className="text-sm text-muted">
          No connection — changes cannot be saved until it returns.
        </p>
      )}
      <div>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.02em]">Matches</h1>
        <p className="mt-0.5 text-[0.78125rem] text-muted" dir="auto">
          {eventName}
        </p>
      </div>
      <Segmented label="Match type" options={MATCH_TYPE_OPTIONS} value={type} onChange={setType} />
      {editing.status && (
        <p role="status" className="text-sm">
          {editing.status}
        </p>
      )}
      <MatchErrors editing={editing} showError={!sheetOpen} />
      {shown.length === 0 ? (
        <p className="flex-1 py-4 text-muted">No matches yet.</p>
      ) : (
        <ul className="flex flex-1 flex-col gap-2">
          {shown.map((m) => (
            <li key={m.id}>
              <MatchCard
                match={m}
                teams={byId}
                rosterIds={rosterIds}
                unsaved={editing.unsaved.has(m.id)}
                onOpen={() => {
                  editing.setError(null);
                  setOpen(m);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <ActionBar>
        <div className="flex w-full flex-col gap-1">
          <Button
            variant="primary"
            size="block"
            onClick={() => {
              editing.setError(null);
              setAdding(true);
            }}
          >
            Add matches
          </Button>
          <p className="text-center text-xs text-muted">{COMPUTER_LINE}</p>
        </div>
      </ActionBar>
      {open && (
        <EditMatchSheet
          match={open}
          roster={roster}
          teams={byId}
          rosterIds={rosterIds}
          error={editing.error}
          onSave={(slots, patch) => save(open, slots, patch)}
          onDelete={() => {
            setOpen(null);
            setDeleteError(null);
            setConfirming(open);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {adding && (
        <AddMatchesSheet
          matches={matches}
          initialType={type}
          error={editing.error}
          onCreateMany={editing.createMany}
          onCreateOne={editing.createOne}
          onClose={() => setAdding(false)}
        />
      )}
      <DestructiveConfirm
        open={confirming !== null}
        title="Delete this match?"
        objectName={confirming ? matchLabel(confirming) : ''}
        body={DELETE_MATCH_BODY}
        confirmLabel="Delete"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirming(null)}
      />
      <LeaveGuard matches={matches} unsaved={data.saves.held} />
    </main>
  );
}

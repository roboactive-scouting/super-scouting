import { useState } from 'react';
import type { Alliance, MatchRow, MatchType } from '@frc/shared';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { Segmented } from '@/components/ui/segmented';
import { matchLabel } from '@/lib/matchLabel';
import { EditMatchDialog } from './EditMatchDialog';
import { LineupGrid } from './LineupGrid';
import { MatchErrors } from './MatchErrors';
import { MatchesToolbar } from './MatchesToolbar';
import {
  DELETE_MATCH_BODY,
  MATCH_TYPE_OPTIONS,
  matchesShown,
  notOnRosterLine,
  type Station,
  type Typed,
} from './matchOps';
import { ProblemBar } from './ProblemBar';
import { useMatchEditing, type MatchEditingProps } from './useMatchEditing';
import { useOffRosterTeams } from './useOffRosterTeams';

/**
 * The Matches tab (README "Matches", SPEC-FINAL 6.4): the toolbar, the problem summary
 * and the typed line-up grid, filtered by match type like the phone list (UF.9): the same
 * segmented control and the same rule (a "Not saved" match stays in sight). The toolbar's
 * type is the filter's, so a match just created is on screen. ManagePage owns the lists (so
 * the tab counts stay right); every change is reported through `onMatchesChange` /
 * `onRosterChange`.
 */
export function MatchesPanel(props: MatchEditingProps) {
  const { rpc, matches, roster } = props;
  const editing = useMatchEditing(props);
  const { rosterIds, byId } = useOffRosterTeams(rpc, matches, roster, editing.savedCount);
  const [type, setType] = useState<MatchType>('qualification');
  const shown = matchesShown(matches, type, editing.unsaved);
  const [editingMatch, setEditingMatch] = useState<MatchRow | null>(null);
  const [confirming, setConfirming] = useState<MatchRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onSlot(match: MatchRow, alliance: Alliance, station: Station, typed: Typed) {
    if (typed.kind === 'unknown') {
      editing.setError(notOnRosterLine(typed.text));
      return;
    }
    void editing.saveSlot(match.id, alliance, station, typed.kind === 'team' ? typed.teamId : null);
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
    <section aria-label="Matches" className="relative rounded-card border border-line bg-surface">
      <MatchesToolbar matches={matches} editing={editing} type={type} onTypeChange={setType} />
      <ProblemBar
        matches={matches}
        rosterIds={rosterIds}
        teams={byId}
        onAddToRoster={(teamId) => void editing.addToRoster(teamId)}
      />
      {editing.status && (
        <p role="status" className="px-3.5 pt-3 text-sm">
          {editing.status}
        </p>
      )}
      <MatchErrors editing={editing} showError={!editingMatch} className="mx-3.5 mt-3" />
      <div className="max-w-md px-3.5 pt-3">
        <Segmented
          label="Show matches"
          options={MATCH_TYPE_OPTIONS}
          value={type}
          onChange={setType}
        />
      </div>
      {shown.length === 0 ? (
        <p className="px-3.5 py-6 text-muted">No matches yet.</p>
      ) : (
        <LineupGrid
          matches={shown}
          roster={roster}
          teams={byId}
          rosterIds={rosterIds}
          busyIds={editing.busyIds}
          unsavedIds={editing.unsaved}
          onSlot={onSlot}
          onEdit={(m) => {
            editing.setError(null);
            setEditingMatch(m);
          }}
          onDelete={(m) => {
            setDeleteError(null);
            setConfirming(m);
          }}
        />
      )}
      {editingMatch && (
        <EditMatchDialog
          match={editingMatch}
          error={editing.error}
          onSave={(patch) => editing.update(editingMatch, patch)}
          onClose={() => setEditingMatch(null)}
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
    </section>
  );
}

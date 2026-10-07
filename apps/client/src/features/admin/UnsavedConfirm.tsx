import type { MatchRow } from '@frc/shared';
import { DestructiveConfirm } from '@/components/ui/destructive-confirm';
import { matchLabel } from '@/lib/matchLabel';

const DROPS = {
  switch: { line: 'Switching competition drops them.', go: 'Switch anyway' },
  leave: { line: 'Leaving this page drops them.', go: 'Leave anyway' },
} as const;

/**
 * Asked before "Not saved" line-ups are dropped (RB.17 fix 2): another event or season
 * chosen, or Manage left. Names the matches; first focus on Stay (SPEC-FINAL 17.8).
 */
export function UnsavedConfirm({
  open,
  action,
  matches,
  unsaved,
  onStay,
  onGo,
}: {
  open: boolean;
  action: keyof typeof DROPS;
  matches: readonly MatchRow[];
  unsaved: ReadonlySet<string>;
  onStay: () => void;
  onGo: () => void;
}) {
  const n = unsaved.size;
  const labels = matches.filter((m) => unsaved.has(m.id)).map(matchLabel);
  // Never an empty bold line: the count when the ids name none of the matches shown.
  const named = labels.length > 0 ? labels.join(', ') : `${n} ${n === 1 ? 'match' : 'matches'}`;
  return (
    <DestructiveConfirm
      open={open}
      title="Leave without saving?"
      objectName={named}
      body={`${n} match ${n === 1 ? 'line-up was' : 'line-ups were'} not saved. ${DROPS[action].line}`}
      confirmLabel={DROPS[action].go}
      cancelLabel="Stay"
      icon={null}
      onConfirm={onGo}
      onCancel={onStay}
    />
  );
}

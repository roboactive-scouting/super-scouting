import { Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useCapability } from '@/components/OfflineGate';
import { Button } from '@/components/ui/button';
import { MANAGE_UNREACHABLE } from './adminMessages';

/**
 * "Delete …", the secondary action at the end of the Edit season dialog and the event's ✎
 * dialog (RB.20; task 1.61). It opens the one DeleteDialog, which counts on the server first;
 * the active season and the default event open its Blocked face. Held while offline: every
 * hard delete and its count are server commands (`delete_objects`, SPEC-FINAL 9.6).
 */
export function DeleteAction({ name, onDelete }: { name: string; onDelete: () => void }) {
  const noteId = useId();
  const can = useCapability('delete_objects');
  return (
    <div className="mt-2 border-t border-line pt-4">
      <Button
        variant="secondary"
        disabled={!can}
        aria-describedby={can ? undefined : noteId}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" />
        <span dir="auto">{`Delete ${name}`}</span>
      </Button>
      {!can && (
        <p id={noteId} className="mt-1.5 text-[0.8125rem] text-muted">
          {MANAGE_UNREACHABLE}
        </p>
      )}
    </div>
  );
}

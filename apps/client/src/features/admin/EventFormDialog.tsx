import { useId, useState, type FormEvent } from 'react';
import { createEventInput, type EventRow } from '@frc/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorLine } from '@/components/ui/notice';
import type { Rpc } from '@/data/rpc';
import { TextField } from './fields';
import { panelErrorLine } from './adminMessages';

/**
 * Today's event form (a name only), in a dialog: "+ New event" creates it last in its
 * season (SPEC-FINAL 6.2), ✎ renames. The answer is the saved row, put in place by the page.
 */
export function EventFormDialog({
  open,
  event,
  seasonId,
  rpc,
  onSaved,
  onClose,
}: {
  open: boolean;
  /** `null` creates an event. */
  event: EventRow | null;
  seasonId: string;
  rpc: Rpc;
  onSaved: (row: EventRow) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={event ? `Rename ${event.name}` : 'New event'} onClose={onClose}>
      <EventForm
        key={event?.id ?? 'new'}
        event={event}
        seasonId={seasonId}
        rpc={rpc}
        onSaved={onSaved}
        onClose={onClose}
      />
    </Dialog>
  );
}

function EventForm({
  event,
  seasonId,
  rpc,
  onSaved,
  onClose,
}: {
  event: EventRow | null;
  seasonId: string;
  rpc: Rpc;
  onSaved: (row: EventRow) => void;
  onClose: () => void;
}) {
  const errorId = useId();
  const [name, setName] = useState(event?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = createEventInput.shape.name.safeParse(name);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    setBusy(true);
    try {
      const row = (await rpc.call(
        event ? 'updateEvent' : 'createEvent',
        event
          ? { event_id: event.id, name: checked.data }
          : { season_id: seasonId, name: checked.data },
      )) as EventRow;
      onSaved(row);
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="-mt-4 flex flex-col">
      <TextField label="Name" value={name} onChange={setName} invalid={!!error} errorId={errorId} />
      {error && (
        <ErrorLine id={errorId} className="mt-4">
          {error}
        </ErrorLine>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
          {event ? 'Save name' : 'Create event'}
        </Button>
      </div>
    </form>
  );
}

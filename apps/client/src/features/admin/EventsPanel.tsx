import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { createEventInput, type EventRow } from '@frc/shared';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/buttonStyles';
import { StateMessage } from '@/components/StateMessage';
import { typedCall as defaultCall, type Rpc } from '@/data/rpc';
import { useOnline } from '@/lib/useOnline';
import { OFFLINE_SWITCH_HINT } from './SeasonsPanel';
import { panelErrorLine, unreachable } from './adminMessages';
import { FormError, TextField } from './fields';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * SPEC-FINAL 6.2, 6.4: a season's events in `sort_order`, with up/down reorder (sends the
 * whole new order — display order only, never a re-weight), create, rename and "make the
 * default" (the event every device opens to). `rpc` is injectable, as `SeasonsPanel` is.
 */
export const REORDER_NOTE =
  'Reordering changes display order only. It never re-weights aggregates — every event counts equally.';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; events: EventRow[]; activeEventId: string | null }
  | { status: 'unreachable' }
  | { status: 'failed'; line: string };

type FormState = { kind: 'none' } | { kind: 'create' } | { kind: 'edit'; event: EventRow };

async function loadEvents(
  rpc: Rpc,
  seasonId: string,
): Promise<{ events: EventRow[]; activeEventId: string | null }> {
  const [eventsOut, contextOut] = await Promise.all([
    rpc.call('listEvents', { season_id: seasonId }),
    rpc.call('getActiveContext', {}),
  ]);
  const items = (eventsOut as { items: EventRow[] }).items;
  const activeEventId = (contextOut as { active_event_id: string | null }).active_event_id;
  return { events: [...items].sort((a, b) => a.sort_order - b.sort_order), activeEventId };
}

export function EventsPanel({
  seasonId,
  rpc = { call: defaultCall },
  onChanged,
}: {
  seasonId: string;
  rpc?: Rpc;
  /**
   * Called after a create, rename, reorder or "make the default" succeeds (task 1.21,
   * following the pattern `SeasonsPanel`'s own `onChanged` set in task 1.20): `ManagePage`
   * re-reads this season's events on it, so its Teams/Matches tabs' event picker and "create
   * an event first" gate pick up the change without a reload.
   */
  onChanged?: () => void;
}) {
  const online = useOnline();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<FormState>({ kind: 'none' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    loadEvents(rpc, seasonId).then(
      (result) => {
        if (live) setLoad({ status: 'ready', ...result });
      },
      (e: unknown) => {
        if (!live) return;
        setLoad(
          unreachable(e)
            ? { status: 'unreachable' }
            : { status: 'failed', line: panelErrorLine(e) },
        );
      },
    );
    return () => {
      live = false;
    };
    // rpc is an injected dependency held stable by the caller; only a retry re-fetches.
  }, [seasonId, attempt]);

  async function move(events: EventRow[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= events.length) return;
    const order = [...events];
    const [moved] = order.splice(index, 1);
    if (!moved) return;
    order.splice(target, 0, moved);
    setBusyId(events[index]?.id ?? null);
    setActionError(null);
    try {
      await rpc.call('reorderEvents', { season_id: seasonId, event_ids: order.map((e) => e.id) });
      reload();
      onChanged?.();
    } catch (e) {
      setActionError(panelErrorLine(e));
    } finally {
      setBusyId(null);
    }
  }

  async function makeDefault(event: EventRow) {
    setBusyId(event.id);
    setActionError(null);
    try {
      await rpc.call('setActiveEvent', { event_id: event.id });
      reload();
      onChanged?.();
    } catch (e) {
      setActionError(panelErrorLine(e));
    } finally {
      setBusyId(null);
    }
  }

  if (load.status === 'unreachable') {
    return (
      <StateMessage
        variant="offline-needs-server"
        headingLevel={2}
        detail="Events live on the server, and this device cannot reach it right now."
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }
  if (load.status === 'failed') {
    return (
      <StateMessage
        variant="failed"
        headingLevel={2}
        title="Events did not load"
        detail={load.line}
        action={{ label: 'Try again', onClick: reload }}
      />
    );
  }

  return (
    <section aria-label="Events">
      <SectionHeader
        title="Events"
        actions={
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() =>
              setForm((f) => (f.kind === 'create' ? { kind: 'none' } : { kind: 'create' }))
            }
          >
            {form.kind === 'create' ? 'Cancel' : 'New event'}
          </button>
        }
      />
      <p className="mt-2 text-sm text-text-muted">{REORDER_NOTE}</p>
      {!online && <p className="mt-1 text-sm text-text-muted">{OFFLINE_SWITCH_HINT}</p>}
      {load.status === 'loading' ? (
        <p className="mt-4 text-text-muted">Loading the events…</p>
      ) : (
        <Table containerClassName="mt-4 rounded-xl border border-border bg-surface">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Default event</TableHead>
              <TableHead numeric>Order</TableHead>
              <TableHead>Rename</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {load.events.map((event, index) => (
              <TableRow key={event.id}>
                <TableCell dir="auto">{event.name}</TableCell>
                <TableCell>
                  {event.id === load.activeEventId ? (
                    <Badge tone="success">Default</Badge>
                  ) : (
                    <button
                      type="button"
                      dir="auto"
                      className={SECONDARY_BUTTON}
                      disabled={!online || busyId !== null}
                      onClick={() => void makeDefault(event)}
                    >
                      {busyId === event.id ? 'Switching…' : `Make ${event.name} the default`}
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="tap-row flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${event.name} up`}
                      title={`Move ${event.name} up`}
                      dir="auto"
                      disabled={index === 0 || busyId !== null}
                      onClick={() => void move(load.events, index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${event.name} down`}
                      title={`Move ${event.name} down`}
                      dir="auto"
                      disabled={index === load.events.length - 1 || busyId !== null}
                      onClick={() => void move(load.events, index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" onClick={() => setForm({ kind: 'edit', event })}>
                    <Pencil aria-hidden="true" />
                    Rename
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <FormError message={actionError} />
      {form.kind !== 'none' && (
        <EventForm
          event={form.kind === 'edit' ? form.event : null}
          seasonId={seasonId}
          rpc={rpc}
          onDone={() => {
            setForm({ kind: 'none' });
            reload();
            onChanged?.();
          }}
          onCancel={() => setForm({ kind: 'none' })}
        />
      )}
    </section>
  );
}

function EventForm({
  event,
  seasonId,
  rpc,
  onDone,
  onCancel,
}: {
  event: EventRow | null;
  seasonId: string;
  rpc: Rpc;
  onDone: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [name, setName] = useState(event?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Only `name` is user input; `event.id` / `seasonId` are internal row ids, checked
    // in full (uuid included) by the default `call()` before any real request.
    const checkedName = createEventInput.shape.name.safeParse(name);
    if (!checkedName.success) {
      setError(checkedName.error.issues[0]?.message ?? 'that is not valid');
      return;
    }
    const payload = event
      ? { event_id: event.id, name: checkedName.data }
      : { season_id: seasonId, name: checkedName.data };
    setBusy(true);
    try {
      await rpc.call(event ? 'updateEvent' : 'createEvent', payload);
      onDone();
    } catch (err) {
      setError(panelErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 max-w-sm">
      <form aria-labelledby={titleId} noValidate onSubmit={(e) => void submit(e)}>
        <CardTitle id={titleId} level={3}>
          {event ? `Rename ${event.name}` : 'New event'}
        </CardTitle>
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          invalid={!!error}
          errorId={errorId}
        />
        <FormError id={errorId} message={error} />
        <div className="tap-row mt-4 flex gap-2">
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : event ? 'Save name' : 'Create event'}
          </button>
          <button type="button" disabled={busy} className={SECONDARY_BUTTON} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

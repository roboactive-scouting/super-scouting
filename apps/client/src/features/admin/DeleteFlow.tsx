import { useEffect, useState } from 'react';
import {
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  type DeleteBlockedReason,
  type DeleteKind,
  type GetDeleteImpactOutput,
} from '@frc/shared';
import { sentence } from '@/auth/messages';
import { OFFLINE_GATE_LINE, useCapability } from '@/components/OfflineGate';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { ErrorLine } from '@/components/ui/notice';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { RpcError, type Rpc } from '@/data/rpc';
import { softDeleteEntry } from '@/features/entry/softDeleteEntry';
import { DeleteDialog, type BlockedWay, type DeleteFact, type DeleteSubject } from './DeleteDialog';

/**
 * What to delete, as the page that opens it knows it. `label` names it while the server counts
 * (the season's year, the event's name, "v2", "Q41"); the server's own name follows.
 */
export type DeleteRequest =
  | { kind: 'season' | 'event' | 'form'; id: string; label: string }
  | {
      kind: 'form_version';
      id: string;
      label: string;
      /** The form it belongs to, named ("Match form 2026"), and its id: the way forward. */
      formName: string;
      formId: string;
      /** The version's dates, for the Blocked band. */
      facts?: DeleteFact[];
      /** "Publish a newer version": the page opens the form in the builder. */
      onPublishNewer?: () => void;
    }
  | {
      kind: 'match';
      id: string;
      label: string;
      /** The event's name, in the bill's sentence. */
      eventName?: string;
      /** "Correct the match number": the page's own editor for it. */
      onCorrect?: () => void;
    }
  | {
      kind: 'entry';
      id: string;
      label: string;
      /** The record on the card. */
      subject: DeleteSubject;
      /** The device holds the entry: the delete rides the outbox (works offline). */
      onDevice: boolean;
      /** The signed-in lead or admin: the operation's author. */
      authorUserId: string;
    };

/** Unreachable, refused or anything else: one sentence for a person, never a code. */
export function deleteErrorLine(e: unknown): string {
  if (e instanceof RpcError && !e.answered) {
    return 'The server could not be reached, so nothing was deleted. Try again when this device is online.';
  }
  if (e instanceof RpcError && e.status === 403) {
    return 'The server says this account may not delete it.';
  }
  if (e instanceof Error && e.message) return sentence(e.message);
  return 'That did not work, so nothing was deleted. Try again.';
}

/** The one-line reason on the Blocked face, for each reason the server gives (task 1.60). */
export function blockedLine(reason: DeleteBlockedReason): string {
  switch (reason) {
    case 'active_season':
      return SWITCH_SEASON_FIRST;
    case 'default_event':
      return SWITCH_EVENT_FIRST;
    case 'version_has_entries':
      return 'It still holds collected data, so there is nothing to confirm here. Pick a way forward.';
    case 'version_published':
      return 'Publish a newer version first, then this one can be deleted. Or delete the whole form.';
    case 'version_active':
      return 'Scouts would be left with nothing to open. Restore another version first, or delete the whole form.';
  }
}

type Load =
  | { status: 'counting' }
  | { status: 'ready'; impact: GetDeleteImpactOutput }
  | { status: 'failed'; line: string };

/** An entry needs no count: it is one record, and a lead may not read the bill. */
const ENTRY_IMPACT = { entries: 1 };

/**
 * Every delete, from the trigger to the server (SPEC-FINAL 3.9, 17.8; task 1.61). The kind's
 * damage is counted on the server first (`getDeleteImpact`, task 1.60), which also says which
 * face opens: `blocked_reason` set → Blocked; `confirm_name` set → Bill + type (a match: the
 * Choice first); neither → Are you sure?. The confirm sends what was typed, so the server is
 * the gate too, and its refusal is said in the dialog. A form version blocked for a reason a
 * whole-form delete removes offers "Delete the whole form…", which opens the form's own bill;
 * the newest published version (the user, 2026-10-29) also offers "Publish a newer version".
 * A draft and a version a newer published one replaced open the bill, typed "v2".
 *
 * One entry is not counted: Are you sure? opens at once. An entry the device holds is
 * soft-deleted through the outbox (works offline, like any change); one it does not hold (the
 * preview read it from the server) through `deleteEntry`, which needs the connection. Every
 * other delete and every count is held offline (`delete_objects`, SPEC-FINAL 9.6).
 */
export function DeleteFlow({
  request,
  rpc,
  onDeleted,
  onClose,
}: {
  request: DeleteRequest;
  rpc: Rpc;
  /** The object is gone on the server (or queued, for an entry this device holds). */
  onDeleted: (deleted: { kind: DeleteKind; id: string }) => void;
  onClose: () => void;
}) {
  const [req, setReq] = useState<DeleteRequest>(request);
  const online = useCapability('delete_objects');
  const queued = useCapability('delete_entry');
  const [load, setLoad] = useState<Load>({ status: 'counting' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entry = req.kind === 'entry' ? req : null;

  useEffect(() => {
    if (req.kind === 'entry') return;
    let live = true;
    setLoad({ status: 'counting' });
    setError(null);
    rpc.call('getDeleteImpact', { kind: req.kind, id: req.id }).then(
      (out) => {
        if (live) setLoad({ status: 'ready', impact: out as GetDeleteImpactOutput });
      },
      (e: unknown) => {
        if (live) setLoad({ status: 'failed', line: deleteErrorLine(e) });
      },
    );
    return () => {
      live = false;
    };
    // Counted when it opens, again on Try again, and for the whole form after a version.
  }, [req.kind, req.id, attempt]);

  async function run(typed: string | undefined) {
    setBusy(true);
    setError(null);
    try {
      await send(req, typed);
      setBusy(false);
      onDeleted({ kind: req.kind, id: req.id });
    } catch (e) {
      setBusy(false);
      setError(deleteErrorLine(e));
    }
  }

  async function send(r: DeleteRequest, typed: string | undefined) {
    switch (r.kind) {
      case 'season':
        return rpc.call('deleteSeason', { season_id: r.id, confirm_name: typed });
      case 'event':
        return rpc.call('deleteEvent', { event_id: r.id, confirm_name: typed });
      case 'form':
        return rpc.call('deleteForm', { form_id: r.id, confirm_name: typed });
      case 'form_version':
        return rpc.call('deleteFormVersion', { form_version_id: r.id, confirm_name: typed });
      case 'match':
        // No name to type is the plain delete of a match with no entries; with one, the
        // cascade (entries, soft-deleted ones included, and the match in one transaction).
        return typed === undefined
          ? rpc.call('deleteMatch', { match_id: r.id })
          : rpc.call('deleteMatch', { match_id: r.id, with_entries: true, confirm_name: typed });
      case 'entry':
        return r.onDevice
          ? softDeleteEntry(r.id, r.authorUserId)
          : rpc.call('deleteEntry', { entry_id: r.id });
    }
  }

  if (entry) {
    const held = entry.onDevice
      ? queued
        ? null
        : OFFLINE_GATE_LINE
      : online
        ? null
        : OFFLINE_GATE_LINE;
    return (
      <DeleteDialog
        kind="entry"
        name={entry.label}
        impact={ENTRY_IMPACT}
        subject={entry.subject}
        busy={busy}
        error={error}
        held={held}
        onConfirm={() => void run(undefined)}
        onCancel={onClose}
      />
    );
  }

  if (load.status !== 'ready') {
    return (
      <ResponsiveDialog
        open
        title={
          load.status === 'counting'
            ? `Counting what goes with ${req.label}…`
            : `Delete ${req.label}?`
        }
        onClose={onClose}
        showClose={false}
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {load.status === 'failed' && (
              <Button variant="primary" disabled={!online} onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
            )}
          </>
        }
      >
        {load.status === 'counting' ? (
          <Skeleton rows={3} label="Counting on the server" />
        ) : (
          <ErrorLine>
            What goes with it could not be counted, so nothing can be deleted yet. {load.line}
          </ErrorLine>
        )}
        {!online && <p className="text-sm text-muted">{OFFLINE_GATE_LINE}</p>}
      </ResponsiveDialog>
    );
  }

  const impact = load.impact;
  const ways: BlockedWay[] = [];
  if (
    req.kind === 'form_version' &&
    impact.blocked_reason === 'version_published' &&
    req.onPublishNewer
  ) {
    ways.push({
      title: 'Publish a newer version',
      body: `Publish one from the builder. ${impact.name} can then be deleted on its own.`,
      label: 'Open the builder',
      onSelect: req.onPublishNewer,
    });
  }
  if (req.kind === 'form_version' && impact.blocked_reason?.startsWith('version_')) {
    ways.push({
      title: 'Delete the whole form instead',
      body: `Takes ${req.formName}, every version and every entry bound to it${
        impact.entries > 0 ? `, these ${impact.entries} included` : ''
      }. You confirm it on its own bill, by typing the form's name.`,
      label: 'Delete the whole form…',
      onSelect: () => setReq({ kind: 'form', id: req.formId, label: req.formName }),
    });
  }
  return (
    <DeleteDialog
      // A new object (the whole form after a version) is a new dialog, typed from empty.
      key={`${req.kind}:${req.id}`}
      kind={req.kind}
      name={impact.name}
      confirmName={impact.confirm_name}
      impact={impact}
      blocked={impact.blocked_reason ? blockedLine(impact.blocked_reason) : null}
      blockedReason={impact.blocked_reason}
      ways={ways}
      context={
        req.kind === 'form_version'
          ? req.formName
          : req.kind === 'match'
            ? req.eventName
            : undefined
      }
      facts={req.kind === 'form_version' ? req.facts : undefined}
      held={online ? null : OFFLINE_GATE_LINE}
      busy={busy}
      error={error}
      onCorrectMatch={req.kind === 'match' ? req.onCorrect : undefined}
      onConfirm={(typed) => void run(typed)}
      onCancel={onClose}
    />
  );
}

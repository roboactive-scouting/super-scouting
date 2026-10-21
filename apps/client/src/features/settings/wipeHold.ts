import { db } from '@/data/db';
import { plural } from '@/lib/plural';

/**
 * What holds the device wipe (SPEC-FINAL 9.9, 8.3; task 1.38, built on by 1.49): anything a wipe
 * would destroy that the server does not have yet.
 *
 * - `entries`: scouting entries in the outbox, waiting to send (one operation per row, 9.4).
 * - `other`: any other record waiting to send, never a bare match (6.4: it sends with its entry).
 * - `unacked`: every record without a cloud ack, bare matches included — the guard 9.9 names: a
 *   pending sync state (parked and refused rows, received QR copies not yet acked) or anything
 *   still in the outbox, counted once per row.
 * - `drafts`: unfinished entries (`db.drafts`, match and super) not yet submitted. Practice drafts
 *   never count: they are thrown away anyway (8.5).
 *
 * The device wipe (`data/wipe.ts`, task 1.49) refuses on exactly this — `isHeld` — read inside
 * its own transaction, so the row's "held" and the wipe's refusal can never disagree.
 */
export type WipeHold = { entries: number; other: number; unacked: number; drafts: number };

export async function readWipeHold(): Promise<WipeHold> {
  let entries = 0;
  let other = 0;
  const rows = new Set<string>();
  await db.outbox.each((op) => {
    rows.add(op.row_id);
    if (op.entity === 'scouting_entry') entries++;
    else if (op.entity !== 'match') other++;
  });
  for (const id of await db.syncState.where('sync_state').equals('pending').primaryKeys()) {
    rows.add(id);
  }
  return { entries, other, unacked: rows.size, drafts: await db.drafts.count() };
}

/** True while the wipe must wait: anything at all would be lost. */
export function isHeld(hold: WipeHold): boolean {
  return hold.entries + hold.other + hold.unacked + hold.drafts > 0;
}

/** "3 entries waiting to send, 1 unfinished entry": what holds it, by kind, as a person says it. */
export function holdParts(hold: WipeHold): string[] {
  const parts: string[] = [];
  if (hold.entries > 0) parts.push(`${plural(hold.entries, 'entry', 'entries')} waiting to send`);
  if (hold.other > 0) parts.push(`${plural(hold.other, 'other change')} waiting to send`);
  if (hold.drafts > 0)
    parts.push(`${plural(hold.drafts, 'unfinished entry', 'unfinished entries')}`);
  // Only a bare match left unacked (its entry already sent): still not on the server.
  if (parts.length === 0 && hold.unacked > 0) parts.push('changes waiting to send');
  return parts;
}

/**
 * How many records hold the wipe (SPEC-FINAL 9.9 "reports how many"): every record without a
 * cloud ack (every operation, bare matches included, 9.10), then every unfinished entry.
 */
export function heldCount(hold: WipeHold): number {
  return hold.unacked + hold.drafts;
}

/**
 * The held confirmation's line (16-settings final): "3 entries are still waiting to send. Wipe is
 * held until they are sent, so nothing is lost." Unfinished entries are named as such: they are
 * not waiting to send, they wait to be submitted or discarded.
 */
export function heldSentence(hold: WipeHold): string {
  const { what, until } = heldLines(hold);
  return `${what} ${until}`;
}

/**
 * The same line in its two parts, as the final draws it: `what` holds the wipe (bold), `until`
 * says what lets it go.
 */
export function heldLines(hold: WipeHold): { what: string; until: string } {
  const sending = hold.entries + hold.other || (hold.unacked > 0 ? hold.unacked : 0);
  const noun =
    hold.other === 0 && hold.entries > 0
      ? sending === 1
        ? 'entry is'
        : 'entries are'
      : sending === 1
        ? 'change is'
        : 'changes are';
  const lines: string[] = [];
  if (sending > 0) lines.push(`${sending} ${noun} still waiting to send.`);
  if (hold.drafts > 0) {
    lines.push(
      `${hold.drafts} unfinished ${hold.drafts === 1 ? 'entry is' : 'entries are'} not submitted yet.`,
    );
  }
  const until =
    sending > 0 && hold.drafts > 0
      ? 'they are sent and the unfinished ones are submitted or discarded'
      : sending > 0
        ? sending === 1
          ? 'it is sent'
          : 'they are sent'
        : hold.drafts === 1
          ? 'it is submitted or discarded'
          : 'they are submitted or discarded';
  return { what: lines.join(' '), until: `Wipe is held until ${until}, so nothing is lost.` };
}

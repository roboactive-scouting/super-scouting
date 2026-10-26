import { session } from '@/auth/session';
import { clientConfig } from '@/config';
import { practiceMode } from '@/features/entry/practice';
import { applyDeviceLook } from '@/features/settings/theme';
import { heldCount, isHeld, readWipeHold } from '@/features/settings/wipeHold';
import { clearDevicePrefs } from '@/lib/devicePrefs';
import { notifyChanged } from './changes';
import { db, WIPED_AT_KEY } from './db';
import { recordWiped } from './wipeLog';

export type WipeResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-code' }
  | { ok: false; reason: 'unacked'; unacked: number }
  /** Wipe anyway: the typed count is not the device's count now. `unacked` is the count now. */
  | { ok: false; reason: 'wrong-count'; unacked: number };

/**
 * **Wipe anyway** (SPEC-FINAL 9.9, v1.39): wipe although records have no cloud ack. `expected`
 * is the number of records the lead typed as lost; the wipe goes ahead only when it equals the
 * device's count (`heldCount`) read inside the wipe's own transaction.
 */
export type WipeAnyway = { force: true; expected: number };

/**
 * What a wipe leaves in `meta`: the install's own identity, never anything about a person or a
 * competition. `device.id` names this install to the server (push's `device_id`); `outbox.seq`
 * keeps the local operation order rising for the life of the install; the wipe's own mark is
 * rewritten by the wipe. Everything else goes — the session, the station, the sync watermark and
 * hydration mark, the last sync and failure, the match remap and gone events, the QR disposal
 * notice, the token-loss diagnostic.
 */
const KEPT_META: ReadonlySet<string> = new Set(['device.id', 'outbox.seq', WIPED_AT_KEY]);

/**
 * The lead's code as typed, against `VITE_DEVICE_WIPE_CODE`. Not a secret (SPEC-FINAL 9.9): an
 * accident guard. Exact and case-sensitive; only surrounding spaces are ignored, on both sides
 * (a phone keyboard's trailing space, a padded env value).
 */
export function isWipeCode(code: string): boolean {
  return code.trim() === clientConfig().deviceWipeCode.trim();
}

/**
 * The lead-approved device wipe (SPEC-FINAL 9.9; task 1.49), reached from Settings only.
 *
 * Refused unless `code` is the lead's code, and refused — removing nothing — while anything on
 * the device lacks a cloud ack: any operation in the outbox or pending sync state (parked and
 * refused rows, received QR copies not yet acked, bare matches) or any unfinished entry
 * (`readWipeHold`, the same rule the Settings row shows as held). The check and the wipe are one
 * Dexie transaction, so a record saved meanwhile is either seen by the check or written after the
 * wipe: it can never be lost.
 *
 * It removes the dataset, the outbox's sync states, the drafts and practice drafts, and `meta`
 * but for `KEPT_META`. It keeps the discarded-records log (9.7: for the life of the install).
 * Then the device's own settings (theme, text size, the switches, Sound on) go back to their
 * defaults, practice mode ends and the session signs out: the next person signs in to a device
 * that knows nothing, and the next sync pulls the competition from scratch.
 *
 * With `anyway` (**Wipe anyway**, v1.39; Phase 1 H side task 2) the hold does not refuse it:
 * instead `anyway.expected` must equal the device's count of records without a cloud ack
 * (`heldCount`), read in the same transaction — a record saved after the lead read the count
 * makes it `wrong-count` and removes nothing. When it matches, every one of those records is
 * first written to the discarded-records log (`recordWiped`, summary only), then the outbox goes
 * with everything else and the wipe runs exactly as the normal one.
 */
export async function wipeDevice(code: string, anyway?: WipeAnyway): Promise<WipeResult> {
  if (!isWipeCode(code)) return { ok: false, reason: 'wrong-code' };
  const forced = anyway?.force === true;

  const refused = await db.transaction(
    'rw',
    [db.rows, db.outbox, db.syncState, db.drafts, db.practiceDrafts, db.meta, db.discarded],
    async (): Promise<WipeResult | null> => {
      const hold = await readWipeHold();
      const count = heldCount(hold);
      if (anyway?.force === true) {
        if (count !== anyway.expected) return { ok: false, reason: 'wrong-count', unacked: count };
        if (count > 0) await recordWiped();
      } else if (isHeld(hold)) {
        return { ok: false, reason: 'unacked', unacked: count };
      }
      await db.outbox.clear();
      await db.rows.clear();
      await db.syncState.clear();
      await db.drafts.clear();
      await db.practiceDrafts.clear();
      const gone = (await db.meta.toCollection().primaryKeys()).filter((k) => !KEPT_META.has(k));
      await db.meta.bulkDelete(gone);
      // A sync whose pull began before the wipe must not mark the emptied device as hydrated.
      await db.meta.put({ key: WIPED_AT_KEY, value: new Date().toISOString() });
      return null;
    },
  );
  if (refused) return refused;

  notifyChanged('rows');
  notifyChanged('outbox');
  notifyChanged('meta');
  if (forced) notifyChanged('discarded');
  clearDevicePrefs();
  applyDeviceLook();
  await practiceMode.exit();
  // The session record went with `meta`; signing out tells this tab's listeners and the others.
  await session.signOut();
  return { ok: true };
}

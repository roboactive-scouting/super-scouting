import { isUser, type Caller, type Role } from '../caller';
import { AppError } from '../errors';

const ALL: readonly Role[] = ['scouter', 'lead', 'admin'];
const LEADS: readonly Role[] = ['lead', 'admin'];
const ADMIN: readonly Role[] = ['admin'];

/**
 * SPEC-FINAL 7.2, as data. Checked in the use-case layer and read by the UI.
 *
 * This matrix governs **users** only. A `service` caller (SPEC-FINAL 16.5) is not a
 * user, holds none of these roles, and so `can(service, x)` is always false for every
 * capability here — including `view_all_data`. That is expected, not a bug: SPEC-FINAL
 * 7.2/16.5 still let a service caller invoke **query** use cases, so a query use case
 * must NOT gate itself on `can(caller, 'view_all_data')` (or any other capability in
 * this table), or it would wrongly lock service callers out of reads they are entitled
 * to. Query use cases either perform no capability check at all, or check
 * `isUser(caller)`/`isService(caller)` directly — never `can()` — for that purpose.
 */
export const CAPABILITIES = {
  view_all_data: ALL,
  submit_entry: ALL,
  edit_own_entry: ALL,
  ensure_match: ALL,
  manage_entries: LEADS,
  resolve_conflict: LEADS,
  add_do_not_pick: LEADS,
  draft_dashboard: LEADS,
  save_dashboard: ADMIN,
  manage_forms: ADMIN,
  manage_events: ADMIN,
  manage_pick_lists: ADMIN,
  edit_do_not_pick: ADMIN,
  record_alliance_bracket: ADMIN,
  manage_users: ADMIN,
  delete_objects: ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(caller: Caller, capability: Capability): boolean {
  return isUser(caller) && CAPABILITIES[capability].includes(caller.role);
}

export function assertCan(caller: Caller, capability: Capability): void {
  if (!can(caller, capability)) {
    throw new AppError('forbidden', `not permitted: ${capability}`, { capability });
  }
}

/** SPEC-FINAL 7.6. */
export const SELF_EDIT_WINDOW_MS = 300_000;

export type EntryOwnership = {
  scouter_id: string;
  client_created_at: string;
  client_updated_at: string;
};

/**
 * The two client timestamps are compared to each other, never to server time
 * (SPEC-FINAL 7.6). An entry created and edited offline and uploaded six hours later
 * still passes, because the elapsed time measured is the scouter's own.
 *
 * Returns false for a negative elapsed time (an updated timestamp before the created
 * timestamp) and for either timestamp failing to parse, rather than throwing.
 */
export function withinSelfEditWindow(clientCreatedAt: string, clientUpdatedAt: string): boolean {
  const created = new Date(clientCreatedAt).getTime();
  const updated = new Date(clientUpdatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) return false;
  const elapsed = updated - created;
  return elapsed >= 0 && elapsed <= SELF_EDIT_WINDOW_MS;
}

export function canEditEntry(caller: Caller, entry: EntryOwnership): boolean {
  if (!isUser(caller)) return false;
  if (caller.role === 'lead' || caller.role === 'admin') return true;
  if (entry.scouter_id !== caller.userId) return false;
  return withinSelfEditWindow(entry.client_created_at, entry.client_updated_at);
}

/** What `mayEditEntryNow` reads of an entry: its author, its kind and when it was created. */
export type EntryEditSubject = {
  scouter_id: string;
  form_kind: 'match' | 'super';
  client_created_at: string;
};

/**
 * SPEC-FINAL 7.6, as ONE rule for "may this caller edit this entry now?" — the device's
 * Edit button (`canSelfEdit`), the entry preview's `can_edit` (getEntry, task 1.50), and any
 * later reader. A lead or admin always may. A scouter may edit their own SUPER entry at any
 * time (v1.26: one running judgement of a team, built up all event) and their own MATCH entry
 * only within five minutes of its `client_created_at`, measured to `now` — the caller's clock
 * (the device's on the device, the server's on the server). Another scouter's entry, and any
 * `service` caller, never. An unreadable `now` or stamp is false, never a throw.
 */
export function mayEditEntryNow(caller: Caller, entry: EntryEditSubject, now: Date): boolean {
  if (!isUser(caller)) return false;
  if (caller.role === 'lead' || caller.role === 'admin') return true;
  if (entry.scouter_id !== caller.userId) return false;
  if (entry.form_kind === 'super') return true;
  if (Number.isNaN(now.getTime())) return false;
  return canEditEntry(caller, {
    scouter_id: entry.scouter_id,
    client_created_at: entry.client_created_at,
    client_updated_at: now.toISOString(),
  });
}

/**
 * SPEC-FINAL 9.6 as data (task 1.45): what a person can do while this device has no
 * connection. `true` means the action works offline (it rides the outbox, or it only reads
 * what the device holds); `false` means it is a server command and is held until the
 * connection returns. Every gate in the app reads this one table — through `<OfflineGate>` or
 * `useCapability` (components/OfflineGate.tsx) — so a row changes in one place.
 */
export const OFFLINE_CAPABILITY = {
  // Editable offline: all of these ride the same outbox.
  /** "Create a scouting entry" (9.6, editable). */
  create_entry: true,
  /** "The 5-minute self-edit" (9.6, editable). */
  self_edit_entry: true,
  /** "Bare match auto-creation while scouting an unlisted number" (9.6, editable; 6.4). */
  ensure_match: true,
  /** "Pick lists (admin), including reorder" (9.6, editable; the feature is phase 2). */
  edit_pick_list: true,
  /**
   * A lead's or admin's soft delete of an entry this device holds (SPEC-FINAL 3.9; task 1.61): a
   * `delete` operation through the same outbox, so it works offline like an edit.
   */
  delete_entry: true,
  /** "Do-not-pick — admin add/edit/remove, and a lead's addition" (9.6, editable; phase 2). */
  add_do_not_pick: true,
  /** "The alliance bracket, including declines" (9.6, editable; phase 2). */
  edit_alliance_bracket: true,

  // Viewable offline, computed on the device or read from its cache.
  /** "Statistics, rankings, metrics" (9.6, viewable, computed on-device from raw entries). */
  view_statistics: true,
  /** "Saved dashboards" (9.6, viewable from cache; phase 2). */
  view_saved_dashboard: true,
  /** "A lead's draft statistics page" (9.6, creatable offline, discarded on exit; phase 2). */
  create_draft_dashboard: true,
  /** "The conflict-review queue" (9.6, readable). */
  read_conflicts: true,

  // Not available offline: each is a server command.
  /** "Saved dashboards — saving or editing needs connectivity" (9.6; phase 2). */
  save_dashboard: false,
  /** "Form definition editing" (9.6, not available). */
  edit_form: false,
  /** "User management" (9.6, not available). */
  manage_users: false,
  /** "Switching the active event" (9.6, not available). */
  switch_active_event: false,
  /** "Any cross-event view" (9.6, not available: only the active competition is cached). */
  cross_event_view: false,
  /** "Season, event, match and roster management" (9.6, not available). */
  manage_events: false,
  /**
   * Every delete that runs on the server at once (SPEC-FINAL 3.9, 17.8; task 1.61): the admin's
   * hard deletes (a season, an event, a form, a form version, a match), the count read before
   * them (`getDeleteImpact`), and the soft delete of an entry this device does not hold.
   */
  delete_objects: false,
  /** "Resolving conflicts" (9.6, not available: it settles the row for everyone). */
  resolve_conflict: false,
} as const satisfies Record<string, boolean>;

/** A capability the app gates on: only the matrix's rows typecheck. */
export type Capability = keyof typeof OFFLINE_CAPABILITY;

/**
 * Whether `capability` works with no connection (SPEC-FINAL 9.6). There is no silent default:
 * a name that is not in the matrix does not typecheck, and throws if it arrives anyway.
 */
export function isAvailableOffline(capability: Capability): boolean {
  if (!Object.hasOwn(OFFLINE_CAPABILITY, capability)) {
    throw new Error(`"${String(capability)}" is not in the offline capability matrix`);
  }
  return OFFLINE_CAPABILITY[capability];
}

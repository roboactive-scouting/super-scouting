/**
 * Every in-app path, written once (redesign task R.4). `/` is Home — the context page
 * SPEC-FINAL 17.9 calls the landing page — and Scout lives at `/scout`. A task that adds a
 * page adds its path here and its nav row in features/shell/nav.ts.
 */
export const PATHS = {
  home: '/',
  scout: '/scout',
  /** Super scouting (SPEC-FINAL 8.1, task 1.36): one entry per team for the whole event. */
  super: '/super',
  /**
   * The way into practice mode (SPEC-FINAL 8.5, task 1.37): picks a match the device holds, turns
   * practice on and replaces itself with that entry.
   */
  practice: '/practice',
  entries: '/entries',
  /** Season-wide team search (SPEC-FINAL 13.2, task 1.51): the bottom bar's Search. */
  teams: '/teams',
  switchScouter: '/switch-scouter',
  changePassword: '/change-password',
  login: '/login',
  users: '/admin/users',
  manage: '/admin/manage',
  forms: '/admin/forms',
  /** This device's settings (SPEC-FINAL 8.6, task 1.38): theme, text size, screen, vibration, wipe. */
  settings: '/settings',
  /** What this device has sent and what still waits (SPEC-FINAL 9.10, task 1.43). */
  sync: '/sync',
  /**
   * The discarded-records log (SPEC-FINAL 9.7, task 1.42): opened from Sync only — its notice's
   * "See the log" and More — never a nav row.
   */
  syncDiscarded: '/sync/discarded',
  /**
   * The QR sender (SPEC-FINAL 9.8, task 1.47): this device's outbox as a looping moving QR code
   * for the collector tablet. Opened from Sync's More only, never a nav row.
   */
  syncQrSend: '/sync/qr/send',
  /**
   * The QR receiver (SPEC-FINAL 9.8, task 1.48): the collector tablet scans another phone's
   * looping code. Opened from Sync's More only, never a nav row.
   */
  syncQrReceive: '/sync/qr/receive',
  /**
   * The conflict review worklist (SPEC-FINAL 9.5, 17.9): Sync's conflicts link opens it. Its page
   * and nav row are task 1.44.
   */
  conflicts: '/conflicts',
} as const;

/** The form builder's route pattern (SPEC-FINAL 5.9, v1.21): the version is a query, `?version=n`. */
export const FORM_BUILDER_ROUTE = '/admin/forms/:formId';

/**
 * The form builder on one form. `version` is the version NUMBER (v3 → 3), never an id; without
 * it the builder opens the draft if there is one, else the active version (13-forms README).
 */
export function formBuilderPath(formId: string, version?: number): string {
  const base = `${PATHS.forms}/${formId}`;
  return version === undefined ? base : `${base}?version=${version}`;
}

/** The forms list on one season, by its year (`?season=2026`); the list honours it on arrival. */
export function formsSeasonPath(year: number): string {
  return `${PATHS.forms}?season=${year}`;
}

/**
 * One team's page (SPEC-FINAL 13.1). Team search's rows open it (task 1.51); the route itself is
 * task 1.53's.
 */
export const TEAM_ROUTE = '/teams/:teamId';

/** One team's page, by the team's id. */
export function teamPath(teamId: string): string {
  return `${PATHS.teams}/${encodeURIComponent(teamId)}`;
}

/**
 * One entry, read only (SPEC-FINAL 13.4, task 1.52): a full page under Entries, never a drawer.
 * Entries' rows, the 5-minute mark and an entry this user can no longer edit open it.
 */
export const ENTRY_PREVIEW_ROUTE = '/entries/:id';

/**
 * One entry's preview, by its row id. (The plan names it `entry(id)`; `entryPath` is the entry
 * FORM's, below.)
 */
export function entryPreviewPath(id: string): string {
  return `${PATHS.entries}/${encodeURIComponent(id)}`;
}

/** The entry route's pattern, for `matchPath` and the route tree. */
export const ENTRY_ROUTE = '/entry/:matchId/:teamId';

export function entryPath(matchId: string, teamId: string, alliance: 'red' | 'blue'): string {
  return `/entry/${matchId}/${teamId}?alliance=${alliance}`;
}

/** The super entry's route pattern: the picker at `/super`, one team's form under it. */
export const SUPER_TEAM_ROUTE = '/super/:teamId';

/** One team's super entry (SPEC-FINAL 8.1): opens this device's entry for it, else a new one. */
export function superTeamPath(teamId: string): string {
  return `${PATHS.super}/${teamId}`;
}

/**
 * The data-entry path (SPEC-FINAL 17.9): the screens a scout uses mid-match. No route
 * transition plays into them and nothing on them moves unless it carries information.
 * Super scouting (`/super`, task 1.36) is on it too, and `/practice` (task 1.37), which only
 * hands over to an entry.
 */
export const ENTRY_PATH_PREFIXES: readonly string[] = [
  PATHS.scout,
  '/entry/',
  PATHS.super,
  PATHS.practice,
];

export function isEntryPath(pathname: string): boolean {
  return ENTRY_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

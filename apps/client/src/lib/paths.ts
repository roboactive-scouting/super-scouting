/**
 * Every in-app path, written once (redesign task R.4). `/` is Home — the context page
 * SPEC-FINAL 17.9 calls the landing page — and Scout lives at `/scout`. A task that adds a
 * page adds its path here and its nav row in features/shell/nav.ts.
 */
export const PATHS = {
  home: '/',
  scout: '/scout',
  entries: '/entries',
  switchScouter: '/switch-scouter',
  changePassword: '/change-password',
  login: '/login',
  users: '/admin/users',
  manage: '/admin/manage',
} as const;

/** The entry route's pattern, for `matchPath` and the route tree. */
export const ENTRY_ROUTE = '/entry/:matchId/:teamId';

export function entryPath(matchId: string, teamId: string, alliance: 'red' | 'blue'): string {
  return `/entry/${matchId}/${teamId}?alliance=${alliance}`;
}

/**
 * The data-entry path (SPEC-FINAL 17.9): the screens a scout uses mid-match. No route
 * transition plays into them and nothing on them moves unless it carries information.
 * Task 1.36 adds `/super`.
 */
export const ENTRY_PATH_PREFIXES: readonly string[] = [PATHS.scout, '/entry/'];

export function isEntryPath(pathname: string): boolean {
  return ENTRY_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

import type { PublicUser, Role } from '@frc/shared';
import type { EntryCounts } from './useUsers';

/** The filter chips (design 08-users). Every chip but Disabled lists active accounts only. */
export type UsersFilter = 'all' | 'scouter' | 'lead' | 'admin' | 'disabled';

export const USERS_FILTERS: readonly { key: UsersFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scouter', label: 'Scouters' },
  { key: 'lead', label: 'Leads' },
  { key: 'admin', label: 'Admins' },
  { key: 'disabled', label: 'Disabled' },
];

const inFilter = (user: PublicUser, filter: UsersFilter): boolean => {
  if (filter === 'disabled') return user.disabled_at !== null;
  if (user.disabled_at !== null) return false;
  return filter === 'all' || user.role === filter;
};

export function countByFilter(users: readonly PublicUser[]): Record<UsersFilter, number> {
  const counts = { all: 0, scouter: 0, lead: 0, admin: 0, disabled: 0 };
  for (const filter of Object.keys(counts) as UsersFilter[]) {
    counts[filter] = users.filter((u) => inFilter(u, filter)).length;
  }
  return counts;
}

/** Name or username, ignoring case and the spaces around the query. */
export function matchesQuery(user: PublicUser, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return (
    user.full_name.toLocaleLowerCase().includes(q) || user.username.toLocaleLowerCase().includes(q)
  );
}

const ROLE_ORDER: Record<Role, number> = { admin: 0, lead: 1, scouter: 2 };

export const entriesOf = (counts: EntryCounts, id: string): number | null =>
  counts ? (counts.get(id) ?? 0) : null;

/**
 * The table's rows: admins, then leads, then scouters (the design's order), most entries
 * first inside a role, then by name; disabled accounts last.
 */
export function visibleUsers(
  users: readonly PublicUser[],
  filter: UsersFilter,
  query: string,
  counts: EntryCounts,
): PublicUser[] {
  return users
    .filter((u) => inFilter(u, filter) && matchesQuery(u, query))
    .sort(
      (a, b) =>
        Number(a.disabled_at !== null) - Number(b.disabled_at !== null) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        (entriesOf(counts, b.id) ?? 0) - (entriesOf(counts, a.id) ?? 0) ||
        a.full_name.localeCompare(b.full_name),
    );
}

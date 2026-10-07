import { describe, expect, it } from 'vitest';
import type { PublicUser, Role } from '@frc/shared';
import { checkNewUser } from './checkNewUser';
import { countByFilter, entriesOf, matchesQuery, visibleUsers } from './usersView';

const user = (id: string, full_name: string, role: Role, off = false): PublicUser => ({
  id,
  username: full_name.toLowerCase().replace(' ', '.'),
  full_name,
  role,
  must_change_password: false,
  disabled_at: off ? '2026-09-14T08:00:00.000Z' : null,
  created_at: '2026-01-10T12:00:00.000Z',
});

const USERS = [
  user('s1', 'Shira Peretz', 'scouter'),
  user('a1', 'Eldad Gross', 'admin'),
  user('s2', 'Yael Shapira', 'scouter'),
  user('l1', 'Noa Levi', 'lead'),
  user('a2', 'Tamar Mizrahi', 'admin'),
  user('x1', 'Roni Gal', 'scouter', true),
];

describe('the Users page view', () => {
  it('counts active accounts per role chip, and disabled apart', () => {
    expect(countByFilter(USERS)).toEqual({ all: 5, scouter: 2, lead: 1, admin: 2, disabled: 1 });
  });

  it('orders admins, leads, scouters, most entries first, disabled last', () => {
    const counts = new Map([
      ['a2', 12],
      ['a1', 3],
      ['s2', 52],
    ]);
    const all = visibleUsers(USERS, 'all', '', counts).map((u) => u.id);
    expect(all).toEqual(['a2', 'a1', 'l1', 's2', 's1']);
    expect(visibleUsers(USERS, 'disabled', '', counts).map((u) => u.id)).toEqual(['x1']);
    // No season: everyone counts as 0, so names decide inside a role.
    expect(visibleUsers(USERS, 'admin', '', null).map((u) => u.id)).toEqual(['a1', 'a2']);
  });

  it('searches name or username, ignoring case and spaces around it', () => {
    expect(matchesQuery(USERS[2]!, '  SHAP ')).toBe(true);
    expect(matchesQuery(USERS[2]!, 'yael.s')).toBe(true);
    expect(matchesQuery(USERS[2]!, 'noa')).toBe(false);
    expect(visibleUsers(USERS, 'scouter', 'peretz', null).map((u) => u.id)).toEqual(['s1']);
  });

  it('a missing count is 0 in a season, and nothing without one', () => {
    expect(entriesOf(new Map([['s2', 52]]), 's1')).toBe(0);
    expect(entriesOf(null, 's1')).toBeNull();
  });
});

describe('checkNewUser', () => {
  it('names the first field that breaks the shared rules, in the dialog order', () => {
    expect(checkNewUser('', 'gal.l', 'orbit-cedar-42')?.field).toBe('full_name');
    expect(checkNewUser('Gal Levy', '', 'orbit-cedar-42')?.line).toBe('Enter a username.');
    expect(checkNewUser('Gal Levy', 'gal l', 'orbit-cedar-42')?.field).toBe('username');
    expect(checkNewUser('Gal Levy', 'gal.l', 'short')?.line).toBe(
      'For the password, use at least 8 characters.',
    );
    expect(checkNewUser('Gal Levy', 'gal.l', 'orbit-cedar-42')).toBeNull();
  });
});

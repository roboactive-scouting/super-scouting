import { describe, expect, it } from 'vitest';
import {
  changeOwnPasswordInput,
  createUserInput,
  listUsersInput,
  publicUser,
  renameUserInput,
  resetPasswordInput,
  usernameSchema,
} from './users';

describe('the user-administration wire schemas (SPEC-FINAL 7.3, 7.5)', () => {
  it('trims and lowercases a username before checking it', () => {
    expect(usernameSchema.parse('  Dana.Levi_2-x ')).toBe('dana.levi_2-x');
  });

  it('accepts letters of any script, including Hebrew', () => {
    expect(usernameSchema.parse('דנה')).toBe('דנה');
    expect(usernameSchema.parse('dana٣')).toBe('dana٣');
  });

  it('rejects wildcards, whitespace, control characters, empty and over-long names', () => {
    for (const bad of ['a*b', 'a%b', 'a b', 'a\tb', 'a\u0000b', '', '   ', 'x'.repeat(41)]) {
      expect(usernameSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(usernameSchema.safeParse('x'.repeat(40)).success).toBe(true);
  });

  it('requires a password of at least eight characters and nothing more', () => {
    const base = { username: 'dana', full_name: 'Dana', role: 'scouter' };
    expect(createUserInput.safeParse({ ...base, password: 'short12' }).success).toBe(false);
    expect(createUserInput.safeParse({ ...base, password: 'aaaaaaaa' }).success).toBe(true);
  });

  it('defaults must_change to false on a reset', () => {
    expect(resetPasswordInput.parse({ user_id: 'u', password: 'aaaaaaaa' }).must_change).toBe(
      false,
    );
  });

  it('defaults must_change to false on a create too', () => {
    const base = { username: 'dana', full_name: 'Dana', role: 'scouter', password: 'aaaaaaaa' };
    expect(createUserInput.parse(base).must_change).toBe(false);
    expect(createUserInput.parse({ ...base, must_change: true }).must_change).toBe(true);
  });

  it('renameUserInput requires at least a username or a full name', () => {
    expect(renameUserInput.safeParse({ user_id: 'u' }).success).toBe(false);
    expect(renameUserInput.safeParse({ user_id: 'u', full_name: 'New Name' }).success).toBe(true);
    expect(renameUserInput.safeParse({ user_id: 'u', username: 'newname' }).success).toBe(true);
  });

  it('renameUserInput runs a username through the same trim/lowercase/pattern rules', () => {
    const parsed = renameUserInput.parse({ user_id: 'u', username: '  New.Name ' });
    expect(parsed.username).toBe('new.name');
    expect(renameUserInput.safeParse({ user_id: 'u', username: 'a*b' }).success).toBe(false);
  });

  it('rejects a user_id on changeOwnPassword instead of dropping it', () => {
    const own = { current_password: 'x', new_password: 'aaaaaaaa' };
    expect(changeOwnPasswordInput.safeParse(own).success).toBe(true);
    expect(changeOwnPasswordInput.safeParse({ ...own, user_id: 'u-lead' }).success).toBe(false);
  });

  it('defaults include_disabled to false and refuses a non-positive limit', () => {
    expect(listUsersInput.parse({})).toEqual({ include_disabled: false });
    expect(listUsersInput.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('strips password_hash from a public user', () => {
    const parsed = publicUser.parse({
      id: 'u-1',
      username: 'a',
      full_name: 'A',
      role: 'lead',
      must_change_password: false,
      disabled_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      password_hash: '$2a$10$x',
    });
    expect(JSON.stringify(parsed)).not.toContain('password_hash');
  });
});

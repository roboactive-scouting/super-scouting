import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, type Caller } from '@frc/shared';
import { callerFor } from '../../auth/callerFor.js';
import { verifyPassword } from '../../auth/password.js';
import { issueToken } from '../../auth/token.js';
import { loadServerConfig } from '../../config.js';
import {
  changeOwnPassword,
  changeOwnPasswordLimiter,
  createUser,
  disableUser,
  resetPassword,
  setUserRole,
} from './users.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const admin: Caller = { kind: 'user', userId: 'u-admin', role: 'admin' };
const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const scouter: Caller = { kind: 'user', userId: 'u-scouter', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  changeOwnPasswordLimiter.reset();
  ctx = makeFakeContext();
});

describe('user administration (SPEC-FINAL 7.3)', () => {
  it('lets an admin create a user with a hashed password', async () => {
    const user = await createUser(
      admin,
      { username: 'Dana', full_name: 'Dana Levi', role: 'scouter', password: 'firstpass1' },
      ctx,
    );
    expect(user.username).toBe('dana');
    const stored = ctx.usersByName.get('dana')!;
    expect(stored.password_hash).not.toBe('firstpass1');
    expect(await verifyPassword('firstpass1', stored.password_hash)).toBe(true);
  });

  it('stores no personal datum beyond the full name', async () => {
    const user = await createUser(
      admin,
      { username: 'dana', full_name: 'Dana Levi', role: 'scouter', password: 'firstpass1' },
      ctx,
    );
    expect(Object.keys(user).sort()).toEqual(
      [
        'created_at',
        'disabled_at',
        'full_name',
        'id',
        'must_change_password',
        'role',
        'username',
      ].sort(),
    );
  });

  it('refuses a password shorter than eight characters', async () => {
    await expect(
      createUser(
        admin,
        { username: 'dana', full_name: 'D', role: 'scouter', password: 'short1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses a username that already exists in another case', async () => {
    await createUser(
      admin,
      { username: 'dana', full_name: 'D', role: 'scouter', password: 'firstpass1' },
      ctx,
    );
    await expect(
      createUser(
        admin,
        { username: 'DANA', full_name: 'D2', role: 'lead', password: 'firstpass1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses every one of these to a lead and to a scouter', async () => {
    for (const caller of [lead, scouter]) {
      await expect(
        createUser(
          caller,
          { username: 'x', full_name: 'X', role: 'scouter', password: 'firstpass1' },
          ctx,
        ),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        setUserRole(caller, { user_id: 'u-scouter', role: 'admin' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        resetPassword(caller, { user_id: 'u-scouter', password: 'firstpass1' }, ctx),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(disableUser(caller, { user_id: 'u-scouter' }, ctx)).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
  });

  it('disables rather than deletes, keeping the row and its authorship', async () => {
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    const stored = ctx.usersById.get('u-scouter')!;
    expect(stored.disabled_at).not.toBeNull();
    expect(ctx.usersById.has('u-scouter')).toBe(true);
  });

  it('forces a password change when the admin asks for one', async () => {
    await resetPassword(
      admin,
      { user_id: 'u-scouter', password: 'brandnew1', must_change: true },
      ctx,
    );
    expect(ctx.usersById.get('u-scouter')!.must_change_password).toBe(true);
  });

  it('lets a user change their own password and clears the must-change flag', async () => {
    await resetPassword(
      admin,
      { user_id: 'u-scouter', password: 'brandnew1', must_change: true },
      ctx,
    );
    await changeOwnPassword(
      scouter,
      { current_password: 'brandnew1', new_password: 'evennewer1' },
      ctx,
    );
    const stored = ctx.usersById.get('u-scouter')!;
    expect(await verifyPassword('evennewer1', stored.password_hash)).toBe(true);
    expect(stored.must_change_password).toBe(false);
  });

  it('never lets a user change somebody else’s password', async () => {
    await expect(
      changeOwnPassword(
        scouter,
        { user_id: 'u-lead', current_password: 'x', new_password: 'evennewer1' } as never,
        ctx,
      ),
    ).rejects.toBeTruthy();
  });

  it('refuses to disable the last enabled admin', async () => {
    await expect(disableUser(admin, { user_id: 'u-admin' }, ctx)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});

describe('who may call them', () => {
  it('rejects a service caller from all five commands before touching ctx', async () => {
    // `{}` as ctx: any store access would throw a TypeError, not a forbidden AppError.
    const none = {} as never;
    const calls = [
      () =>
        createUser(
          service,
          { username: 'x', full_name: 'X', role: 'scouter', password: 'p' },
          none,
        ),
      () => setUserRole(service, { user_id: 'u-scouter', role: 'admin' }, none),
      () => resetPassword(service, { user_id: 'u-scouter', password: 'p' }, none),
      () => disableUser(service, { user_id: 'u-scouter' }, none),
      () => changeOwnPassword(service, { current_password: 'x', new_password: 'y' }, none),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('checks the caller before it validates: a lead with a bad input still hears forbidden', async () => {
    await expect(createUser(lead, {} as never, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('input validation', () => {
  it('throws an AppError, never a raw ZodError', async () => {
    const error = await createUser(admin, { username: 'dana' } as never, ctx).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'invalid' });
  });

  it('trims and lowercases the username, and trims the full name', async () => {
    const user = await createUser(
      admin,
      { username: '  Dana.Levi ', full_name: ' Dana Levi ', role: 'lead', password: 'firstpass1' },
      ctx,
    );
    expect(user).toMatchObject({ username: 'dana.levi', full_name: 'Dana Levi', role: 'lead' });
    expect(user.must_change_password).toBe(false);
    expect(user.disabled_at).toBeNull();
  });

  it('accepts a Hebrew username', async () => {
    const user = await createUser(
      admin,
      { username: 'דנה', full_name: 'דנה לוי', role: 'scouter', password: 'firstpass1' },
      ctx,
    );
    expect(user.username).toBe('דנה');
  });

  it('refuses a username with a wildcard, a space or a control character', async () => {
    for (const username of ['a*b', 'a%b', 'a b', 'a\u0007b']) {
      await expect(
        createUser(
          admin,
          { username, full_name: 'X', role: 'scouter', password: 'firstpass1' },
          ctx,
        ),
        username,
      ).rejects.toMatchObject({ code: 'invalid' });
    }
  });

  it('refuses a short password on a reset and on a self-change', async () => {
    await expect(
      resetPassword(admin, { user_id: 'u-scouter', password: 'short1' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      changeOwnPassword(scouter, { current_password: 'whatever1', new_password: 'short1' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses an unknown role', async () => {
    await expect(
      setUserRole(admin, { user_id: 'u-scouter', role: 'mentor' } as never, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('the unique index is the real guard (a race past the pre-check)', () => {
  it('maps a Postgres unique violation from insertUser to conflict', async () => {
    await createUser(
      admin,
      { username: 'dana', full_name: 'D', role: 'scouter', password: 'firstpass1' },
      ctx,
    );
    // The other admin's pre-check ran before the first insert committed.
    ctx.store.getUserByUsername = async () => null;
    await expect(
      createUser(
        admin,
        { username: 'Dana', full_name: 'D2', role: 'lead', password: 'firstpass1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect([...ctx.usersById.values()].filter((u) => u.username === 'dana')).toHaveLength(1);
  });

  it('passes any other store error through untouched', async () => {
    ctx.store.insertUser = async () => {
      throw Object.assign(new Error('connection refused'), { code: '08006' });
    };
    await expect(
      createUser(
        admin,
        { username: 'dana', full_name: 'D', role: 'scouter', password: 'firstpass1' },
        ctx,
      ),
    ).rejects.toThrow('connection refused');
  });
});

describe('setUserRole', () => {
  it('changes a role', async () => {
    const user = await setUserRole(admin, { user_id: 'u-scouter', role: 'lead' }, ctx);
    expect(user.role).toBe('lead');
    expect(ctx.usersById.get('u-scouter')!.role).toBe('lead');
  });

  it('refuses to demote the last enabled admin', async () => {
    await expect(
      setUserRole(admin, { user_id: 'u-admin', role: 'lead' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.usersById.get('u-admin')!.role).toBe('admin');
  });

  it('demotes an admin when another enabled admin remains, but not a disabled one', async () => {
    await setUserRole(admin, { user_id: 'u-lead', role: 'admin' }, ctx);
    await setUserRole(admin, { user_id: 'u-admin', role: 'scouter' }, ctx);
    expect(ctx.usersById.get('u-admin')!.role).toBe('scouter');

    // u-lead is now the only admin; a disabled admin does not count towards the guard.
    ctx.users.set('u-old', { id: 'u-old', role: 'admin', disabled_at: '2026-01-01T00:00:00.000Z' });
    const lastAdmin: Caller = { kind: 'user', userId: 'u-lead', role: 'admin' };
    await expect(
      setUserRole(lastAdmin, { user_id: 'u-lead', role: 'lead' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('answers not-found for an unknown user', async () => {
    await expect(
      setUserRole(admin, { user_id: 'u-nobody', role: 'lead' }, ctx),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('disableUser', () => {
  it('writes only disabled_at, at the context clock, and deletes nothing', async () => {
    const before = ctx.usersById.size;
    const original = { ...ctx.usersById.get('u-scouter')! };
    const user = await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    expect(user.disabled_at).toBe(ctx.nowValue.toISOString());
    expect(ctx.usersById.size).toBe(before);
    expect(ctx.usersById.get('u-scouter')).toEqual({
      ...original,
      disabled_at: ctx.nowValue.toISOString(),
    });
  });

  it('keeps the original timestamp when the user is already disabled', async () => {
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    const first = ctx.usersById.get('u-scouter')!.disabled_at;
    ctx.nowValue = new Date('2026-12-01T00:00:00.000Z');
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    expect(ctx.usersById.get('u-scouter')!.disabled_at).toBe(first);
  });

  it('disables an admin when another enabled admin remains', async () => {
    await setUserRole(admin, { user_id: 'u-lead', role: 'admin' }, ctx);
    await disableUser(admin, { user_id: 'u-admin' }, ctx);
    expect(ctx.usersById.get('u-admin')!.disabled_at).not.toBeNull();
  });

  it('answers not-found for an unknown user', async () => {
    await expect(disableUser(admin, { user_id: 'u-nobody' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('changeOwnPassword', () => {
  beforeEach(async () => {
    await resetPassword(admin, { user_id: 'u-scouter', password: 'brandnew1' }, ctx);
  });

  it('acts on the caller only', async () => {
    const leadHash = ctx.usersById.get('u-lead')!.password_hash;
    const user = await changeOwnPassword(
      scouter,
      { current_password: 'brandnew1', new_password: 'evennewer1' },
      ctx,
    );
    expect(user.id).toBe('u-scouter');
    expect(ctx.usersById.get('u-lead')!.password_hash).toBe(leadHash);
  });

  it('rejects an extra user_id as invalid, not by silently dropping it', async () => {
    await expect(
      changeOwnPassword(
        scouter,
        { user_id: 'u-lead', current_password: 'brandnew1', new_password: 'evennewer1' } as never,
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('answers invalid (400, never 401) for a wrong current password and changes nothing', async () => {
    const hash = ctx.usersById.get('u-scouter')!.password_hash;
    await expect(
      changeOwnPassword(
        scouter,
        { current_password: 'wrongpass1', new_password: 'evennewer1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(ctx.usersById.get('u-scouter')!.password_hash).toBe(hash);
  });

  it('is rate-limited per user, so a stolen token cannot guess the current password', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(
        changeOwnPassword(
          scouter,
          { current_password: `guess${i}xx`, new_password: 'evennewer1' },
          ctx,
        ),
      ).rejects.toMatchObject({ code: 'invalid' });
    }
    // The right password no longer helps within the window...
    await expect(
      changeOwnPassword(
        scouter,
        { current_password: 'brandnew1', new_password: 'evennewer1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    // ...and the bucket is the user's own: another user is unaffected.
    await resetPassword(admin, { user_id: 'u-lead', password: 'leadpass1' }, ctx);
    await expect(
      changeOwnPassword(lead, { current_password: 'leadpass1', new_password: 'leadpass2' }, ctx),
    ).resolves.toMatchObject({ id: 'u-lead' });
  });

  it('refuses a disabled account', async () => {
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    await expect(
      changeOwnPassword(
        scouter,
        { current_password: 'brandnew1', new_password: 'evennewer1' },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('no password or hash escapes', () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' '));
      });
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no hash from any command, and logs nothing', async () => {
    const results = [
      await createUser(
        admin,
        { username: 'dana', full_name: 'D', role: 'scouter', password: 'firstpass1' },
        ctx,
      ),
      await setUserRole(admin, { user_id: 'u-scouter', role: 'lead' }, ctx),
      await resetPassword(admin, { user_id: 'u-scouter', password: 'brandnew1' }, ctx),
      await changeOwnPassword(
        { kind: 'user', userId: 'u-scouter', role: 'lead' },
        { current_password: 'brandnew1', new_password: 'evennewer1' },
        ctx,
      ),
      await disableUser(admin, { user_id: 'u-scouter' }, ctx),
    ];
    for (const result of results) {
      expect(JSON.stringify(result)).not.toContain('$2');
      expect(result).not.toHaveProperty('password_hash');
    }
    expect(logged).toEqual([]);
  });

  it('does not put a rejected password in the error message', async () => {
    const error = (await resetPassword(
      admin,
      { user_id: 'u-scouter', password: 'secret7' },
      ctx,
    ).catch((e) => e)) as AppError;
    expect(error.code).toBe('invalid');
    expect(error.message).not.toContain('secret7');
    expect(JSON.stringify(error.details ?? {})).not.toContain('secret7');
  });
});

// callerFor re-reads the user from the store on every request, so an admin's change is
// what the affected user's very next request sees — through the same fake store.
describe('takes effect on the next request (callerFor over the same store)', () => {
  const config = loadServerConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
    AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
    ALLOWED_ORIGIN: 'https://client.example.com',
  });
  const request = (token: string) =>
    new Request('https://server.example.com/api/listUsers', {
      headers: { authorization: `Bearer ${token}` },
    });

  it('cuts a disabled user off, though their token is still validly signed', async () => {
    const token = await issueToken(
      { id: 'u-scouter', username: 'scouter', role: 'scouter' },
      config,
    );
    expect((await callerFor(request(token), config, ctx.store)).caller).toMatchObject({
      userId: 'u-scouter',
    });
    await disableUser(admin, { user_id: 'u-scouter' }, ctx);
    expect((await callerFor(request(token), config, ctx.store)).caller).toBeNull();
  });

  it('gives a user their new role, though the token still claims the old one', async () => {
    const token = await issueToken(
      { id: 'u-scouter', username: 'scouter', role: 'scouter' },
      config,
    );
    await setUserRole(admin, { user_id: 'u-scouter', role: 'lead' }, ctx);
    expect((await callerFor(request(token), config, ctx.store)).caller).toEqual({
      kind: 'user',
      userId: 'u-scouter',
      role: 'lead',
    });
  });
});

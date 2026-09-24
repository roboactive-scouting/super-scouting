/**
 * Task 1.16, proved with the network actually off. No `fetch` stub and no
 * `navigator.onLine` mock: a real `node:http` server on 127.0.0.1 serves a real
 * pull-shaped response whose users carry real bcrypt hashes, the device hydrates through
 * the real `apiClient`/`syncNow` after a real online login, and then the server is
 * CLOSED, so the port refuses connections (a real ECONNREFUSED). Only `@/config` is
 * pointed at the port, the same way every client test configures it.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PULL_ENTITY_KEYS, type Operation, type PullEntityKey } from '@frc/shared';
import { apiClient } from '@/data/api';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { RpcError } from '@/data/rpc';
import { syncNow } from '@/data/sync';
import { submitEntry } from '@/features/entry/submitEntry';
import { routeTree } from '@/routes';
import { OFFLINE_SIGNED_IN_LINE } from './messages';
import { loginOnline, offlineLogin, OfflineLoginError, signInWithFallback } from './offlineLogin';
import { pendingCredential } from './pendingCredential';
import { exchangePendingCredential } from './reconnect';
import { session } from './session';
import { switchScouter } from './SwitchScouter';

const config = vi.hoisted(() => ({ base: 'http://127.0.0.1:1' }));
vi.mock('@/config', () => ({
  clientConfig: () => ({ apiBaseUrl: config.base, deviceWipeCode: 'w', appVersion: 't' }),
}));

const EVENT_ID = '00000000-0000-4000-8000-0000000e0e01';
const MATCH_ID = '00000000-0000-4000-8000-0000000a0001';
const TEAM_ID = '00000000-0000-4000-8000-0000000c0001';
const TEAM_2_ID = '00000000-0000-4000-8000-0000000c0002';
const FORM_VERSION_ID = '00000000-0000-4000-8000-0000000f0001';

type Account = {
  id: string;
  username: string;
  full_name: string;
  role: 'scouter' | 'lead' | 'admin';
  password: string;
  disabled_at: string | null;
};

const SCOUTER: Account = {
  id: '00000000-0000-4000-8000-000000000006',
  username: 'seed_scouter',
  full_name: 'Seed Scouter',
  role: 'scouter',
  password: 'seedpass1',
  disabled_at: null,
};
const LEAD: Account = {
  id: '00000000-0000-4000-8000-000000000005',
  username: 'seed_lead',
  full_name: 'שירה לוי',
  role: 'lead',
  password: 'leadpass-2096',
  disabled_at: null,
};
const GONE: Account = {
  id: '00000000-0000-4000-8000-000000000009',
  username: 'seed_gone',
  full_name: 'Gone Scouter',
  role: 'scouter',
  password: 'gonepass1',
  disabled_at: '2026-06-01T00:00:00.000Z',
};
const ACCOUNTS = [SCOUTER, LEAD, GONE];
const HASHES = new Map(ACCOUNTS.map((a) => [a.id, bcrypt.hashSync(a.password, 10)]));
/** What the server checks at login. Starts equal to what it serves in the pull. */
const serverHashes = new Map(HASHES);

type Mode = 'api' | 'portal' | 'hang';
type Push = { bearer: string | null; operations: Operation[] };

/** What the fake server saw. */
const seen = { logins: [] as string[], pushes: [] as Push[], pulls: 0, aborted: 0 };
let mode: Mode = 'api';
let tokenCounter = 0;
const tokens = new Map<string, string>(); // token -> user id

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  return raw;
}

function pullBody() {
  const entities = Object.fromEntries(PULL_ENTITY_KEYS.map((k) => [k, []])) as unknown as Record<
    PullEntityKey,
    Record<string, unknown>[]
  >;
  const at = '2026-09-24T09:00:00.000Z';
  entities.users = ACCOUNTS.map((a) => ({
    id: a.id,
    username: a.username,
    full_name: a.full_name,
    role: a.role,
    password_hash: HASHES.get(a.id),
    must_change_password: false,
    disabled_at: a.disabled_at,
    created_at: at,
    updated_at: at,
  }));
  entities.events = [{ id: EVENT_ID, name: 'District 1', created_at: at, updated_at: at }];
  entities.teams = [
    { id: TEAM_ID, number: 2096, name: 'ROBACTIVE', updated_at: at },
    { id: TEAM_2_ID, number: 1690, name: 'Orbit', updated_at: at },
  ];
  entities.event_teams = [
    { id: 'et-1', event_id: EVENT_ID, team_id: TEAM_ID, deleted_at: null, updated_at: at },
    { id: 'et-2', event_id: EVENT_ID, team_id: TEAM_2_ID, deleted_at: null, updated_at: at },
  ];
  entities.matches = [
    { id: MATCH_ID, event_id: EVENT_ID, match_type: 'qualification', number: 16, updated_at: at },
  ];
  return { watermark: at, next_cursor: null, complete: true, entities };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (mode === 'portal') {
    // A venue captive portal: 200, HTML, for every URL.
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>Accept the venue Wi-Fi terms to continue</body></html>');
    return;
  }
  if (mode === 'hang') {
    req.on('close', () => {
      seen.aborted += 1;
    });
    return; // accepts the connection and never answers
  }
  const url = new URL(req.url ?? '/', 'http://x');
  const bearer = req.headers.authorization?.replace(/^Bearer /, '') ?? null;

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const { username, password } = JSON.parse(await readBody(req)) as {
      username: string;
      password: string;
    };
    seen.logins.push(username);
    const account = ACCOUNTS.find((a) => a.username === username.trim().toLowerCase());
    if (!account || !bcrypt.compareSync(password, serverHashes.get(account.id)!)) {
      send(res, 401, {
        error: { code: 'unauthenticated', message: 'that username and password do not match' },
      });
      return;
    }
    if (account.disabled_at) {
      send(res, 403, { error: { code: 'forbidden', message: 'disabled' } });
      return;
    }
    tokenCounter += 1;
    const token = `tok-${account.username}-${tokenCounter}`;
    tokens.set(token, account.id);
    send(res, 200, {
      token,
      user: {
        id: account.id,
        username: account.username,
        full_name: account.full_name,
        role: account.role,
        must_change_password: false,
      },
    });
    return;
  }

  if (!bearer || !tokens.has(bearer)) {
    send(res, 401, { error: { code: 'unauthenticated', message: 'no token' } });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/sync/pull') {
    seen.pulls += 1;
    send(res, 200, pullBody());
    return;
  }
  if (req.method === 'POST' && url.pathname === '/sync/push') {
    const { operations } = JSON.parse(await readBody(req)) as { operations: Operation[] };
    seen.pushes.push({ bearer, operations });
    send(res, 200, {
      results: operations.map((op) => ({
        op_id: op.op_id,
        status: 'applied',
        row_id: op.row_id,
        new_version: 1,
      })),
    });
    return;
  }
  send(res, 404, { error: { code: 'not-found', message: 'no route' } });
}

let server: Server | null = null;
let port = 0;

async function startServer(onPort = 0): Promise<void> {
  const s = createServer((req, res) => void handle(req, res));
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(onPort, '127.0.0.1', () => resolve());
  });
  server = s;
  port = (s.address() as AddressInfo).port;
  config.base = `http://127.0.0.1:${port}`;
}

async function stopServer(): Promise<void> {
  const s = server;
  if (!s) return;
  server = null;
  s.closeAllConnections(); // drop the kept-alive sockets too: nothing may linger
  await new Promise<void>((resolve) => s.close(() => resolve()));
}

const api = () => apiClient({ apiBaseUrl: config.base, deviceWipeCode: 'w', appVersion: 't' });
const DEVICE_ID = '00000000-0000-4000-8000-0000000d0001';

/** Every Dexie table, localStorage and sessionStorage, as one string. */
async function everyStore(): Promise<string> {
  const tables: Record<string, unknown> = {};
  for (const table of db.tables) tables[table.name] = await table.toArray();
  const dump = (s: Storage) =>
    Object.fromEntries(
      Array.from({ length: s.length }, (_, i) => [s.key(i), s.getItem(s.key(i)!)]),
    );
  return JSON.stringify({ tables, local: dump(localStorage), perTab: dump(sessionStorage) });
}

async function noShowEntryByCurrentUser(teamId: string): Promise<string> {
  const current = await session.current();
  const { row_id } = await submitEntry({
    fields: [],
    eventId: EVENT_ID,
    formVersionId: FORM_VERSION_ID,
    formKind: 'match',
    matchId: MATCH_ID,
    teamId,
    alliance: 'red',
    authorUserId: current!.user.id,
    robotStatus: 'no_show',
    data: {},
  });
  return row_id;
}

beforeAll(async () => {
  await db.delete();
  await db.open();
  pendingCredential.clear();
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe('offline login against a real server that goes away (SPEC-FINAL 7.5)', () => {
  it('hydrates through a real online login and a real pull', async () => {
    const result = await signInWithFallback(SCOUTER.username, SCOUTER.password);
    expect(result.offline).toBe(false);
    expect(await session.token()).toMatch(/^tok-seed_scouter-/);

    expect(await syncNow({ api: api(), eventId: EVENT_ID, deviceId: DEVICE_ID })).toMatchObject({
      status: 'ok',
    });
    const cachedUsers = await db.rows.where('entity').equals('users').toArray();
    expect(cachedUsers).toHaveLength(3);
    expect(cachedUsers.every((u) => String(u.password_hash).startsWith('$2'))).toBe(true);
  });

  it('closes the server: the port now refuses connections for real', async () => {
    await session.signOut(); // the app was restarted at the venue: no session at all
    await stopServer();
    // A brand-new TCP connection to the port is refused by the OS.
    const tcp = await new Promise<string>((resolve) => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve('connected');
      });
      socket.once('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
    });
    expect(tcp).toBe('ECONNREFUSED');
    // And fetch sees the same once its kept-alive socket (reset by the close) is gone.
    let code: string | undefined;
    for (let attempt = 0; attempt < 5 && code !== 'ECONNREFUSED'; attempt += 1) {
      const refused = await fetch(`${config.base}/api/login`, { method: 'POST' }).catch(
        (e: unknown) => e,
      );
      expect(refused).toBeInstanceOf(TypeError);
      code = (refused as { cause?: { code?: string } }).cause?.code;
    }
    expect(code).toBe('ECONNREFUSED');
    // And the RPC layer reports it as "never reached a server".
    const error = await loginOnline(SCOUTER.username, SCOUTER.password).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).status).toBe(0);
  });

  it('signs in offline against the cached hash', async () => {
    const result = await signInWithFallback('  SEED_SCOUTER ', SCOUTER.password);
    expect(result.offline).toBe(true);
    const current = await session.current();
    expect(current).toMatchObject({ token: null, offline: true, expired: false });
    expect(current?.user).toMatchObject({ id: SCOUTER.id, role: 'scouter' });
  });

  it('refuses a wrong password and a disabled account offline', async () => {
    await expect(offlineLogin(SCOUTER.username, 'not-the-password')).rejects.toBeInstanceOf(
      OfflineLoginError,
    );
    await expect(signInWithFallback(GONE.username, GONE.password)).rejects.toThrow(/disabled/i);
    // Neither refusal touched the scouter's session.
    expect((await session.current())?.user.id).toBe(SCOUTER.id);
  });

  it('records the scouter who entered it, then switches scouter offline', async () => {
    await noShowEntryByCurrentUser(TEAM_ID);
    const [scoutersOp] = await pending(10);
    expect(scoutersOp!.author_user_id).toBe(SCOUTER.id);

    // A wrong password for the next scouter changes nothing.
    await expect(switchScouter(LEAD.username, SCOUTER.password)).rejects.toBeInstanceOf(
      OfflineLoginError,
    );
    expect((await session.current())?.user.id).toBe(SCOUTER.id);

    const result = await switchScouter(LEAD.username, LEAD.password);
    expect(result.offline).toBe(true);
    expect((await session.current())?.user).toMatchObject({ id: LEAD.id, role: 'lead' });

    // The previous scouter's op is untouched; the next entry is the lead's.
    await noShowEntryByCurrentUser(TEAM_2_ID);
    const ops = await pending(10);
    expect(ops.map((o) => o.author_user_id)).toEqual([SCOUTER.id, LEAD.id]);
    expect(ops[0]).toEqual(scoutersOp);
  });

  it('holds the password in memory and in no storage', async () => {
    expect(pendingCredential.get()).toEqual({ username: LEAD.username, password: LEAD.password });
    const dump = await everyStore();
    expect(dump).toContain(LEAD.id);
    for (const account of ACCOUNTS) expect(dump).not.toContain(account.password);
  });

  it('on reconnect, mints a token and pushes every queued op with its own author', async () => {
    // The shell is up, offline, with the lead signed in from the cache.
    render(
      createElement(RouterProvider, {
        router: createMemoryRouter(routeTree(EVENT_ID), { initialEntries: ['/'] }),
      }),
    );
    expect(await screen.findByText(OFFLINE_SIGNED_IN_LINE)).toBeInTheDocument();
    expect(seen.pushes).toHaveLength(0);

    // The venue connection comes back: the same port answers again.
    await startServer(port);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(async () => expect(await session.token()).toMatch(/^tok-seed_lead-/), {
      timeout: 5000,
    });
    expect(pendingCredential.get()).toBeNull();
    await waitFor(() => expect(seen.pushes.length).toBeGreaterThan(0), { timeout: 5000 });

    const leadToken = await session.token();
    const pushed = seen.pushes.flatMap((p) => p.operations);
    expect(seen.pushes.every((p) => p.bearer === leadToken)).toBe(true);
    expect(pushed.map((o) => o.author_user_id)).toEqual([SCOUTER.id, LEAD.id]);
    await waitFor(async () => expect(await db.outbox.count()).toBe(0));
    await waitFor(() => expect(screen.queryByText(OFFLINE_SIGNED_IN_LINE)).not.toBeInTheDocument());
    // Still in no storage, after all of it.
    const dump = await everyStore();
    for (const account of ACCOUNTS) expect(dump).not.toContain(account.password);
  });
});

describe('a connection that is there but is not our server', () => {
  it('falls back to the cached hash on a captive portal answering 200 HTML', async () => {
    await session.signOut();
    pendingCredential.clear();
    mode = 'portal';
    const error = await loginOnline(SCOUTER.username, SCOUTER.password).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).answered).toBe(false);

    const result = await signInWithFallback(SCOUTER.username, SCOUTER.password);
    expect(result.offline).toBe(true);
    expect(await session.current()).toMatchObject({ token: null, offline: true });
    expect(pendingCredential.get()?.password).toBe(SCOUTER.password);
  });

  it('falls back when the connection hangs past the deadline, and abandons the request', async () => {
    await session.signOut();
    mode = 'hang';
    const before = seen.aborted;
    const started = Date.now();
    const result = await signInWithFallback(SCOUTER.username, SCOUTER.password, {
      timeoutMs: 300,
    });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result.offline).toBe(true);
    await waitFor(() => expect(seen.aborted).toBeGreaterThan(before));
  });

  it('never falls back on a definitive 401: a password an admin just reset stays reset', async () => {
    await session.signOut();
    pendingCredential.clear();
    mode = 'api';
    // The admin resets the scouter's password on the server; the device still caches
    // the old hash, which the old password DOES match.
    serverHashes.set(SCOUTER.id, bcrypt.hashSync('reset-by-admin-1', 10));
    const cached = await db.rows.get(['users', SCOUTER.id]);
    expect(bcrypt.compareSync(SCOUTER.password, String(cached?.password_hash))).toBe(true);

    const loginsBefore = seen.logins.length;
    const error = await signInWithFallback(SCOUTER.username, SCOUTER.password).catch(
      (e: unknown) => e,
    );
    expect(seen.logins.length).toBe(loginsBefore + 1); // it really asked the server
    expect(error).toBeInstanceOf(RpcError);
    expect((error as RpcError).status).toBe(401);
    expect(await session.current()).toBeNull();
    expect(pendingCredential.get()).toBeNull();
  });

  it('a held password the server now refuses is forgotten at reconnect, never retried', async () => {
    // Offline sign-in with the old password (the cache accepts it), then reconnect.
    await offlineLogin(SCOUTER.username, SCOUTER.password);
    expect(await exchangePendingCredential()).toBe('refused');
    expect(pendingCredential.get()).toBeNull();
    expect(await session.token()).toBeNull();
  });
});

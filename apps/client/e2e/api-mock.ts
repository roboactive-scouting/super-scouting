import type { Page, Route } from '@playwright/test';
import { API, loginOutput } from '@frc/shared';
import { FIXTURE, TEST_PASSWORD, userByName } from './fixtures';

export type Role = 'scouter' | 'lead' | 'admin';
const USER: Record<Role, ReturnType<typeof userByName>> = {
  scouter: userByName('yael.s'),
  lead: userByName('noa.levi'),
  admin: userByName('tamar.m'),
};

// `*` does not cover Authorization in a CORS preflight, so the headers are named.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'X-Refreshed-Token',
};
/** An override that is an Error-shaped object becomes an HTTP error with the client's error body. */
export type MockError = { status: number; code: string; message: string };
const isError = (v: unknown): v is MockError =>
  typeof v === 'object' && v !== null && 'status' in v && 'code' in v;

export type MockOptions = {
  role?: Role;
  mustChange?: boolean;
  /** By use-case name (`login`, `sync/pull`, `listUsers`, ...). A MockError answers with that error. */
  overrides?: Record<string, unknown>;
};

/** Register once per test. Overrides are checked FIRST (also for 'sync/pull' and 'login'). */
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const role = opts.role ?? 'lead';
  await page.route('http://api.test/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(route.request().url());
    const name = url.pathname.replace(/^\/api\//, '').replace(/^\//, '');
    const fulfill = (status: number, json: unknown) =>
      route.fulfill({ status, json, headers: CORS });
    const override = opts.overrides?.[name];
    if (isError(override)) {
      return fulfill(override.status, {
        error: { code: override.code, message: override.message },
      });
    }
    if (override !== undefined) return fulfill(200, override);
    if (name === 'sync/pull') return fulfill(200, FIXTURE.pull);
    if (name === 'sync/push') {
      const body = route.request().postDataJSON() as {
        operations: { op_id: string; row_id: string }[];
      };
      return fulfill(200, {
        results: body.operations.map((o) => ({
          op_id: o.op_id,
          status: 'applied',
          row_id: o.row_id,
          new_version: 1,
        })),
      });
    }
    if (name === 'login' || name === 'refreshToken') {
      const user = { ...USER[role], must_change_password: Boolean(opts.mustChange) };
      return fulfill(200, loginOutput.parse({ token: 'test-token', user }));
    }
    const answer = FIXTURE.rpc[name];
    if (answer === undefined) {
      return fulfill(404, { error: { code: 'not_found', message: `no mock for ${name}` } });
    }
    const input = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    const value = typeof answer === 'function' ? answer(input) : answer;
    const spec = (API as Record<string, { output: { parse(v: unknown): unknown } }>)[name];
    return fulfill(200, spec ? spec.output.parse(value) : value);
  });
}

/** Go offline only AFTER a page has loaded (offline before goto fails the navigation). */
export async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

export async function signIn(
  page: Page,
  role: Role = 'lead',
  opts: Omit<MockOptions, 'role'> = {},
) {
  await mockApi(page, { role, ...opts });
  await page.goto('/login');
  await page.getByLabel('Username').fill(USER[role].username);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

import { Hono } from 'hono';
import { pullRequestSchema, pushRequestSchema } from '@frc/shared';
import type { CallerResult } from '../auth/callerFor.js';
import { syncPush } from '../core/commands/syncPush.js';
import { syncPull } from '../core/queries/syncPull.js';
import type { UseCaseContext } from '../core/context.js';

export type SyncRouteDeps = {
  ctx: UseCaseContext;
  /**
   * Builds the caller from the bearer token at the transport edge (SPEC-FINAL 16.5).
   * The bearer is the transport, not the author: syncPush still authorizes every
   * operation against its own author_user_id (7.5).
   */
  callerFor: (request: Request) => Promise<CallerResult>;
};

const UNAUTHENTICATED = { error: { code: 'unauthenticated', message: 'sign in again' } } as const;

export function syncRoutes(deps: SyncRouteDeps): Hono {
  const app = new Hono();

  // Both routes authenticate BEFORE they parse: no or a bad token is a 401 whatever the
  // request carries, and an anonymous caller learns nothing about the schema.
  app.post('/sync/push', async (c) => {
    const { caller, refreshedToken } = await deps.callerFor(c.req.raw);
    if (!caller) return c.json(UNAUTHENTICATED, 401);
    if (refreshedToken) c.header('X-Refreshed-Token', refreshedToken);

    const body = await c.req.json().catch(() => null);
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    return c.json(await syncPush(caller, parsed.data, deps.ctx));
  });

  app.get('/sync/pull', async (c) => {
    const { caller, refreshedToken } = await deps.callerFor(c.req.raw);
    if (!caller) return c.json(UNAUTHENTICATED, 401);
    if (refreshedToken) c.header('X-Refreshed-Token', refreshedToken);

    const parsed = pullRequestSchema.safeParse({
      event_id: c.req.query('event_id'),
      since: c.req.query('since'),
      cursor: c.req.query('cursor'),
    });
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    return c.json(await syncPull(caller, parsed.data, deps.ctx));
  });

  return app;
}

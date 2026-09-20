import { Hono } from 'hono';
import { pullRequestSchema, pushRequestSchema, type Caller } from '@frc/shared';
import { syncPush } from '../core/commands/syncPush.js';
import { syncPull } from '../core/queries/syncPull.js';
import type { UseCaseContext } from '../core/context.js';

export type SyncRouteDeps = {
  ctx: UseCaseContext;
  /**
   * Builds the caller at the transport edge (SPEC-FINAL 16.5). Task 1.12 replaces the
   * walking skeleton's implementation with the bearer token, in composition.ts and
   * nowhere else; this signature does not change.
   */
  callerFor: (request: Request, fallbackUserId: string | null) => Promise<Caller | null>;
};

export function syncRoutes(deps: SyncRouteDeps): Hono {
  const app = new Hono();

  app.post('/sync/push', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = pushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    const caller = await deps.callerFor(
      c.req.raw,
      parsed.data.operations[0]?.author_user_id ?? null,
    );
    if (!caller) return c.json({ error: { code: 'unauthenticated', message: 'no caller' } }, 401);

    return c.json(await syncPush(caller, parsed.data, deps.ctx));
  });

  app.get('/sync/pull', async (c) => {
    const parsed = pullRequestSchema.safeParse({
      event_id: c.req.query('event_id'),
      since: c.req.query('since'),
      cursor: c.req.query('cursor'),
    });
    if (!parsed.success) {
      return c.json({ error: { code: 'invalid', message: parsed.error.message } }, 400);
    }
    const caller = await deps.callerFor(c.req.raw, null);
    if (!caller) return c.json({ error: { code: 'unauthenticated', message: 'no caller' } }, 401);
    return c.json(await syncPull(caller, parsed.data, deps.ctx));
  });

  return app;
}

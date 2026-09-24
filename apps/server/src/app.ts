import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from '@frc/shared';
import type { ServerConfig } from './config.js';
import { INTERNAL_ERROR, STATUS } from './routes/errors.js';

export type AppDeps = {
  config: ServerConfig;
  pingDatabase: () => Promise<void>;
  /** Sub-apps mounted at the root. Tasks 1.3 and 1.12 fill this. */
  routes?: Hono[];
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: deps.config.allowedOrigin,
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['X-Refreshed-Token'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      maxAge: 86400,
    }),
  );

  app.get('/health', async (c) => {
    try {
      await deps.pingDatabase();
      return c.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch (e) {
      return c.json(
        { status: 'error', database: 'error', message: e instanceof Error ? e.message : 'unknown' },
        503,
      );
    }
  });

  for (const route of deps.routes ?? []) app.route('/', route);

  app.notFound((c) => c.json({ error: { code: 'not-found', message: 'no such route' } }, 404));

  // One JSON error contract for every route, never Hono's plain-text 500. An AppError maps
  // through the same table as the RPC routes; anything else (a database error propagated
  // by callerFor, say) is logged with the method and path only — no body, no headers.
  app.onError((e, c) => {
    if (e instanceof AppError) {
      return c.json(
        { error: { code: e.code, message: e.message, details: e.details } },
        STATUS[e.code] ?? 500,
      );
    }
    console.error(`${c.req.method} ${c.req.path} failed`, e);
    return c.json(INTERNAL_ERROR, 500);
  });

  return app;
}

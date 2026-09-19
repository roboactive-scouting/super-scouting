import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ServerConfig } from './config.js';

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

  return app;
}

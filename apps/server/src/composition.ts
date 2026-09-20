import type { Hono } from 'hono';
import { createApp } from './app.js';
import { serverConfig } from './config.js';
import { getServiceClient } from './db/client.js';
import { makePingDatabase } from './db/ping.js';
import { supabaseStore } from './repos/store.js';
import { syncRoutes } from './routes/sync.js';
import type { UseCaseContext } from './core/context.js';

export function buildContext(): UseCaseContext {
  const config = serverConfig();
  return { store: supabaseStore(getServiceClient(config)), now: () => new Date() };
}

export function buildApp(): Hono {
  const config = serverConfig();
  const ctx = buildContext();
  return createApp({
    config,
    pingDatabase: makePingDatabase(config),
    routes: [
      syncRoutes({
        ctx,
        // Task 1.12 replaces this one function with the bearer-token version.
        callerFor: async (_request, fallbackUserId) => {
          if (!fallbackUserId) return null;
          const user = await ctx.store.getUser(fallbackUserId);
          return user && user.disabled_at === null
            ? { kind: 'user', userId: user.id, role: user.role }
            : null;
        },
      }),
    ],
  });
}

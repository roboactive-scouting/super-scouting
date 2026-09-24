import type { Hono } from 'hono';
import { createApp } from './app.js';
import { callerFor } from './auth/callerFor.js';
import { serverConfig, type ServerConfig } from './config.js';
import { getServiceClient } from './db/client.js';
import { makePingDatabase } from './db/ping.js';
import { supabaseStore } from './repos/store.js';
import { rpcRoutes } from './routes/rpc.js';
import { syncRoutes } from './routes/sync.js';
import type { UseCaseContext } from './core/context.js';

export function buildContext(): UseCaseContext {
  const config = serverConfig();
  return { store: supabaseStore(getServiceClient(config)), now: () => new Date() };
}

/**
 * Every route the deployed function serves. Exported so app.test.ts exercises this exact
 * wiring over an in-memory store, rather than a copy of it.
 */
export function mountedRoutes(ctx: UseCaseContext, config: ServerConfig): Hono[] {
  return [
    syncRoutes({ ctx, callerFor: (request) => callerFor(request, config, ctx.store) }),
    rpcRoutes(ctx, config),
  ];
}

export function buildApp(): Hono {
  const config = serverConfig();
  const ctx = buildContext();
  return createApp({
    config,
    pingDatabase: makePingDatabase(config),
    routes: mountedRoutes(ctx, config),
  });
}

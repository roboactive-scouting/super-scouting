import type { Hono } from 'hono';
import { createApp } from './app.js';
import { serverConfig } from './config.js';
import { makePingDatabase } from './db/ping.js';

/** Builds the production application from the real environment. */
export function buildApp(): Hono {
  const config = serverConfig();
  return createApp({ config, pingDatabase: makePingDatabase(config), routes: [] });
}

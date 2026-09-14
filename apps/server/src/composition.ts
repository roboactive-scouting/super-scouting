import type { Hono } from 'hono';
import { createApp } from './app';
import { serverConfig } from './config';
import { makePingDatabase } from './db/ping';

/** Builds the production application from the real environment. */
export function buildApp(): Hono {
  const config = serverConfig();
  return createApp({ config, pingDatabase: makePingDatabase(config), routes: [] });
}

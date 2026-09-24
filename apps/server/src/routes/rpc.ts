import { Hono } from 'hono';
import { AppError } from '@frc/shared';
import type { ServerConfig } from '../config.js';
import type { UseCaseContext } from '../core/context.js';
import { callerFor } from '../auth/callerFor.js';
import { INTERNAL_ERROR, STATUS } from './errors.js';
import { REGISTRY, type RegistryEntry } from './registry.js';

type Invoke = (input: never) => Promise<unknown>;

/**
 * One HTTP route per registry entry: the typed client is derived from the registry
 * itself, which is why there is no tRPC (SPEC-FINAL 16.1, 16.4).
 *
 * An authenticated route authenticates BEFORE it reads the body: a request with no or a
 * bad token gets 401 whatever it sent, and learns nothing about the input schema.
 * `registry` defaults to REGISTRY; tests inject one to exercise an authenticated route.
 */
export function rpcRoutes(
  ctx: UseCaseContext,
  config: ServerConfig,
  registry: Record<string, RegistryEntry> = REGISTRY,
): Hono {
  const app = new Hono();

  for (const [name, entry] of Object.entries(registry)) {
    app.post(`/api/${name}`, async (c) => {
      try {
        let invoke: Invoke;
        if (entry.unauthenticated) {
          const handler = entry.handler;
          invoke = (input) => handler(input, ctx, config);
        } else {
          const handler = entry.handler;
          const { caller, refreshedToken } = await callerFor(c.req.raw, config, ctx.store);
          if (!caller) {
            return c.json({ error: { code: 'unauthenticated', message: 'sign in again' } }, 401);
          }
          if (refreshedToken) c.header('X-Refreshed-Token', refreshedToken);
          invoke = (input) => handler(caller, input, ctx, config);
        }

        const body: unknown = await c.req.json().catch(() => undefined);
        const parsedInput = entry.input.safeParse(body);
        if (!parsedInput.success) {
          return c.json({ error: { code: 'invalid', message: parsedInput.error.message } }, 400);
        }

        const output = await invoke(parsedInput.data as never);
        return c.json(entry.output.parse(output));
      } catch (e) {
        if (e instanceof AppError) {
          return c.json(
            { error: { code: e.code, message: e.message, details: e.details } },
            STATUS[e.code] ?? 500,
          );
        }
        console.error(`${name} failed`, e);
        return c.json(INTERNAL_ERROR, 500);
      }
    });
  }

  return app;
}

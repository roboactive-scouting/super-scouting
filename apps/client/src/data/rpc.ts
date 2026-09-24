import type { z } from 'zod';
import { API, UNAUTHENTICATED_USE_CASES, type Api, type ApiName } from '@frc/shared';
import { session } from '@/auth/session';
import { clientConfig } from '@/config';

export type Rpc = { call: (name: string, input?: unknown) => Promise<unknown> };

/**
 * One failed RPC. `status` is the HTTP status, or 0 when the request never reached a
 * server (offline, DNS, CORS). `code` is the server's error code — for code, never for
 * a person to read; `message` is the server's sentence.
 */
export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

const OPEN: ReadonlySet<string> = new Set(UNAUTHENTICATED_USE_CASES);

/**
 * SPEC-FINAL 16.1: "the typed client is derived from the use-case registry itself" — this
 * is why there is no tRPC. `API` is the map of use-case name to its Zod input and output,
 * exported from packages/shared, so a renamed field is a compile error in the page that
 * reads it rather than `undefined` at a venue.
 *
 * The input is validated with the shared schema BEFORE any request: a refusal comes back
 * as `RpcError('invalid', <the schema's own message>, 400)` — the same sentence the server
 * would have sent.
 */
export async function call<K extends ApiName>(
  name: K,
  input: z.input<Api[K]['input']>,
): Promise<z.output<Api[K]['output']>> {
  const entry: { input: z.ZodTypeAny; output: z.ZodTypeAny } = API[name];
  const parsedInput = entry.input.safeParse(input);
  if (!parsedInput.success) {
    throw new RpcError('invalid', parsedInput.error.issues[0]?.message ?? 'that is not valid', 400);
  }
  const body = await rpc.call(name, parsedInput.data);
  const parsedOutput = entry.output.safeParse(body);
  if (!parsedOutput.success) {
    throw new RpcError('invalid', 'the server answered in a shape this app does not know', 500);
  }
  return parsedOutput.data as z.output<Api[K]['output']>;
}

/**
 * The untyped transport under `call`. SPEC-FINAL 7.5: `Authorization: Bearer <token>`,
 * never cookies; any `X-Refreshed-Token` is stored.
 *
 * A 401 from an AUTHENTICATED route means only "this token is dead", so the session is
 * expired (token dropped, user kept) and the call still throws. A 401 from `login` or
 * `refreshToken` means wrong credentials or a bad token offered as INPUT, and never
 * touches the session. A 403 is "not allowed" and never signs anyone out.
 */
export const rpc: Rpc = {
  async call(name: string, input: unknown = {}): Promise<unknown> {
    const open = OPEN.has(name);
    const bearer = open ? null : await session.token();
    let res: Response;
    try {
      res = await fetch(`${clientConfig().apiBaseUrl}/api/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(input),
      });
    } catch {
      throw new RpcError('offline', 'could not reach the server', 0);
    }

    const refreshed = res.headers.get('x-refreshed-token');
    if (refreshed && bearer) await session.replaceToken(refreshed, bearer);

    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && !open && bearer) await session.expire(bearer);
      const error = (body as { error?: { code?: string; message?: string } }).error;
      throw new RpcError(
        error?.code ?? 'invalid',
        error?.message ?? 'that did not work',
        res.status,
      );
    }
    return body;
  },
};

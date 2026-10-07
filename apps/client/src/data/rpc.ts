import type { z } from 'zod';
import { API, UNAUTHENTICATED_USE_CASES, type Api, type ApiName } from '@frc/shared';
import { ensureToken } from '@/auth/ensureToken';
import { session } from '@/auth/session';
import { recordTokenLoss } from '@/auth/tokenLoss';
import { clientConfig } from '@/config';
import { deadline } from './deadline';

/** Per-call transport options. Only the login path sets a deadline (task 1.16). */
export type CallOptions = {
  /** Abort the request, and report it as unreachable, after this many milliseconds. */
  timeoutMs?: number;
};

export type Rpc = {
  call: (name: string, input?: unknown, options?: CallOptions) => Promise<unknown>;
};

/**
 * One failed RPC. `status` is the HTTP status, or 0 when the request never reached a
 * server (offline, DNS, CORS, a deadline). `code` is the server's error code — for code,
 * never for a person to read; `message` is the server's sentence.
 *
 * `answered` is true only when THIS app's server answered in its own error shape
 * (`{ error: { code } }`), or the shared schema refused the input before any request.
 * A captive portal's HTML page, a proxy's 502 or a redirect to a sign-in page all come
 * back with `answered: false` — whatever their status says, they are not our server's
 * verdict (task 1.16 decides the offline-login fallback on this).
 */
export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly answered: boolean = false,
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
  options: CallOptions = {},
): Promise<z.output<Api[K]['output']>> {
  const entry: { input: z.ZodTypeAny; output: z.ZodTypeAny } = API[name];
  const parsedInput = entry.input.safeParse(input);
  if (!parsedInput.success) {
    throw new RpcError(
      'invalid',
      parsedInput.error.issues[0]?.message ?? 'that is not valid',
      400,
      true,
    );
  }
  const body = await rpc.call(name, parsedInput.data, options);
  const parsedOutput = entry.output.safeParse(body);
  if (!parsedOutput.success) {
    // A 200 that is not our shape: most often a captive portal's HTML page.
    throw new RpcError('invalid', 'the server answered in a shape this app does not know', 500);
  }
  return parsedOutput.data as z.output<Api[K]['output']>;
}

/**
 * `call`, widened to the plain `Rpc` shape (task 1.20): the season/event management
 * panels take an injectable `rpc: Rpc` prop so their tests can hand back a plain
 * `vi.fn`, and this is what that prop defaults to. The validation and `RpcError`
 * behaviour underneath are exactly `call`'s own — only the compile-time signature is
 * widened (an admin panel's own use-case names are checked against `API` at the call
 * site already, via the shared schemas it imports for its forms).
 */
export const typedCall: Rpc['call'] = (name, input, options) =>
  call(name as ApiName, input as never, options);

/**
 * How long an admin management call may take before it is reported as unreachable
 * (manage page fix). A hung request used to leave a panel on "Loading…" for as long as
 * the browser cared to wait; past this it lands in the panel's own connection state.
 */
export const ADMIN_CALL_TIMEOUT_MS = 15_000;

/**
 * `typedCall` with the admin deadline: what the season/event/roster/match panels and
 * `ManagePage` default their `rpc` prop to. `call()` and the transport underneath are
 * unchanged for every other caller; only these pages pass a `timeoutMs`.
 */
export const adminRpc: Rpc = {
  call: (name, input, options) =>
    typedCall(name, input, { timeoutMs: ADMIN_CALL_TIMEOUT_MS, ...options }),
};

class DeadlineExceeded extends Error {}

/**
 * The untyped transport under `call`. SPEC-FINAL 7.5: `Authorization: Bearer <token>`,
 * never cookies; any `X-Refreshed-Token` is stored.
 *
 * A 401 from an AUTHENTICATED route means only "this token is dead", so the session is
 * expired (token dropped, user kept) and the call still throws. A 401 from `login` or
 * `refreshToken` means wrong credentials or a bad token offered as INPUT, and never
 * touches the session. A 403 is "not allowed" and never signs anyone out.
 *
 * UF.2: an authenticated call from an offline sign-in on an online device first tries to
 * get a token (`ensureToken`). When our server answers a call sent with no bearer 401, it
 * tries again and, if no token can be had, expires the session — rather than failing
 * silently call after call.
 */
export const rpc: Rpc = {
  async call(name: string, input: unknown = {}, options: CallOptions = {}): Promise<unknown> {
    const open = OPEN.has(name);
    const bearer = open ? null : ((await session.token()) ?? (await ensureToken({ path: name })));
    const limit = deadline(options.timeoutMs, () => new DeadlineExceeded());
    try {
      let res: Response;
      try {
        res = await limit.race(
          fetch(`${clientConfig().apiBaseUrl}/api/${name}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
            },
            body: JSON.stringify(input),
            ...(limit.signal ? { signal: limit.signal } : {}),
          }),
        );
      } catch (e) {
        if (e instanceof DeadlineExceeded || limit.signal?.aborted) {
          throw new RpcError('timeout', 'the server did not answer in time', 0);
        }
        throw new RpcError('offline', 'could not reach the server', 0);
      }

      const refreshed = res.headers.get('x-refreshed-token');
      if (refreshed && bearer) await session.replaceToken(refreshed, bearer);

      // A body that never finishes arriving counts as no body: `{}`.
      const body: unknown = await limit.race(res.json()).catch(() => ({}));
      if (!res.ok) {
        const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
        const answered = typeof error?.code === 'string';
        if (res.status === 401 && !open) {
          if (!bearer) await ensureToken({ path: name, serverAnswered401: answered });
          else if (await session.expire(bearer)) await recordTokenLoss('401', name);
        }
        throw new RpcError(
          answered ? (error.code as string) : 'invalid',
          typeof error?.message === 'string' ? error.message : 'that did not work',
          res.status,
          answered,
        );
      }
      return body;
    } finally {
      limit.done();
    }
  },
};

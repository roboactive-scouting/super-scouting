import { createUserInput, passwordSchema } from '@frc/shared';

/**
 * Creates the FIRST admin of an empty install, and nothing else, ever.
 *
 * Production starts with no users, there is no self-registration, and `createUser`
 * needs a signed-in admin — so without this, a fresh production cannot be signed in to
 * at all (spec §5.4 item 5). This is the one-time way in.
 *
 * READ THIS BEFORE "FIXING" IT. Every other script in `packages/db` refuses to touch
 * production (`seed`, `clean`, the integration tests). This one is ALLOWED to, because
 * that is its whole purpose. It does not guard against production; it guards the
 * OPERATOR: it names the project it is about to write to and makes them type that ref
 * back. Do not add a production refusal to match the other scripts — that would lock
 * production out of itself again.
 *
 * What keeps it safe to leave in the repository forever is the other guard: it REFUSES
 * (non-zero exit, naming who is there) if the `users` table holds any row at all,
 * disabled ones included. Once an install has one user, this script is inert.
 *
 * The password is typed twice at a prompt that does not echo. It is never read from an
 * argument, a file or the environment, and never printed. It is a temporary one:
 * `must_change_password` is set, so the real password is chosen by the admin at first
 * sign-in and never exists anywhere this script can see.
 *
 * All I/O is injected so the refusal and creation paths are unit tested without a
 * database or a terminal; `run.ts` wires in the real ones.
 */

/** Non-secret. Named only so the banner can say "this is DEV" when it is. The
 *  production ref is deliberately not written here (BUILD-CONTEXT §4.1). */
export const DEV_PROJECT_REF = 'oqvoqddoizhhwvjwejtm';

/** SPEC-FINAL 7.5 / D1 — the same cost as `apps/server/src/auth/password.ts`. */
export const BCRYPT_COST = 10;

/** The file `run.ts` reads, relative to the repo root. Gitignored by `.env.*`. */
export const ENV_FILE_NAME = 'packages/db/.env.bootstrap';

export const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BOOTSTRAP_ADMIN_USERNAME',
  'BOOTSTRAP_ADMIN_FULL_NAME',
] as const;

export type BootstrapEnv = Partial<Record<(typeof REQUIRED_ENV)[number], string>>;

export type ExistingUser = { username: string; role: string; disabled_at: string | null };

export type NewAdmin = {
  id: string;
  username: string;
  full_name: string;
  role: 'admin';
  password_hash: string;
  must_change_password: true;
};

export type CreatedAdmin = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  must_change_password: boolean;
};

export interface BootstrapStore {
  /** Every row of `users`, disabled ones included. */
  listUsers(): Promise<ExistingUser[]>;
  insertAdmin(row: NewAdmin): Promise<CreatedAdmin>;
}

export interface BootstrapTerminal {
  /** True only when stdin is a real terminal that can switch echo off. */
  readonly interactive: boolean;
  say(line: string): void;
  ask(question: string): Promise<string>;
  /** Reads a line without echoing it. */
  askHidden(question: string): Promise<string>;
}

export type BootstrapDeps = {
  env: BootstrapEnv;
  store: BootstrapStore;
  terminal: BootstrapTerminal;
  hash: (plain: string, cost: number) => Promise<string>;
  newId: () => string;
};

/** A deliberate stop. `run.ts` prints the message and exits non-zero. */
export class BootstrapRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapRefusal';
  }
}

/** `https://<ref>.supabase.co` → `<ref>`; anything else → null. */
export function projectRefOf(url: string): string | null {
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url.trim());
  return match ? match[1]! : null;
}

const SHOWN_USERS = 20;

function describeExisting(users: readonly ExistingUser[]): string {
  const lines = users
    .slice(0, SHOWN_USERS)
    .map((u) => `  - ${u.username} (${u.role}${u.disabled_at ? ', disabled' : ''})`);
  if (users.length > SHOWN_USERS) lines.push(`  … and ${users.length - SHOWN_USERS} more`);
  return lines.join('\n');
}

function refuseIfAnyUser(users: readonly ExistingUser[], ref: string): void {
  if (users.length === 0) return;
  throw new BootstrapRefusal(
    `refusing to run: project ${ref} already has ${users.length} user(s):\n` +
      `${describeExisting(users)}\n` +
      'This script only ever creates the FIRST admin of an empty install. Nothing was ' +
      'written. To add another user, sign in as an admin and use the Users screen.',
  );
}

export async function bootstrapAdmin(deps: BootstrapDeps): Promise<CreatedAdmin> {
  const { env, store, terminal } = deps;

  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new BootstrapRefusal(
      `refusing to run: ${ENV_FILE_NAME} must set ${missing.join(', ')}. ` +
        'See docs/ops/SETUP.md, "Supabase — production project".',
    );
  }

  const ref = projectRefOf(env.SUPABASE_URL!);
  if (!ref) {
    throw new BootstrapRefusal(
      'refusing to run: SUPABASE_URL is not a Supabase project URL ' +
        '(expected https://<project-ref>.supabase.co).',
    );
  }

  const identity = createUserInput.pick({ username: true, full_name: true }).safeParse({
    username: env.BOOTSTRAP_ADMIN_USERNAME,
    full_name: env.BOOTSTRAP_ADMIN_FULL_NAME,
  });
  if (!identity.success) {
    const detail = identity.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new BootstrapRefusal(`refusing to run: ${detail.join('; ')}`);
  }
  const { username, full_name } = identity.data;

  const isDev = ref === DEV_PROJECT_REF;
  terminal.say('');
  terminal.say('================================================================');
  terminal.say(`  BOOTSTRAP ADMIN — about to write to Supabase project ${ref}`);
  terminal.say(
    isDev
      ? '  This is the DEV project.'
      : '  This is NOT the dev project. It is presumably PRODUCTION.',
  );
  terminal.say('  This is the only script in the repository allowed to write there.');
  terminal.say(`  It will create one admin: ${username} (${full_name})`);
  terminal.say('================================================================');
  terminal.say('');

  // Read-only, and first: an install that already has users stops here, before any
  // question is asked.
  refuseIfAnyUser(await store.listUsers(), ref);

  if (!terminal.interactive) {
    throw new BootstrapRefusal(
      'refusing to run: stdin is not an interactive terminal, so the password prompt ' +
        'cannot hide what you type. Run it from PowerShell or Windows Terminal ' +
        '(in Git Bash\'s mintty window, prefix the command with "winpty").',
    );
  }

  const typed = (await terminal.ask(`Type the project ref (${ref}) to confirm: `)).trim();
  if (typed !== ref) {
    throw new BootstrapRefusal(
      'refusing to run: the ref you typed does not match. Nothing was written.',
    );
  }

  terminal.say(
    'Choose a TEMPORARY password (at least 8 characters). You will be made to replace ' +
      'it at first sign-in. Nothing is shown while you type.',
  );
  const first = await terminal.askHidden('Temporary password: ');
  const checked = passwordSchema.safeParse(first);
  if (!checked.success) {
    throw new BootstrapRefusal(
      `refusing to run: ${checked.error.issues[0]?.message ?? 'password rejected'}. Nothing was written.`,
    );
  }
  const second = await terminal.askHidden('Type it again: ');
  if (second !== first) {
    throw new BootstrapRefusal('refusing to run: the two passwords differ. Nothing was written.');
  }

  const passwordHash = await deps.hash(first, BCRYPT_COST);

  // Check again right before writing: someone may have created a user while the
  // operator was typing. There is no transaction across PostgREST calls, so this
  // narrows the window rather than closing it; the unique username index still
  // stops two runs creating the same name.
  refuseIfAnyUser(await store.listUsers(), ref);

  const created = await store.insertAdmin({
    id: deps.newId(),
    username,
    full_name,
    role: 'admin',
    password_hash: passwordHash,
    must_change_password: true,
  });

  terminal.say('');
  terminal.say(`Created admin "${created.username}" in project ${ref}.`);
  terminal.say('Next: sign in with it. You will be sent straight to "Change password".');
  terminal.say(`Then delete ${ENV_FILE_NAME} — it holds the service_role key.`);
  return created;
}

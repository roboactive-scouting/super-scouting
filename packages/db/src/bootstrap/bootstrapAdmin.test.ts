import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import {
  BCRYPT_COST,
  BootstrapRefusal,
  DEV_PROJECT_REF,
  bootstrapAdmin,
  projectRefOf,
  type BootstrapDeps,
  type BootstrapEnv,
  type CreatedAdmin,
  type ExistingUser,
  type NewAdmin,
} from './bootstrapAdmin';

const REF = 'abcdefghijklmnopqrst';
const PASSWORD = 'Tr0ub4dor&3-temporary';

const env = (over: BootstrapEnv = {}): BootstrapEnv => ({
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
  BOOTSTRAP_ADMIN_USERNAME: ' Team-Admin ',
  BOOTSTRAP_ADMIN_FULL_NAME: 'Team Admin',
  ...over,
});

type Harness = {
  deps: BootstrapDeps;
  inserted: NewAdmin[];
  said: string[];
  asked: string[];
  users: ExistingUser[];
  listCalls: number;
};

function harness(
  opts: {
    users?: ExistingUser[];
    env?: BootstrapEnv;
    interactive?: boolean;
    answers?: string[];
    hidden?: string[];
    /** Users that appear between the first and second `listUsers` call. */
    appearLater?: ExistingUser[];
  } = {},
): Harness {
  const h: Harness = {
    inserted: [],
    said: [],
    asked: [],
    users: [...(opts.users ?? [])],
    listCalls: 0,
    deps: undefined as unknown as BootstrapDeps,
  };
  const answers = [...(opts.answers ?? [REF])];
  const hidden = [...(opts.hidden ?? [PASSWORD, PASSWORD])];
  h.deps = {
    env: opts.env ?? env(),
    store: {
      listUsers: async () => {
        h.listCalls += 1;
        if (h.listCalls === 2 && opts.appearLater) h.users.push(...opts.appearLater);
        return [...h.users];
      },
      insertAdmin: async (row): Promise<CreatedAdmin> => {
        h.inserted.push(row);
        return {
          id: row.id,
          username: row.username,
          full_name: row.full_name,
          role: row.role,
          must_change_password: row.must_change_password,
        };
      },
    },
    terminal: {
      interactive: opts.interactive ?? true,
      say: (line) => h.said.push(line),
      ask: async (q) => {
        h.asked.push(q);
        return answers.shift() ?? '';
      },
      askHidden: async (q) => {
        h.asked.push(q);
        return hidden.shift() ?? '';
      },
    },
    hash: (plain, cost) => bcrypt.hash(plain, cost),
    newId: () => 'new-admin-id',
  };
  return h;
}

async function refusal(h: Harness): Promise<string> {
  const error = await bootstrapAdmin(h.deps).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BootstrapRefusal);
  return (error as BootstrapRefusal).message;
}

/** Everything the run showed the operator, including the refusal text. */
const transcript = (h: Harness, extra = ''): string => [...h.said, ...h.asked, extra].join('\n');

const seedUsers: ExistingUser[] = [
  { username: 'seed_scouter', role: 'scouter', disabled_at: null },
  { username: 'seed_lead', role: 'lead', disabled_at: null },
  { username: 'seed_admin', role: 'admin', disabled_at: null },
];

describe('bootstrapAdmin — refuses when any user exists', () => {
  it('refuses, names who is there, and writes nothing', async () => {
    const h = harness({ users: seedUsers });
    const message = await refusal(h);
    expect(message).toMatch(/already has 3 user\(s\)/);
    for (const u of seedUsers) expect(message).toContain(`${u.username} (${u.role})`);
    expect(h.inserted).toEqual([]);
  });

  it('asks nothing before refusing — not the confirmation, not the password', async () => {
    const h = harness({ users: seedUsers });
    await refusal(h);
    expect(h.asked).toEqual([]);
  });

  it('counts a disabled user as a user', async () => {
    const h = harness({
      users: [{ username: 'old', role: 'admin', disabled_at: '2026-01-01T00:00:00Z' }],
    });
    expect(await refusal(h)).toContain('old (admin, disabled)');
    expect(h.inserted).toEqual([]);
  });

  it('refuses even without a terminal, so the refusal is testable from anywhere', async () => {
    const h = harness({ users: seedUsers, interactive: false });
    expect(await refusal(h)).toMatch(/already has/);
  });

  it('refuses when a user appears while the operator is typing', async () => {
    const h = harness({
      appearLater: [{ username: 'racer', role: 'admin', disabled_at: null }],
    });
    expect(await refusal(h)).toContain('racer (admin)');
    expect(h.listCalls).toBe(2);
    expect(h.inserted).toEqual([]);
  });

  it('caps a long list', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      username: `u${i}`,
      role: 'scouter',
      disabled_at: null,
    }));
    expect(await refusal(harness({ users: many }))).toContain('… and 5 more');
  });
});

describe('bootstrapAdmin — creates the first admin of an empty install', () => {
  it('creates exactly one admin with must_change_password set', async () => {
    const h = harness();
    const created = await bootstrapAdmin(h.deps);
    expect(h.inserted).toHaveLength(1);
    const row = h.inserted[0]!;
    expect(row).toMatchObject({
      id: 'new-admin-id',
      username: 'team-admin', // trimmed and lowercased by the shared username schema
      full_name: 'Team Admin',
      role: 'admin',
      must_change_password: true,
    });
    expect(created.must_change_password).toBe(true);
  });

  it('stores a cost-10 bcrypt hash of the typed password, not the password', async () => {
    const h = harness();
    await bootstrapAdmin(h.deps);
    const hash = h.inserted[0]!.password_hash;
    expect(hash).not.toContain(PASSWORD);
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(await bcrypt.compare(PASSWORD, hash)).toBe(true);
  });

  it('names the project ref before asking, and asks for it back', async () => {
    const h = harness();
    await bootstrapAdmin(h.deps);
    expect(h.said.join('\n')).toContain(`about to write to Supabase project ${REF}`);
    expect(h.said.join('\n')).toContain('presumably PRODUCTION');
    expect(h.asked[0]).toContain(REF);
  });

  it('says DEV when the ref is the dev project', async () => {
    const h = harness({
      env: env({ SUPABASE_URL: `https://${DEV_PROJECT_REF}.supabase.co` }),
      answers: [DEV_PROJECT_REF],
    });
    await bootstrapAdmin(h.deps);
    expect(h.said.join('\n')).toContain('This is the DEV project.');
  });
});

describe('bootstrapAdmin — never shows the password', () => {
  it('does not print the password or its hash on success', async () => {
    const h = harness();
    await bootstrapAdmin(h.deps);
    const out = transcript(h);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(h.inserted[0]!.password_hash);
  });

  it('does not print either password when they differ', async () => {
    const other = 'a-different-one-9';
    const h = harness({ hidden: [PASSWORD, other] });
    const message = await refusal(h);
    expect(message).toMatch(/differ/);
    const out = transcript(h, message);
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain(other);
    expect(h.inserted).toEqual([]);
  });

  it('does not print a too-short password', async () => {
    const h = harness({ hidden: ['short7!'] });
    const message = await refusal(h);
    expect(message).toMatch(/at least 8/);
    expect(transcript(h, message)).not.toContain('short7!');
    expect(h.inserted).toEqual([]);
  });

  it('reads the password only through the hidden prompt', async () => {
    const h = harness();
    await bootstrapAdmin(h.deps);
    // one visible question (the ref), two hidden ones
    expect(h.asked).toEqual([
      expect.stringContaining('Type the project ref'),
      'Temporary password: ',
      'Type it again: ',
    ]);
  });
});

describe('bootstrapAdmin — other refusals', () => {
  it('refuses a mistyped ref', async () => {
    const h = harness({ answers: ['abcdefghijklmnopqrsX'] });
    expect(await refusal(h)).toMatch(/does not match/);
    expect(h.inserted).toEqual([]);
  });

  it('refuses without an interactive terminal once it would have to prompt', async () => {
    const h = harness({ interactive: false });
    expect(await refusal(h)).toMatch(/not an interactive terminal/);
    expect(h.asked).toEqual([]);
  });

  it('names every missing variable, and never a value', async () => {
    const h = harness({
      env: { SUPABASE_URL: `https://${REF}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: 'k' },
    });
    const message = await refusal(h);
    expect(message).toContain('BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_FULL_NAME');
    expect(h.listCalls).toBe(0);
  });

  it('refuses a URL that is not a Supabase project URL', async () => {
    expect(
      await refusal(harness({ env: env({ SUPABASE_URL: 'http://localhost:54321' }) })),
    ).toMatch(/not a Supabase project URL/);
  });

  it('refuses a username the app would refuse', async () => {
    const h = harness({ env: env({ BOOTSTRAP_ADMIN_USERNAME: 'has space' }) });
    expect(await refusal(h)).toMatch(/username/);
    expect(h.listCalls).toBe(0);
  });
});

describe('projectRefOf', () => {
  it('extracts the ref', () => {
    expect(projectRefOf(`https://${REF}.supabase.co`)).toBe(REF);
    expect(projectRefOf(`https://${REF}.supabase.co/`)).toBe(REF);
  });
  it('rejects anything else', () => {
    expect(projectRefOf('https://example.com')).toBeNull();
    expect(projectRefOf(`http://${REF}.supabase.co`)).toBeNull();
    expect(projectRefOf(`https://${REF}.supabase.co.evil.com`)).toBeNull();
  });
});

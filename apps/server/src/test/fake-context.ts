import type { FormFieldDefinition } from '@frc/shared';
import type {
  Store,
  StoredFullUser,
  StoredRow,
  StoredUser,
  UseCaseContext,
} from '../core/context.js';
import { DUMMY_PASSWORD_HASH } from '../auth/password.js';
import { stubsFor } from '../repos/store.js';

export type FakeRow = Record<string, unknown> & { id: string; version: number };
/** `matches` is not versioned: SPEC-FINAL 6.4 defines a bare match as event, type, number. */
export type FakeMatchRow = Record<string, unknown> & { id: string };

/**
 * The columns of public.matches (migration 20260903090000_skeleton.sql). The fake
 * rejects anything else the way PostgREST does, so a phantom column fails a unit test
 * instead of a deployed push — which is how `version` on matches reached the preview.
 */
const MATCH_COLUMNS = new Set([
  'id',
  'event_id',
  'match_type',
  'number',
  'official_red_score',
  'official_blue_score',
  'official_red_rp',
  'official_blue_rp',
  'official_winner',
  'created_at',
  'updated_at',
]);

/** The columns of public.users (migration 20260903091000_forms.sql), checked the same way. */
const USER_COLUMNS = new Set([
  'id',
  'username',
  'full_name',
  'password_hash',
  'role',
  'must_change_password',
  'disabled_at',
  'created_at',
  'updated_at',
]);

function checkUserColumns(row: Record<string, unknown>): void {
  const unknown = Object.keys(row).find((column) => !USER_COLUMNS.has(column));
  if (unknown !== undefined) {
    throw new Error(`Could not find the '${unknown}' column of 'users' in the schema cache`);
  }
}

/** Shaped like the Supabase store's errors: a message and Postgres's own `code`. */
function pgError(code: string, constraintOrMessage: string): Error & { code: string } {
  const message =
    code === '23505'
      ? `duplicate key value violates unique constraint "${constraintOrMessage}"`
      : constraintOrMessage;
  return Object.assign(new Error(message), { code });
}

function compareKeys(a: string[], b: string[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const FIXTURE_CREATED_AT = '2026-11-01T00:00:00.000Z';

/**
 * `ctx.users`, as a view over `usersById`. `set` merges the id, role and disabled_at into
 * the full record (creating a placeholder one, whose username is its id, if there is
 * none); `get` projects the full record back down to a StoredUser.
 */
class UserView extends Map<string, StoredUser> {
  constructor(private readonly byId: Map<string, StoredFullUser>) {
    super();
  }
  private snapshot(): Map<string, StoredUser> {
    return new Map(
      [...this.byId].map(([id, u]) => [id, { id: u.id, role: u.role, disabled_at: u.disabled_at }]),
    );
  }
  override get(id: string): StoredUser | undefined {
    return this.snapshot().get(id);
  }
  override set(id: string, user: StoredUser): this {
    const existing = this.byId.get(id);
    this.byId.set(
      id,
      existing
        ? { ...existing, role: user.role, disabled_at: user.disabled_at }
        : {
            ...user,
            id,
            username: id,
            full_name: id,
            password_hash: DUMMY_PASSWORD_HASH,
            must_change_password: false,
            created_at: FIXTURE_CREATED_AT,
          },
    );
    return this;
  }
  override has(id: string): boolean {
    return this.byId.has(id);
  }
  override delete(id: string): boolean {
    return this.byId.delete(id);
  }
  override clear(): void {
    this.byId.clear();
  }
  override get size(): number {
    return this.byId.size;
  }
  override keys() {
    return this.snapshot().keys();
  }
  override values() {
    return this.snapshot().values();
  }
  override entries() {
    return this.snapshot().entries();
  }
  override [Symbol.iterator]() {
    return this.snapshot()[Symbol.iterator]();
  }
  override forEach(
    callback: (value: StoredUser, key: string, map: Map<string, StoredUser>) => void,
  ): void {
    this.snapshot().forEach((value, key) => callback(value, key, this));
  }
}

/**
 * `ctx.usersByName`, as a view over `usersById`, keyed by lowercased username. `set`
 * stores the user under ITS OWN id, whatever name key the test used.
 */
class UsersByNameView extends Map<string, StoredFullUser> {
  constructor(private readonly byId: Map<string, StoredFullUser>) {
    super();
  }
  private snapshot(): Map<string, StoredFullUser> {
    return new Map([...this.byId.values()].map((u) => [u.username.toLowerCase(), u]));
  }
  override get(name: string): StoredFullUser | undefined {
    return this.snapshot().get(name.toLowerCase());
  }
  override set(_name: string, user: StoredFullUser): this {
    this.byId.set(user.id, user);
    return this;
  }
  override has(name: string): boolean {
    return this.snapshot().has(name.toLowerCase());
  }
  override delete(name: string): boolean {
    const user = this.get(name);
    return user ? this.byId.delete(user.id) : false;
  }
  override clear(): void {
    this.byId.clear();
  }
  override get size(): number {
    return this.snapshot().size;
  }
  override keys() {
    return this.snapshot().keys();
  }
  override values() {
    return this.snapshot().values();
  }
  override entries() {
    return this.snapshot().entries();
  }
  override [Symbol.iterator]() {
    return this.snapshot()[Symbol.iterator]();
  }
  override forEach(
    callback: (value: StoredFullUser, key: string, map: Map<string, StoredFullUser>) => void,
  ): void {
    this.snapshot().forEach((value, key) => callback(value, key, this));
  }
}

/**
 * Every map the phase-1 tests use, declared once. Later tasks add rows to these maps
 * and implement the Store methods that read them; none of them adds a field.
 */
export type FakeContext = UseCaseContext & {
  rows: { scouting_entries: Map<string, FakeRow>; matches: Map<string, FakeMatchRow> };
  users: Map<string, StoredUser>;
  usersById: Map<string, StoredFullUser>;
  usersByName: Map<string, StoredFullUser>;
  seasons: Map<string, FakeRow>;
  events: Map<string, FakeRow>;
  teams: Map<string, FakeRow>;
  eventTeams: Map<string, FakeRow>;
  roster: Map<string, string[]>;
  matches: Map<string, FakeMatchRow>;
  matchTeams: Map<string, FakeRow>;
  forms: Map<string, FakeRow>;
  formVersions: Map<string, FakeRow>;
  formFields: Map<string, FormFieldDefinition>;
  scoringRules: Map<string, FakeRow>;
  conflicts: Map<string, FakeRow>;
  pullRows: Map<string, Record<string, unknown>[]>;
  knownEvents: Set<string>;
  missingParents: Set<string>;
  entryCountsByMatch: Map<string, number>;
  entryCountsBySeason: Map<string, number>;
  entryCountsByVersion: Map<string, number>;
  ops: Set<string>;
  appliedOrder: string[];
  formVersionWrites: number;
  /** Overridable clock, so a test can prove the server never compares to server time. */
  nowValue: Date;
  /** Fixtures used by the later groups; each is implemented by the task that needs it. */
  seedSmallSeason(): void;
  seedRankingFixture(): void;
  setActiveContext(seasonId: string | null, eventId: string | null): void;
  softDelete(entryId: string): void;
  duplicateEntry(sourceId: string, options: { scoreDelta: number; newer: boolean }): void;
  changeFieldTypeBetweenVersions(key: string): void;
};

const SKELETON_FIELDS: FormFieldDefinition[] = [
  {
    id: 'f1',
    key: 'auto_notes',
    label: 'Auto notes',
    type: 'counter',
    display_order: 1,
    required: false,
    config: { min: 0, max: 10, step: 1 },
    section: null,
    help_text: null,
    default_value: 0,
    visibility_condition: null,
    deprecated: false,
    description: 'x',
    unit: 'count',
    phase: 'auto',
    direction: 'higher_is_better',
    category: null,
    expected_range: { min: 0, max: 10 },
    include_in_ai_context: null,
    is_ordinal: null,
  },
];

/**
 * An in-memory stand-in for the database, so use-case tests run with no network.
 * Integration tests against the real dev project live in packages/db/test.
 */
export function makeFakeContext(): FakeContext {
  const rows = {
    scouting_entries: new Map<string, FakeRow>(),
    matches: new Map<string, FakeMatchRow>(),
  };
  // ONE source of truth for users: `usersById`. `users` and `usersByName` are views over
  // it, so a write through the store (disableUser, setUserRole) is what getUser — and so
  // callerFor — reads on the next request, and a test's `ctx.users.set(...)` still works.
  const usersById = new Map<string, StoredFullUser>(
    (['scouter', 'lead', 'admin'] as const).map((role) => [
      `u-${role}`,
      {
        id: `u-${role}`,
        username: role,
        full_name: `Fixture ${role}`,
        role,
        // No password verifies against it; a test that needs one sets it with resetPassword.
        password_hash: DUMMY_PASSWORD_HASH,
        must_change_password: false,
        disabled_at: null,
        created_at: FIXTURE_CREATED_AT,
      },
    ]),
  );
  const users = new UserView(usersById);
  const usersByName = new UsersByNameView(usersById);
  const assertUsernameFree = (username: string, ownId: string): void => {
    for (const other of usersById.values()) {
      if (other.id !== ownId && other.username.toLowerCase() === username.toLowerCase()) {
        throw pgError('23505', 'users_username_lower_idx');
      }
    }
  };
  const ops = new Set<string>();
  const appliedOrder: string[] = [];
  const pullRows = new Map<string, Record<string, unknown>[]>();
  const knownEvents = new Set(['ev-1']);

  const fake = {
    // every map from the FakeContext type, constructed empty
    rows,
    users,
    usersById,
    usersByName,
    seasons: new Map(),
    events: new Map(),
    teams: new Map(),
    eventTeams: new Map(),
    roster: new Map(),
    matches: rows.matches,
    matchTeams: new Map(),
    forms: new Map(),
    formVersions: new Map(),
    formFields: new Map(),
    scoringRules: new Map(),
    conflicts: new Map(),
    pullRows,
    knownEvents,
    missingParents: new Set<string>(),
    entryCountsByMatch: new Map(),
    entryCountsBySeason: new Map(),
    entryCountsByVersion: new Map(),
    ops,
    appliedOrder,
    formVersionWrites: 0,
    nowValue: new Date('2026-11-14T10:00:00.000Z'),
    seedSmallSeason: () => {
      throw new Error('seedSmallSeason lands with task 1.50');
    },
    seedRankingFixture: () => {
      throw new Error('seedRankingFixture lands with task 1.57');
    },
    setActiveContext: () => {
      throw new Error('setActiveContext lands with task 1.18');
    },
    softDelete: () => {
      throw new Error('softDelete lands with task 1.50');
    },
    duplicateEntry: () => {
      throw new Error('duplicateEntry lands with task 1.57');
    },
    changeFieldTypeBetweenVersions: () => {
      throw new Error('lands with task 1.57');
    },
  } as unknown as FakeContext;

  // Typed separately, rather than inline in the Object.assign below: Object.assign's
  // generic inference does not flow FakeContext's `store: Store` field back in as a
  // contextual type for a nested object literal, which left every method parameter
  // here implicitly `any`. The `as Store` cast is the same fix as repos/store.ts's —
  // stubsFor's spread only carries an index signature, not the named methods it
  // supplies at runtime.
  const store = {
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async getFullUser(id) {
      return usersById.get(id) ?? null;
    },
    // Matches the Supabase store: case-insensitive and exact, whatever key a test used.
    async getUserByUsername(usernameLower) {
      for (const user of usersById.values()) {
        if (user.username.toLowerCase() === usernameLower) return user;
      }
      return null;
    },
    async insertUser(row) {
      checkUserColumns(row);
      const user = {
        must_change_password: false,
        disabled_at: null,
        created_at: fake.nowValue.toISOString(),
        ...row,
      } as StoredFullUser;
      if (usersById.has(user.id)) throw pgError('23505', 'users_pkey');
      assertUsernameFree(user.username, user.id);
      usersById.set(user.id, user);
      return user;
    },
    async updateUser(id, patch) {
      checkUserColumns(patch);
      const existing = usersById.get(id);
      // PostgREST's `.single()` on zero rows.
      if (!existing) throw pgError('PGRST116', 'no user with that id');
      const next = { ...existing, ...patch } as StoredFullUser;
      assertUsernameFree(next.username, id);
      usersById.set(id, next);
      return next;
    },
    async listUsers({ includeDisabled, limit, after }) {
      const key = (u: { username: string; id: string }) => [u.username.toLowerCase(), u.id];
      const sorted = [...usersById.values()]
        .filter((u) => includeDisabled || u.disabled_at === null)
        .sort((a, b) => compareKeys(key(a), key(b)));
      const page = after ? sorted.filter((u) => compareKeys(key(u), key(after)) > 0) : sorted;
      // The explicit column list of the Supabase store, as an explicit projection.
      return page.slice(0, limit).map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        must_change_password: u.must_change_password,
        disabled_at: u.disabled_at,
        created_at: u.created_at,
      }));
    },
    async countEnabledAdmins() {
      return [...usersById.values()].filter((u) => u.role === 'admin' && u.disabled_at === null)
        .length;
    },
    async wasApplied(opId) {
      return ops.has(opId);
    },
    async markApplied(opId) {
      ops.add(opId);
    },
    async getRow(entity, id) {
      if (entity === 'match') return (rows.matches.get(id) as StoredRow | undefined) ?? null;
      return rows.scouting_entries.get(id) ?? null;
    },
    async putRow(entity, id, row) {
      if (entity === 'match') {
        const unknown = Object.keys(row).find((column) => !MATCH_COLUMNS.has(column));
        if (unknown !== undefined) {
          throw new Error(
            `Could not find the '${unknown}' column of 'matches' in the schema cache`,
          );
        }
        rows.matches.set(id, row as FakeMatchRow);
      } else {
        rows.scouting_entries.set(id, row as FakeRow);
      }
      appliedOrder.push(id);
    },
    // A declared parameter matters here even though the skeleton fixture ignores it:
    // an arity mismatch against Store's own `getFormFields(formVersionId: string)` is
    // enough to make the `as Store` cast below fail as "insufficient overlap" (see the
    // deviation logged for this task).
    async getFormFields(_formVersionId) {
      return SKELETON_FIELDS;
    },
    async eventExists(eventId) {
      return knownEvents.has(eventId);
    },
    async pullEntity(key, scope, since, offset, limit) {
      void scope;
      const all = (pullRows.get(key) ?? [])
        .filter((r) => since === undefined || String(r.updated_at) > since)
        .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
      return all.slice(offset, offset + limit);
    },
    async resolveScope(eventId) {
      return { eventId, seasonId: 'se-1' };
    },
    // Everything else on the Store starts as a loud stub; each later task
    // replaces the two or three entries it needs.
    ...stubsFor([
      'findByLogicalKey',
      'parentsExist',
      'insertConflict',
      'listConflicts',
      'getConflict',
      'resolveConflictRow',
      'getActiveContext',
      'setActiveContext',
      'getSeason',
      'getSeasonByYear',
      'insertSeason',
      'updateSeason',
      'listSeasons',
      'getEvent',
      'insertEvent',
      'updateEvent',
      'listEvents',
      'getTeam',
      'getTeamByNumber',
      'insertTeam',
      'updateTeam',
      'listTeams',
      'getRoster',
      'setRoster',
      'findMatch',
      'insertMatch',
      'listMatches',
      'setMatchTeams',
      'countEntriesByMatch',
      'countEntriesBySeason',
      'deleteMatch',
      'getForm',
      'getFormByKind',
      'insertForm',
      'updateForm',
      'getFormVersion',
      'listFormVersions',
      'insertFormVersion',
      'updateFormVersion',
      'countEntriesByFormVersion',
      'replaceFormFields',
      'getScoringRules',
      'replaceScoringRules',
      'getEntry',
      'queryEntries',
      'entriesForScope',
      'listTeamEvents',
      'deleteSeason',
      'deleteEvent',
      'deleteFormCascade',
      'deleteFormVersion',
      'countDeleteImpact',
    ]),
  } as Store;

  return Object.assign(fake, {
    // the clock is read through the object, so a test can move it
    now: () => fake.nowValue,
    store,
  });
}

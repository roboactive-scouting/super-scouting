import { MATCH_TYPES, type FormFieldDefinition } from '@frc/shared';
import type {
  Store,
  StoredEvent,
  StoredFullUser,
  StoredMatch,
  StoredRow,
  StoredSeason,
  StoredTeam,
  StoredUser,
  UseCaseContext,
} from '../core/context.js';
import { DUMMY_PASSWORD_HASH } from '../auth/password.js';
import { stubsFor } from '../repos/store.js';

export type FakeRow = Record<string, unknown> & { id: string; version: number };
/** `matches` is not versioned: SPEC-FINAL 6.4 defines a bare match as event, type, number. */
export type FakeMatchRow = Record<string, unknown> & {
  id: string;
  event_id: string;
  match_type: string;
  number: number;
};

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

/**
 * The columns of public.teams, public.event_teams and public.match_teams (migration
 * 20260903090000_skeleton.sql), checked like matches. None has a `version`; only
 * event_teams has a `deleted_at`.
 */
const TEAM_COLUMNS = new Set(['id', 'number', 'name', 'created_at', 'updated_at']);
const EVENT_TEAM_COLUMNS = new Set([
  'id',
  'event_id',
  'team_id',
  'created_at',
  'updated_at',
  'deleted_at',
]);
const MATCH_TEAM_COLUMNS = new Set([
  'id',
  'match_id',
  'alliance',
  'station',
  'team_id',
  'created_at',
  'updated_at',
]);

/** An `event_teams` row: one team on one event's roster, soft-deleted on removal. */
export type FakeEventTeam = {
  id: string;
  event_id: string;
  team_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** A `match_teams` row, one filled slot. `ctx.matchTeams` keys it `<match>:<alliance>:<station>`. */
export type FakeMatchTeam = {
  id: string;
  match_id: string;
  alliance: 'red' | 'blue';
  station: number;
  team_id: string;
  created_at: string;
  updated_at: string;
};

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
  checkColumns('users', USER_COLUMNS, row);
}

/**
 * The columns of public.seasons and public.events (migration 20260903090000_skeleton.sql).
 * Neither has a `version`: they are not synced. Checked like matches and users, so a
 * phantom column fails a unit test instead of a deployed write.
 */
const SEASON_COLUMNS = new Set([
  'id',
  'year',
  'game_name',
  'field_image_path',
  'created_at',
  'updated_at',
]);
const EVENT_COLUMNS = new Set([
  'id',
  'season_id',
  'name',
  'code',
  'sort_order',
  'created_at',
  'updated_at',
]);

function checkColumns(table: string, columns: Set<string>, row: Record<string, unknown>): void {
  const unknown = Object.keys(row).find((column) => !columns.has(column));
  if (unknown !== undefined) {
    throw new Error(`Could not find the '${unknown}' column of '${table}' in the schema cache`);
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
 * `ctx.roster`, as a view over `eventTeams` (task 1.19): ONE source of truth for the
 * roster, the way `users` is a view over `usersById`. `set(eventId, teamIds)` writes
 * live event_teams rows exactly as Store.setRoster does (removals tombstoned, a re-add
 * revives its row) but checks no foreign key, so a fixture can name any id; `get`
 * returns the event's live team ids, or undefined when it has none.
 */
class RosterView extends Map<string, string[]> {
  constructor(
    private readonly write: (eventId: string, teamIds: string[]) => void,
    private readonly rows: Map<string, FakeEventTeam>,
  ) {
    super();
  }
  private snapshot(): Map<string, string[]> {
    const byEvent = new Map<string, string[]>();
    for (const row of this.rows.values()) {
      if (row.deleted_at !== null) continue;
      byEvent.set(row.event_id, [...(byEvent.get(row.event_id) ?? []), row.team_id]);
    }
    return byEvent;
  }
  override get(eventId: string): string[] | undefined {
    return this.snapshot().get(eventId);
  }
  override set(eventId: string, teamIds: string[]): this {
    this.write(eventId, teamIds);
    return this;
  }
  override has(eventId: string): boolean {
    return this.snapshot().has(eventId);
  }
  override delete(eventId: string): boolean {
    const had = this.has(eventId);
    this.write(eventId, []);
    return had;
  }
  override clear(): void {
    for (const eventId of this.snapshot().keys()) this.write(eventId, []);
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
    callback: (value: string[], key: string, map: Map<string, string[]>) => void,
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
  seasons: Map<string, StoredSeason>;
  events: Map<string, StoredEvent>;
  teams: Map<string, StoredTeam>;
  /** The roster's storage: every event_teams row, tombstones included. */
  eventTeams: Map<string, FakeEventTeam>;
  /** A view over `eventTeams` (see RosterView): event id → its live team ids. */
  roster: Map<string, string[]>;
  matches: Map<string, FakeMatchRow>;
  matchTeams: Map<string, FakeMatchTeam>;
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
  const seasons = new Map<string, StoredSeason>();
  const events = new Map<string, StoredEvent>();
  // The unique (season_id, name) constraint on events.
  const assertEventNameFree = (event: StoredEvent): void => {
    for (const other of events.values()) {
      if (
        other.id !== event.id &&
        other.season_id === event.season_id &&
        other.name === event.name
      ) {
        throw pgError('23505', 'events_season_id_name_key');
      }
    }
  };
  // Task 1.19. The teams, the roster (event_teams, with `roster` a view over it), the
  // match slots, and the timestamps the database would put on a match. The timestamps are
  // kept beside `rows.matches` rather than in it, so a test can assert on exactly the
  // columns a use case WROTE (SPEC-FINAL 6.4: a bare match is event, type, number).
  const teams = new Map<string, StoredTeam>();
  const eventTeams = new Map<string, FakeEventTeam>();
  const matchTeams = new Map<string, FakeMatchTeam>();
  const matchStamps = new Map<string, { created_at: string; updated_at: string }>();
  const eventIsReal = (eventId: string): boolean => events.has(eventId) || knownEvents.has(eventId);
  // What Store.setRoster does once its foreign keys pass; the roster view uses it as is.
  const writeRoster = (eventId: string, teamIds: string[], at: string): void => {
    const current = [...eventTeams.values()].filter((r) => r.event_id === eventId);
    const live = new Set(current.filter((r) => r.deleted_at === null).map((r) => r.team_id));
    const wanted = new Set(teamIds);
    for (const teamId of wanted) {
      if (live.has(teamId)) continue;
      const tombstone = current
        .filter((r) => r.team_id === teamId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      if (tombstone) {
        eventTeams.set(tombstone.id, { ...tombstone, deleted_at: null, updated_at: at });
      } else {
        const id = crypto.randomUUID();
        eventTeams.set(id, {
          id,
          event_id: eventId,
          team_id: teamId,
          created_at: at,
          updated_at: at,
          deleted_at: null,
        });
      }
    }
    for (const row of current) {
      if (row.deleted_at === null && !wanted.has(row.team_id)) {
        eventTeams.set(row.id, { ...row, deleted_at: at, updated_at: at });
      }
    }
  };
  const roster = new RosterView(
    (eventId, teamIds) => writeRoster(eventId, teamIds, fake.nowValue.toISOString()),
    eventTeams,
  );
  const toStoredMatch = (row: FakeMatchRow): StoredMatch => {
    const stamps = matchStamps.get(row.id);
    return {
      id: row.id,
      event_id: row.event_id as string,
      match_type: row.match_type as StoredMatch['match_type'],
      number: row.number as number,
      created_at:
        (row.created_at as string | undefined) ?? stamps?.created_at ?? FIXTURE_CREATED_AT,
      updated_at:
        (row.updated_at as string | undefined) ?? stamps?.updated_at ?? FIXTURE_CREATED_AT,
    };
  };
  // The unique (event_id, match_type, number) constraint on matches.
  const assertMatchKeyFree = (match: FakeMatchRow): void => {
    for (const other of rows.matches.values()) {
      if (
        other.id !== match.id &&
        other.event_id === match.event_id &&
        other.match_type === match.match_type &&
        other.number === match.number
      ) {
        throw pgError('23505', 'matches_event_id_match_type_number_key');
      }
    }
  };
  const matchKeyRank = (m: { match_type: string; number: number }): [number, number] => [
    (MATCH_TYPES as readonly string[]).indexOf(m.match_type),
    m.number,
  ];
  const compareMatchKeys = (a: [number, number], b: [number, number]): number =>
    a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];

  // The app_settings singleton: both null on an empty install, as the migration leaves it.
  let activeContext: { active_season_id: string | null; active_event_id: string | null } = {
    active_season_id: null,
    active_event_id: null,
  };

  const fake = {
    // every map from the FakeContext type, constructed empty
    rows,
    users,
    usersById,
    usersByName,
    seasons,
    events,
    teams,
    eventTeams,
    roster,
    matches: rows.matches,
    matchTeams,
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
    // A fixture that writes the singleton directly, as a migration or an admin would. It is
    // not Store.setActiveContext (task 1.18): it validates nothing, so a test can make the
    // singleton name an event that does not exist.
    setActiveContext: (seasonId: string | null, eventId: string | null) => {
      activeContext = { active_season_id: seasonId, active_event_id: eventId };
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

  // RB.20: what delete_event_cascade leaves behind (Store.deleteEvent, and each event of
  // Store.deleteSeason). Entries first, then the event with everything that cascades from it.
  const dropEvent = (id: string): void => {
    const matchIds = new Set(
      [...rows.matches.values()].filter((m) => m.event_id === id).map((m) => m.id),
    );
    for (const [k, row] of rows.scouting_entries) {
      if (row.event_id === id) rows.scouting_entries.delete(k);
    }
    for (const matchId of matchIds) rows.matches.delete(matchId);
    for (const [k, row] of matchTeams) if (matchIds.has(row.match_id)) matchTeams.delete(k);
    for (const [k, row] of eventTeams) if (row.event_id === id) eventTeams.delete(k);
    events.delete(id);
    if (activeContext.active_event_id === id) activeContext.active_event_id = null;
  };

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
    // `knownEvents` is the pull tests' shorthand; an event a use case created is real too.
    async eventExists(eventId) {
      return knownEvents.has(eventId) || events.has(eventId);
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
    async getActiveContext() {
      return { ...activeContext };
    },
    // Task 1.18. Both foreign keys checked, as Postgres does (23503); `knownEvents` counts
    // as an event, so a pull test's shorthand id stays settable.
    async setActiveContext(next) {
      if (next.active_season_id !== null && !seasons.has(next.active_season_id)) {
        throw pgError('23503', 'app_settings_active_season_id_fkey');
      }
      if (
        next.active_event_id !== null &&
        !events.has(next.active_event_id) &&
        !knownEvents.has(next.active_event_id)
      ) {
        throw pgError('23503', 'app_settings_active_event_id_fkey');
      }
      activeContext = { ...next };
      return { ...activeContext };
    },
    async getSeason(id) {
      return seasons.get(id) ?? null;
    },
    async getSeasonByYear(year) {
      return [...seasons.values()].find((s) => s.year === year) ?? null;
    },
    async insertSeason(row) {
      checkColumns('seasons', SEASON_COLUMNS, row);
      const at = fake.nowValue.toISOString();
      const season = { created_at: at, updated_at: at, ...row } as StoredSeason;
      if (seasons.has(season.id)) throw pgError('23505', 'seasons_pkey');
      if ([...seasons.values()].some((s) => s.year === season.year)) {
        throw pgError('23505', 'seasons_year_key');
      }
      seasons.set(season.id, season);
      return season;
    },
    async updateSeason(id, patch) {
      checkColumns('seasons', SEASON_COLUMNS, patch);
      const existing = seasons.get(id);
      if (!existing) throw pgError('PGRST116', 'no season with that id');
      const next = { ...existing, ...patch, updated_at: fake.nowValue.toISOString() };
      if ([...seasons.values()].some((s) => s.id !== id && s.year === next.year)) {
        throw pgError('23505', 'seasons_year_key');
      }
      seasons.set(id, next);
      return next;
    },
    // Newest year first; `year` is unique, so it alone is the keyset.
    async listSeasons(limit, after) {
      return [...seasons.values()]
        .sort((a, b) => b.year - a.year)
        .filter((s) => after === undefined || s.year < after.year)
        .slice(0, limit);
    },
    async getEvent(id) {
      return events.get(id) ?? null;
    },
    async insertEvent(row) {
      checkColumns('events', EVENT_COLUMNS, row);
      const at = fake.nowValue.toISOString();
      const event = { code: null, created_at: at, updated_at: at, ...row } as StoredEvent;
      if (!seasons.has(event.season_id)) throw pgError('23503', 'events_season_id_fkey');
      if (events.has(event.id)) throw pgError('23505', 'events_pkey');
      assertEventNameFree(event);
      events.set(event.id, event);
      return event;
    },
    async updateEvent(id, patch) {
      checkColumns('events', EVENT_COLUMNS, patch);
      const existing = events.get(id);
      if (!existing) throw pgError('PGRST116', 'no event with that id');
      const next = { ...existing, ...patch, updated_at: fake.nowValue.toISOString() };
      if (!seasons.has(next.season_id)) throw pgError('23503', 'events_season_id_fkey');
      assertEventNameFree(next);
      events.set(id, next);
      return next;
    },
    // By sort_order then id; sort_order is not unique, so the id is part of the keyset.
    async listEvents(seasonId, limit, after) {
      const key = (e: { sort_order: number; id: string }): [number, string] => [e.sort_order, e.id];
      const cmp = (a: [number, string], b: [number, string]) =>
        a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
      return [...events.values()]
        .filter((e) => e.season_id === seasonId)
        .sort((a, b) => cmp(key(a), key(b)))
        .filter((e) => after === undefined || cmp(key(e), key(after)) > 0)
        .slice(0, limit);
    },
    async countEntriesBySeason(seasonId) {
      return fake.entryCountsBySeason.get(seasonId) ?? 0;
    },
    // RB.13: live entries per scouter over the season's events, read from `rows` and `events`.
    async countEntriesByScouterForSeason(seasonId) {
      const eventIds = new Set(
        [...events.values()].filter((e) => e.season_id === seasonId).map((e) => e.id),
      );
      const counts = new Map<string, number>();
      for (const row of rows.scouting_entries.values()) {
        if (!eventIds.has(row.event_id as string) || row.deleted_at != null) continue;
        const scouter = row.scouter_id as string;
        counts.set(scouter, (counts.get(scouter) ?? 0) + 1);
      }
      return [...counts].map(([scouter_id, count]) => ({ scouter_id, count }));
    },
    // Task 1.19: teams, the roster, matches and their slots. Every write checks its
    // columns and raises Postgres's own codes, like the season and event writes.
    async getTeam(id) {
      const team = teams.get(id);
      return team ? { ...team } : null;
    },
    async getTeamByNumber(number) {
      const team = [...teams.values()].find((t) => t.number === number);
      return team ? { ...team } : null;
    },
    async insertTeam(row) {
      checkColumns('teams', TEAM_COLUMNS, row);
      const at = fake.nowValue.toISOString();
      const team = { created_at: at, updated_at: at, ...row } as StoredTeam;
      if (teams.has(team.id)) throw pgError('23505', 'teams_pkey');
      if ([...teams.values()].some((t) => t.number === team.number)) {
        throw pgError('23505', 'teams_number_key');
      }
      teams.set(team.id, team);
      return { ...team };
    },
    async updateTeam(id, patch) {
      checkColumns('teams', TEAM_COLUMNS, patch);
      const existing = teams.get(id);
      if (!existing) throw pgError('PGRST116', 'no team with that id');
      const next = { ...existing, ...patch, updated_at: fake.nowValue.toISOString() };
      if ([...teams.values()].some((t) => t.id !== id && t.number === next.number)) {
        throw pgError('23505', 'teams_number_key');
      }
      teams.set(id, next);
      return { ...next };
    },
    // By number. A query matches a number prefix or a case-insensitive name substring,
    // every character literal: what the Supabase store's escaped ilike and prefix ranges
    // compute. `seasonId` is unused, as it is there.
    async listTeams({ query, limit, after }) {
      const q = query?.toLowerCase();
      return [...teams.values()]
        .filter((t) => after === undefined || t.number > after.number)
        .filter(
          (t) =>
            q === undefined ||
            (/^\d+$/.test(q) && String(t.number).startsWith(q)) ||
            t.name.toLowerCase().includes(q),
        )
        .sort((a, b) => a.number - b.number)
        .slice(0, limit)
        .map((t) => ({ ...t }));
    },
    async getRoster(eventId) {
      return [...eventTeams.values()]
        .filter((r) => r.event_id === eventId && r.deleted_at === null)
        .map((r) => teams.get(r.team_id))
        .filter((t): t is StoredTeam => t !== undefined)
        .sort((a, b) => a.number - b.number)
        .map((t) => ({ ...t }));
    },
    // Both foreign keys first (23503), so a refused write changes nothing; then exactly
    // the view's write.
    async setRoster(eventId, teamIds, at) {
      if (!eventIsReal(eventId)) throw pgError('23503', 'event_teams_event_id_fkey');
      if (teamIds.some((id) => !teams.has(id))) {
        throw pgError('23503', 'event_teams_team_id_fkey');
      }
      checkColumns('event_teams', EVENT_TEAM_COLUMNS, { event_id: eventId, deleted_at: at });
      writeRoster(eventId, teamIds, at);
    },
    async findMatch(eventId, matchType, number) {
      const row = [...rows.matches.values()].find(
        (m) => m.event_id === eventId && m.match_type === matchType && m.number === number,
      );
      return row ? toStoredMatch(row) : null;
    },
    async getMatch(id) {
      const row = rows.matches.get(id);
      return row ? toStoredMatch(row) : null;
    },
    // Stores exactly the columns written; the database's timestamps go beside them.
    async insertMatch(row) {
      checkColumns('matches', MATCH_COLUMNS, row);
      const match = { ...row } as FakeMatchRow;
      if (!eventIsReal(String(match.event_id))) throw pgError('23503', 'matches_event_id_fkey');
      if (rows.matches.has(match.id)) throw pgError('23505', 'matches_pkey');
      assertMatchKeyFree(match);
      rows.matches.set(match.id, match);
      const at = fake.nowValue.toISOString();
      matchStamps.set(match.id, { created_at: at, updated_at: at });
      appliedOrder.push(match.id);
      return toStoredMatch(match);
    },
    async updateMatch(id, patch) {
      checkColumns('matches', MATCH_COLUMNS, patch);
      const existing = rows.matches.get(id);
      if (!existing) throw pgError('PGRST116', 'no match with that id');
      const next = { ...existing, ...patch } as FakeMatchRow;
      if (!eventIsReal(String(next.event_id))) throw pgError('23503', 'matches_event_id_fkey');
      assertMatchKeyFree(next);
      rows.matches.set(id, next);
      const created = matchStamps.get(id)?.created_at ?? FIXTURE_CREATED_AT;
      matchStamps.set(id, { created_at: created, updated_at: fake.nowValue.toISOString() });
      return toStoredMatch(next);
    },
    // Practice, qualification, playoff, then by number; (type, number) is the keyset.
    async listMatches(eventId, limit, after) {
      return [...rows.matches.values()]
        .map(toStoredMatch)
        .filter((m) => m.event_id === eventId)
        .sort((a, b) => compareMatchKeys(matchKeyRank(a), matchKeyRank(b)))
        .filter(
          (m) => after === undefined || compareMatchKeys(matchKeyRank(m), matchKeyRank(after)) > 0,
        )
        .slice(0, limit);
    },
    async listMatchSlots(matchIds) {
      const wanted = new Set(matchIds);
      return [...matchTeams.values()]
        .filter((s) => wanted.has(s.match_id))
        .map((s) => ({
          match_id: s.match_id,
          alliance: s.alliance,
          station: s.station,
          team_id: s.team_id,
        }));
    },
    // The foreign keys first; then a cleared slot is deleted, a changed one updated in
    // place (same row id), a new one inserted, and an unchanged one left alone.
    async setMatchTeams(matchId, slots) {
      if (!rows.matches.has(matchId)) throw pgError('23503', 'match_teams_match_id_fkey');
      if (slots.some((s) => !teams.has(s.team_id))) {
        throw pgError('23503', 'match_teams_team_id_fkey');
      }
      for (const slot of slots) checkColumns('match_teams', MATCH_TEAM_COLUMNS, slot);
      const at = fake.nowValue.toISOString();
      const key = (s: { alliance: string; station: number }) =>
        `${matchId}:${s.alliance}:${s.station}`;
      const wanted = new Map(slots.map((s) => [key(s), s]));
      for (const [k, row] of matchTeams) {
        if (row.match_id === matchId && !wanted.has(k)) matchTeams.delete(k);
      }
      for (const [k, slot] of wanted) {
        const existing = matchTeams.get(k);
        if (existing && existing.team_id === slot.team_id) continue;
        matchTeams.set(
          k,
          existing
            ? { ...existing, team_id: slot.team_id, updated_at: at }
            : {
                id: crypto.randomUUID(),
                match_id: matchId,
                alliance: slot.alliance,
                station: slot.station,
                team_id: slot.team_id,
                created_at: at,
                updated_at: at,
              },
        );
      }
    },
    async countEntriesByMatch(matchId) {
      return fake.entryCountsByMatch.get(matchId) ?? 0;
    },
    // `entryCountsByMatch` stands for the entries: scouting_entries.match_id is
    // `on delete restrict`, so any of them refuses the delete (23503). The slots cascade.
    async deleteMatch(id) {
      if ((fake.entryCountsByMatch.get(id) ?? 0) > 0) {
        throw pgError('23503', 'scouting_entries_match_id_fkey');
      }
      rows.matches.delete(id);
      matchStamps.delete(id);
      for (const [k, row] of matchTeams) {
        if (row.match_id === id) matchTeams.delete(k);
      }
    },
    // RB.20: the two cascade functions (see dropEvent). A season's forms cascade with it;
    // the singleton's ids are ON DELETE SET NULL.
    async deleteEvent(id) {
      dropEvent(id);
    },
    async deleteSeason(id) {
      for (const event of [...events.values()]) {
        if (event.season_id === id) dropEvent(event.id);
      }
      for (const [k, form] of fake.forms) if (form.season_id === id) fake.forms.delete(k);
      seasons.delete(id);
      if (activeContext.active_season_id === id) activeContext.active_season_id = null;
    },
    async countDeleteImpact(kind, id) {
      const eventIds = new Set(
        kind === 'event'
          ? [id]
          : [...events.values()].filter((e) => e.season_id === id).map((e) => e.id),
      );
      const inScope = (row: Record<string, unknown>) => eventIds.has(row.event_id as string);
      return {
        events: eventIds.size,
        matches: [...rows.matches.values()].filter(inScope).length,
        entries: [...rows.scouting_entries.values()].filter(
          (row) => inScope(row) && row.deleted_at == null,
        ).length,
        forms:
          kind === 'season' ? [...fake.forms.values()].filter((f) => f.season_id === id).length : 0,
      };
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
      'deleteFormCascade',
      'deleteFormVersion',
    ]),
  } as Store;

  return Object.assign(fake, {
    // the clock is read through the object, so a test can move it
    now: () => fake.nowValue,
    store,
  });
}

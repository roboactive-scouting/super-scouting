import type { FormFieldDefinition } from '@frc/shared';
import type { Store, StoredFullUser, StoredUser, UseCaseContext } from '../core/context.js';
import { stubsFor } from '../repos/store.js';

export type FakeRow = Record<string, unknown> & { id: string; version: number };

/**
 * Every map the phase-1 tests use, declared once. Later tasks add rows to these maps
 * and implement the Store methods that read them; none of them adds a field.
 */
export type FakeContext = UseCaseContext & {
  rows: { scouting_entries: Map<string, FakeRow>; matches: Map<string, FakeRow> };
  users: Map<string, StoredUser>;
  usersById: Map<string, StoredFullUser>;
  usersByName: Map<string, StoredFullUser>;
  seasons: Map<string, FakeRow>;
  events: Map<string, FakeRow>;
  teams: Map<string, FakeRow>;
  eventTeams: Map<string, FakeRow>;
  roster: Map<string, string[]>;
  matches: Map<string, FakeRow>;
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
    matches: new Map<string, FakeRow>(),
  };
  const users = new Map([
    ['u-scouter', { id: 'u-scouter', role: 'scouter' as const, disabled_at: null }],
    ['u-lead', { id: 'u-lead', role: 'lead' as const, disabled_at: null }],
  ]);
  const ops = new Set<string>();
  const appliedOrder: string[] = [];
  const pullRows = new Map<string, Record<string, unknown>[]>();
  const knownEvents = new Set(['ev-1']);

  const fake = {
    // every map from the FakeContext type, constructed empty
    rows,
    users,
    usersById: new Map(),
    usersByName: new Map(),
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
  // stubsFor's spread only carries an index signature, not the 59 named methods it
  // supplies at runtime.
  const store = {
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async wasApplied(opId) {
      return ops.has(opId);
    },
    async markApplied(opId) {
      ops.add(opId);
    },
    async getRow(entity, id) {
      const table = entity === 'match' ? rows.matches : rows.scouting_entries;
      return table.get(id) ?? null;
    },
    async putRow(entity, id, row) {
      const table = entity === 'match' ? rows.matches : rows.scouting_entries;
      table.set(id, row as FakeRow);
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
      'getUserByUsername',
      'insertUser',
      'updateUser',
      'listUsers',
      'countEnabledAdmins',
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

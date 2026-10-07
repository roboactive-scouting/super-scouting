import type { FormFieldDefinition, MatchSlot, MatchType, SyncEntity } from '@frc/shared';

export type StoredUser = {
  id: string;
  role: 'scouter' | 'lead' | 'admin';
  disabled_at: string | null;
};

export type StoredFullUser = StoredUser & {
  username: string;
  full_name: string;
  password_hash: string;
  must_change_password: boolean;
  created_at: string;
};

/** A user with no `password_hash`: what `listUsers` selects, by an explicit column list. */
export type StoredPublicUser = Omit<StoredFullUser, 'password_hash'>;

export type StoredRow = Record<string, unknown> & { id: string; version: number };

/**
 * A `seasons` row (migration 20260903090000_skeleton.sql). Not a StoredRow: seasons are
 * not synced and carry no `version` column.
 */
export type StoredSeason = {
  id: string;
  year: number;
  game_name: string;
  field_image_path: string;
  created_at: string;
  updated_at: string;
};

/** An `events` row (same migration). Unversioned, like seasons. */
export type StoredEvent = {
  id: string;
  season_id: string;
  name: string;
  code: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** A `teams` row (skeleton migration). Unversioned; the number is global and permanent. */
export type StoredTeam = {
  id: string;
  number: number;
  name: string;
  created_at: string;
  updated_at: string;
};

/**
 * A `matches` row, by an explicit column list: the reserved official-result columns are
 * never read in v1 (SPEC-FINAL 3.1). Unversioned (SPEC-FINAL 6.4).
 */
export type StoredMatch = {
  id: string;
  event_id: string;
  match_type: MatchType;
  number: number;
  created_at: string;
  updated_at: string;
};

/** One filled `match_teams` slot, as the match use cases read it. */
export type StoredMatchSlot = MatchSlot & { match_id: string };

/** The listMatches keyset: (event_id, match_type, number) is unique, so this is exact. */
export type MatchKeyset = { match_type: MatchType; number: number };

export type PullScope = { eventId: string; seasonId: string };

export type PullEntitySource = (
  key: string,
  scope: PullScope,
  since: string | undefined,
  offset: number,
  limit: number,
) => Promise<Record<string, unknown>[]>;

/**
 * The persistence surface the use cases talk to. One implementation over Supabase
 * (`repos/store.ts`), one in-memory for tests (`test/fake-context.ts`). Use cases
 * never import supabase-js.
 *
 * THE WHOLE PHASE-1 INTERFACE IS DECLARED HERE, IN ONE PLACE, ON PURPOSE. If it grew
 * a method per task, every task that widened it would break the Supabase
 * implementation and the fake at the same moment. Instead: the shape is fixed now,
 * both implementations start as stubs that throw `not implemented`, and each later
 * task fills in the two methods it needs and deletes those two stubs. A task that
 * wants a method not on this list is a task that has drifted from the plan.
 */
export type Store = {
  // sync (task 1.3, 1.4, 1.40)
  wasApplied(opId: string): Promise<boolean>;
  markApplied(opId: string): Promise<void>;
  getRow(entity: SyncEntity, id: string): Promise<StoredRow | null>;
  putRow(entity: SyncEntity, id: string, row: Record<string, unknown>): Promise<void>;
  findByLogicalKey(key: string): Promise<StoredRow | null>;
  parentsExist(parents: {
    event_id: string;
    match_id: string | null;
    form_version_id: string;
  }): Promise<boolean>;
  insertConflict(row: Record<string, unknown>): Promise<void>;
  listConflicts(eventId: string, limit: number, cursor?: string): Promise<StoredRow[]>;
  getConflict(id: string): Promise<StoredRow | null>;
  resolveConflictRow(id: string, resolvedBy: string, at: string): Promise<void>;

  // pull (task 1.4)
  eventExists(eventId: string): Promise<boolean>;
  resolveScope(eventId: string): Promise<PullScope>;
  pullEntity: PullEntitySource;

  // users (tasks 1.3, 1.11, 1.12, 1.13)
  getUser(id: string): Promise<StoredUser | null>;
  /** By id, never by username: a rename must not move a session to another person (1.12). */
  getFullUser(id: string): Promise<StoredFullUser | null>;
  getUserByUsername(usernameLower: string): Promise<StoredFullUser | null>;
  /**
   * Both write methods throw an error whose `code` is Postgres's own. A unique violation
   * on `lower(username)` is `'23505'`, which the use case turns into a `conflict`.
   */
  insertUser(row: Record<string, unknown>): Promise<StoredFullUser>;
  updateUser(id: string, patch: Record<string, unknown>): Promise<StoredFullUser>;
  /**
   * Ordered by username then id; `after` is the last row of the previous page (keyset).
   * Never selects `password_hash` (SPEC-FINAL 18.5, Appendix C).
   */
  listUsers(options: {
    includeDisabled: boolean;
    limit: number;
    after?: { username: string; id: string };
  }): Promise<StoredPublicUser[]>;
  countEnabledAdmins(): Promise<number>;

  // context, seasons, events (task 1.18)
  getActiveContext(): Promise<{ active_season_id: string | null; active_event_id: string | null }>;
  setActiveContext(next: {
    active_season_id: string | null;
    active_event_id: string | null;
  }): Promise<{
    active_season_id: string | null;
    active_event_id: string | null;
  }>;
  getSeason(id: string): Promise<StoredSeason | null>;
  getSeasonByYear(year: number): Promise<StoredSeason | null>;
  /**
   * The season and event writes throw an error whose `code` is Postgres's own, like the
   * user writes: '23505' on a duplicate year or a duplicate event name in a season,
   * '23503' when an event names a season that no longer exists.
   */
  insertSeason(row: Record<string, unknown>): Promise<StoredSeason>;
  updateSeason(id: string, patch: Record<string, unknown>): Promise<StoredSeason>;
  /** Newest year first; `after` is the last row of the previous page (keyset, as listUsers). */
  listSeasons(limit: number, after?: { year: number }): Promise<StoredSeason[]>;
  getEvent(id: string): Promise<StoredEvent | null>;
  insertEvent(row: Record<string, unknown>): Promise<StoredEvent>;
  updateEvent(id: string, patch: Record<string, unknown>): Promise<StoredEvent>;
  /** By sort_order then id; `after` is the last row of the previous page (keyset). */
  listEvents(
    seasonId: string,
    limit: number,
    after?: { sort_order: number; id: string },
  ): Promise<StoredEvent[]>;

  // teams, roster, matches (task 1.19)
  /**
   * The team, roster and match writes throw an error whose `code` is Postgres's own, like
   * the season writes: '23505' on a duplicate team number or a duplicate (event, type,
   * number); '23503' when a row names an event, match or team that no longer exists, and
   * when deleteMatch meets an entry (`scouting_entries.match_id` is `on delete restrict`).
   */
  getTeam(id: string): Promise<StoredTeam | null>;
  getTeamByNumber(number: number): Promise<StoredTeam | null>;
  insertTeam(row: Record<string, unknown>): Promise<StoredTeam>;
  updateTeam(id: string, patch: Record<string, unknown>): Promise<StoredTeam>;
  /**
   * By number; `after` is the last row of the previous page (keyset). `query` matches a
   * number prefix or a case-insensitive name substring, every character literal.
   * `seasonId` is declared for a season-scoped search and unused in v1 (task 1.19).
   */
  listTeams(options: {
    seasonId?: string;
    query?: string;
    limit: number;
    after?: { number: number };
  }): Promise<StoredTeam[]>;
  /** The teams on the event's LIVE roster (`deleted_at is null`), by number. */
  getRoster(eventId: string): Promise<StoredTeam[]>;
  /**
   * Makes `teamIds` the event's live roster. A removal is a soft delete (`deleted_at =
   * at`); a team added back revives its newest tombstone rather than inserting a second
   * row; a row that does not change is not written.
   */
  setRoster(eventId: string, teamIds: string[], at: string): Promise<void>;
  findMatch(eventId: string, matchType: MatchType, number: number): Promise<StoredMatch | null>;
  getMatch(id: string): Promise<StoredMatch | null>;
  insertMatch(row: Record<string, unknown>): Promise<StoredMatch>;
  /** An admin correction of match_type and/or number. Never putRow: that is sync's path. */
  updateMatch(id: string, patch: Record<string, unknown>): Promise<StoredMatch>;
  /** Practice, qualification, playoff, then by number; `after` is the keyset. */
  listMatches(eventId: string, limit: number, after?: MatchKeyset): Promise<StoredMatch[]>;
  /** The filled slots of the given matches (at most six each), in no particular order. */
  listMatchSlots(matchIds: string[]): Promise<StoredMatchSlot[]>;
  /**
   * Makes `slots` the match's filled slots: an omitted slot is deleted, a slot whose team
   * changed is updated in place, a new slot is inserted, an unchanged one is not written.
   */
  setMatchTeams(matchId: string, slots: MatchSlot[]): Promise<void>;
  /** Every entry of the match, soft-deleted ones included: the foreign key counts them. */
  countEntriesByMatch(matchId: string): Promise<number>;
  /** Every entry of every event in the season, soft-deleted ones included (task 1.18). */
  countEntriesBySeason(seasonId: string): Promise<number>;
  /** Live (not soft-deleted) entries per scouter across the season's events (RB.13). */
  countEntriesByScouterForSeason(
    seasonId: string,
  ): Promise<{ scouter_id: string; count: number }[]>;
  /** A hard delete; its match_teams go with it (`on delete cascade`). '23503' on entries. */
  deleteMatch(id: string): Promise<void>;

  // forms and scoring (tasks 1.27, 1.28)
  getForm(id: string): Promise<StoredRow | null>;
  getFormByKind(seasonId: string, kind: 'match' | 'super'): Promise<StoredRow | null>;
  insertForm(row: Record<string, unknown>): Promise<StoredRow>;
  updateForm(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  getFormVersion(id: string): Promise<StoredRow | null>;
  listFormVersions(formId: string): Promise<StoredRow[]>;
  insertFormVersion(row: Record<string, unknown>): Promise<StoredRow>;
  updateFormVersion(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  countEntriesByFormVersion(formVersionId: string): Promise<number>;
  getFormFields(formVersionId: string): Promise<FormFieldDefinition[]>;
  replaceFormFields(formVersionId: string, fields: Record<string, unknown>[]): Promise<void>;
  getScoringRules(formId: string): Promise<StoredRow[]>;
  replaceScoringRules(formId: string, rules: Record<string, unknown>[]): Promise<void>;

  // reads for browse, search and statistics (tasks 1.50, 1.57)
  getEntry(id: string): Promise<StoredRow | null>;
  queryEntries(options: {
    eventId: string;
    formKind?: 'match' | 'super';
    query?: string;
    limit: number;
    cursor?: string;
  }): Promise<StoredRow[]>;
  entriesForScope(scope: { eventIds: string[]; teamId?: string }): Promise<StoredRow[]>;
  listTeamEvents(teamId: string): Promise<StoredRow[]>;

  // deletes (task 1.60)
  deleteSeason(id: string): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  deleteFormCascade(id: string): Promise<void>;
  deleteFormVersion(id: string): Promise<void>;
  countDeleteImpact(kind: 'season' | 'event' | 'form', id: string): Promise<Record<string, number>>;
};

export type UseCaseContext = {
  store: Store;
  now: () => Date;
};

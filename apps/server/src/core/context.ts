import type { FormFieldDefinition, SyncEntity } from '@frc/shared';

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
  getSeason(id: string): Promise<StoredRow | null>;
  getSeasonByYear(year: number): Promise<StoredRow | null>;
  insertSeason(row: Record<string, unknown>): Promise<StoredRow>;
  updateSeason(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listSeasons(limit: number, cursor?: string): Promise<StoredRow[]>;
  getEvent(id: string): Promise<StoredRow | null>;
  insertEvent(row: Record<string, unknown>): Promise<StoredRow>;
  updateEvent(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listEvents(seasonId: string, limit: number, cursor?: string): Promise<StoredRow[]>;

  // teams, roster, matches (task 1.19)
  getTeam(id: string): Promise<StoredRow | null>;
  getTeamByNumber(number: number): Promise<StoredRow | null>;
  insertTeam(row: Record<string, unknown>): Promise<StoredRow>;
  updateTeam(id: string, patch: Record<string, unknown>): Promise<StoredRow>;
  listTeams(options: {
    seasonId?: string;
    query?: string;
    limit: number;
    cursor?: string;
  }): Promise<StoredRow[]>;
  getRoster(eventId: string): Promise<StoredRow[]>;
  setRoster(eventId: string, teamIds: string[], at: string): Promise<void>;
  findMatch(eventId: string, matchType: string, number: number): Promise<StoredRow | null>;
  insertMatch(row: Record<string, unknown>): Promise<StoredRow>;
  listMatches(eventId: string, limit: number, cursor?: string): Promise<StoredRow[]>;
  setMatchTeams(matchId: string, slots: Record<string, unknown>[]): Promise<void>;
  countEntriesByMatch(matchId: string): Promise<number>;
  countEntriesBySeason(seasonId: string): Promise<number>;
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

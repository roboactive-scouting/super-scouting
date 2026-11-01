import {
  AppError,
  assertCan,
  getDeleteImpactInput,
  matchLabel,
  SWITCH_EVENT_FIRST,
  SWITCH_SEASON_FIRST,
  type Caller,
  type DeleteBlockedReason,
  type DeleteImpactStation,
  type DeleteKind,
  type GetDeleteImpactInput,
  type GetDeleteImpactOutput,
} from '@frc/shared';
import type { EntryTally, UseCaseContext } from '../context.js';
import { eventIsDefault, seasonIsActive, seasonName } from '../commands/deleteCompetition.js';
import {
  formOrNotFound,
  versionDeleteBlock,
  versionName,
  versionOrNotFound,
  type VersionDeleteBlock,
} from '../commands/forms.js';
import { parseInput } from '../commands/users.js';
import { matchOrNotFound } from '../matchRows.js';
import { allEventsOf, eventOrNotFound, seasonOrNotFound } from '../seasonRows.js';

// The wire schemas live in packages/shared (SPEC-FINAL 16.1); re-exported for callers here.
export {
  getDeleteImpactInput,
  getDeleteImpactOutput,
  type GetDeleteImpactInput,
  type GetDeleteImpactOutput,
} from '@frc/shared';

const NO_ENTRIES: EntryTally = { entries: 0, deleted_entries: 0, super_entries: 0 };

/** Every count 0, nothing blocked, nothing typed: each kind fills in what applies to it. */
function blank(kind: DeleteKind, id: string, name: string): GetDeleteImpactOutput {
  return {
    kind,
    id,
    name,
    confirm_name: null,
    blocked_reason: null,
    blocked_message: null,
    events: 0,
    event_names: [],
    matches: 0,
    entries: 0,
    match_entries: 0,
    super_entries: 0,
    deleted_entries: 0,
    forms: 0,
    form_versions: 0,
    metrics: 0,
    dashboards: 0,
    weight_presets: 0,
    stations: null,
    last_saved_at: null,
  };
}

const tallied = (t: EntryTally) => ({
  entries: t.entries,
  match_entries: t.entries - t.super_entries,
  super_entries: t.super_entries,
  deleted_entries: t.deleted_entries,
});

const VERSION_REASON: Record<VersionDeleteBlock['reason'], DeleteBlockedReason> = {
  'has-entries': 'version_has_entries',
  published: 'version_published',
  'active-version': 'version_active',
};

/** A cascade's face: blocked (nothing to type), or the name to type back exactly. */
function gate(
  name: string,
  blocked: { reason: DeleteBlockedReason; message: string } | null,
): Pick<GetDeleteImpactOutput, 'confirm_name' | 'blocked_reason' | 'blocked_message'> {
  return blocked
    ? { confirm_name: null, blocked_reason: blocked.reason, blocked_message: blocked.message }
    : { confirm_name: name, blocked_reason: null, blocked_message: null };
}

/**
 * SPEC-FINAL 3.9, 17.8 (task 1.60): the exact damage a delete would do, counted on the
 * server just now, and which face the one DeleteDialog opens — Blocked (`blocked_reason`),
 * Bill + type (`confirm_name`), or Are you sure? (neither). It reads only; nothing is
 * deleted. The refusals it predicts are the delete use cases' own rules, shared with them
 * (seasonIsActive, eventIsDefault, versionDeleteBlock), so the dialog and the server cannot
 * disagree.
 *
 * Admin only (`delete_objects`) for every kind but `entry`, which a lead may ask too: a lead
 * soft-deletes entries (7.6). Never a scouter, never a service caller: this is the first
 * step of a command, not a read of the data.
 */
export async function getDeleteImpact(
  caller: Caller,
  input: GetDeleteImpactInput,
  ctx: UseCaseContext,
): Promise<GetDeleteImpactOutput> {
  assertCan(caller, 'manage_entries');
  const { kind, id } = parseInput(getDeleteImpactInput, input);
  if (kind !== 'entry') assertCan(caller, 'delete_objects');
  switch (kind) {
    case 'season':
      return seasonImpact(ctx, id);
    case 'event':
      return eventImpact(ctx, id);
    case 'form':
      return formImpact(ctx, id);
    case 'form_version':
      return versionImpact(ctx, id);
    case 'match':
      return matchImpact(ctx, id);
    case 'entry':
      return entryImpact(ctx, id);
  }
}

async function seasonImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const season = await seasonOrNotFound(ctx, id);
  const name = seasonName(season);
  const events = await allEventsOf(ctx, season.id);
  const eventIds = events.map((e) => e.id);
  // forms is unique (season_id, kind): a season holds at most a match and a super form.
  const forms = (
    await Promise.all([
      ctx.store.getFormByKind(season.id, 'match'),
      ctx.store.getFormByKind(season.id, 'super'),
    ])
  ).filter((f) => f !== null);
  let formVersions = 0;
  for (const form of forms) formVersions += (await ctx.store.listFormVersions(form.id)).length;
  const blocked = (await seasonIsActive(ctx, season))
    ? { reason: 'active_season' as const, message: SWITCH_SEASON_FIRST }
    : null;
  return {
    ...blank('season', season.id, name),
    ...gate(name, blocked),
    events: events.length,
    event_names: events.map((e) => e.name),
    matches: await ctx.store.countMatchesOfEvents(eventIds),
    ...tallied(eventIds.length > 0 ? await ctx.store.tallyEntries({ eventIds }) : NO_ENTRIES),
    forms: forms.length,
    form_versions: formVersions,
    ...(await ctx.store.countAnalysisRows({ seasonId: season.id })),
  };
}

async function eventImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const event = await eventOrNotFound(ctx, id);
  const blocked = (await eventIsDefault(ctx, event))
    ? { reason: 'default_event' as const, message: SWITCH_EVENT_FIRST }
    : null;
  return {
    ...blank('event', event.id, event.name),
    ...gate(event.name, blocked),
    events: 1,
    event_names: [event.name],
    matches: await ctx.store.countMatchesOfEvents([event.id]),
    ...tallied(await ctx.store.tallyEntries({ eventIds: [event.id] })),
  };
}

async function formImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const form = await formOrNotFound(ctx, id);
  const versions = await ctx.store.listFormVersions(form.id);
  const formVersionIds = versions.map((v) => v.id);
  const analysis = await ctx.store.countAnalysisRows({ formId: form.id });
  return {
    ...blank('form', form.id, form.name),
    ...gate(form.name, null),
    ...tallied(
      formVersionIds.length > 0 ? await ctx.store.tallyEntries({ formVersionIds }) : NO_ENTRIES,
    ),
    forms: 1,
    form_versions: versions.length,
    metrics: analysis.metrics,
  };
}

async function versionImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const version = await versionOrNotFound(ctx, id);
  const form = await formOrNotFound(ctx, version.form_id);
  const name = versionName(version);
  const block = await versionDeleteBlock(ctx, version, form);
  return {
    ...blank('form_version', version.id, name),
    ...gate(name, block ? { reason: VERSION_REASON[block.reason], message: block.message } : null),
    ...tallied(await ctx.store.tallyEntries({ formVersionIds: [version.id] })),
    form_versions: 1,
  };
}

const STATIONS = [
  ['red', 1],
  ['red', 2],
  ['red', 3],
  ['blue', 1],
  ['blue', 2],
  ['blue', 3],
] as const;

/**
 * A match with entries is a Choice, then a Bill + type for the cascade (`with_entries`), so
 * `confirm_name` is its label; a match with none is Are you sure? (`confirm_name` null).
 * Soft-deleted entries count: their rows still hold the `on delete restrict` key.
 */
async function matchImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const match = await matchOrNotFound(ctx, id);
  const name = matchLabel(match);
  const [entries, slots] = await Promise.all([
    ctx.store.listMatchEntries(match.id),
    ctx.store.listMatchSlots([match.id]),
  ]);
  const teams = new Map(
    (await ctx.store.getTeamsByIds([...new Set(slots.map((s) => s.team_id))])).map((t) => [
      t.id,
      t.number,
    ]),
  );
  const stations: DeleteImpactStation[] = STATIONS.map(([alliance, station]) => {
    const slot = slots.find((s) => s.alliance === alliance && s.station === station);
    return {
      alliance,
      station,
      team_number: slot ? (teams.get(slot.team_id) ?? null) : null,
      entries: slot ? entries.filter((e) => e.team_id === slot.team_id).length : 0,
    };
  });
  const superEntries = entries.filter((e) => e.form_kind === 'super').length;
  const newest = entries
    .map((e) => e.client_updated_at)
    .reduce<string | null>(
      (latest, at) => (latest === null || Date.parse(at) > Date.parse(latest) ? at : latest),
      null,
    );
  return {
    ...blank('match', match.id, name),
    confirm_name: entries.length > 0 ? name : null,
    matches: 1,
    entries: entries.length,
    match_entries: entries.length - superEntries,
    super_entries: superEntries,
    deleted_entries: entries.filter((e) => e.deleted_at !== null).length,
    stations,
    last_saved_at: newest,
  };
}

/** One live entry: Are you sure?, nothing typed. A soft-deleted one is already gone. */
async function entryImpact(ctx: UseCaseContext, id: string): Promise<GetDeleteImpactOutput> {
  const entry = await ctx.store.getEntry(id);
  if (!entry || entry.deleted_at != null) {
    throw new AppError('not-found', 'that entry does not exist; it may have been deleted', {
      entry_id: id,
    });
  }
  const [match, team] = await Promise.all([
    typeof entry.match_id === 'string' ? ctx.store.getMatch(entry.match_id) : null,
    ctx.store.getTeam(String(entry.team_id)),
  ]);
  const teamNumber = team ? String(team.number) : '';
  const name = match ? `${matchLabel(match)} · ${teamNumber}` : teamNumber;
  const isSuper = entry.form_kind === 'super';
  return {
    ...blank('entry', entry.id, name),
    entries: 1,
    match_entries: isSuper ? 0 : 1,
    super_entries: isSuper ? 1 : 0,
  };
}

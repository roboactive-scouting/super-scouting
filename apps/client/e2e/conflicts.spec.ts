import { expect, test, type Page } from '@playwright/test';
import {
  listConflictsOutput,
  type ConflictItem,
  type ListConflictsOutput,
  type SettledConflict,
} from '@frc/shared';
import { goOffline, signIn, type Role } from './api-mock';
import { EVENT_ID, FIXTURE, FORM, matchId, teamId, userByName } from './fixtures';
import { shoot } from './shoot';

/**
 * The conflict review worklist (18-conflicts final, variant C; SPEC-FINAL 9.5, 9.6, task 1.44).
 * The design's three conflicts — Q2 2096 edited on two phones, Q4 1690 scouted twice, and a super
 * entry for 4338 edited on two phones — reach the device the way a pull delivers them (the
 * `sync_conflicts` rows and the entries they name), and `listConflicts` answers with the same
 * conflicts in the server's shape, so the online queue and the offline one are the same cards.
 */

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const id = (n: number) => `0000000c-0000-4000-8000-${String(n).padStart(12, '0')}`;

const PEOPLE = {
  dana: { id: id(1), full_name: 'Dana Levi' },
  noaC: { id: id(2), full_name: 'Noa Cohen' },
  yael: { id: userByName('yael.s').id, full_name: 'Yael Shapira' },
  omer: { id: userByName('omer.k').id, full_name: 'Omer Katz' },
  tamar: { id: userByName('tamar.m').id, full_name: 'Tamar Mizrahi' },
  amit: { id: userByName('amit.bd').id, full_name: 'Amit Ben-David' },
};
const LEAD = { id: userByName('noa.levi').id, full_name: 'Noa Levi' };

const SUPER_VERSION = id(10);
const SUPER_FIELDS = [
  ['drive', 'Drive', 'single_select'],
  ['strengths', 'Strengths', 'long_text'],
  ['concerns', 'Concerns', 'long_text'],
].map(([key, label, type], i) => ({
  id: id(11 + i),
  form_version_id: SUPER_VERSION,
  key,
  label,
  help_text: null,
  type,
  section: null,
  display_order: i + 1,
  required: false,
  default_value: null,
  config:
    type === 'single_select'
      ? {
          options: [
            { value: 'swerve', label: 'Swerve' },
            { value: 'tank', label: 'Tank' },
          ],
        }
      : {},
  visibility_condition: null,
  deprecated: false,
  description: `${label} (fixture)`,
  unit: type === 'single_select' ? 'enum' : 'text',
  phase: 'post_match',
  direction: 'neutral',
  category: null,
  expected_range: null,
  include_in_ai_context: null,
  is_ordinal: null,
  created_at: '2026-01-10T08:00:00.000Z',
  updated_at: '2026-01-10T08:00:00.000Z',
}));

type Entry = {
  id: string;
  team: number;
  match: number | null;
  alliance: 'red' | 'blue' | null;
  by: { id: string; full_name: string };
  saved: string;
  status: string | null;
  breakdown?: number | null;
  data: Record<string, unknown>;
};

/** Q2's line-up has 2096 at Red 2; Q4's has 1690 at Blue 2 (fixtures.ts). */
function entries() {
  const live: Entry = {
    id: id(20),
    team: 2096,
    match: 2,
    alliance: 'red',
    by: PEOPLE.dana,
    saved: ago(14),
    status: 'played',
    data: {
      auto_notes: 3,
      auto_left_zone: true,
      teleop_notes: 7,
      endgame_climb: 'high',
      notes: 'Left the line late',
    },
  };
  const a: Entry = {
    id: id(21),
    team: 1690,
    match: 4,
    alliance: 'blue',
    by: PEOPLE.omer,
    saved: ago(9),
    status: 'broke_down',
    breakdown: 70,
    data: {
      auto_notes: 2,
      auto_left_zone: true,
      teleop_notes: 3,
      endgame_climb: 'low',
      notes: 'Stopped at 1:10',
    },
  };
  const b: Entry = {
    ...a,
    id: id(22),
    by: PEOPLE.yael,
    saved: ago(11),
    status: 'played',
    breakdown: null,
    data: { ...a.data, teleop_notes: 5, notes: '' },
  };
  const sup: Entry = {
    id: id(23),
    team: 4338,
    match: null,
    alliance: null,
    by: PEOPLE.tamar,
    saved: ago(5),
    status: null,
    data: {
      drive: 'swerve',
      strengths: 'Fast intake, good driver',
      concerns: 'Climb fails under defense',
    },
  };
  return { live, a, b, sup };
}

const SUPERSEDED_Q2 = {
  form_version_id: FORM.version_id,
  robot_status: 'played',
  breakdown_seconds: null,
  data: {
    auto_notes: 4,
    auto_left_zone: true,
    teleop_notes: 7,
    endgame_climb: 'low',
    notes: 'Missed the first shot',
  },
};
const SUPERSEDED_SUPER = {
  form_version_id: SUPER_VERSION,
  robot_status: null,
  breakdown_seconds: null,
  data: { drive: 'swerve', strengths: 'Fast intake', concerns: '' },
};

const row = (e: Entry) => ({
  id: e.id,
  form_version_id: e.match === null ? SUPER_VERSION : FORM.version_id,
  form_kind: e.match === null ? 'super' : 'match',
  event_id: EVENT_ID,
  match_id: e.match === null ? null : matchId(e.match),
  team_id: teamId(e.team),
  alliance: e.alliance,
  scouter_id: e.by.id,
  robot_status: e.status,
  breakdown_seconds: e.breakdown ?? null,
  data: e.data,
  version: 2,
  created_at: e.saved,
  updated_at: e.saved,
  client_created_at: e.saved,
  client_updated_at: e.saved,
  deleted_at: null,
});

/** The `sync_conflicts` rows a pull delivers (SPEC-FINAL 3.6). */
function conflictRows() {
  const { live, a, b, sup } = entries();
  const base = {
    event_id: EVENT_ID,
    entity: 'scouting_entry',
    resolved_at: null,
    resolved_by: null,
    resolution: null,
    updated_at: ago(4),
  };
  return [
    {
      ...base,
      id: id(30),
      kind: 'divergence',
      row_id: live.id,
      duplicate_row_id: null,
      superseded_payload: SUPERSEDED_Q2,
      superseded_author_id: PEOPLE.noaC.id,
      superseded_client_updated_at: ago(16),
      base_version: 1,
      created_at: ago(13),
    },
    {
      ...base,
      id: id(31),
      kind: 'duplicate',
      row_id: a.id,
      duplicate_row_id: b.id,
      superseded_payload: null,
      superseded_author_id: null,
      superseded_client_updated_at: null,
      base_version: null,
      created_at: ago(8),
    },
    {
      ...base,
      id: id(32),
      kind: 'divergence',
      row_id: sup.id,
      duplicate_row_id: null,
      superseded_payload: SUPERSEDED_SUPER,
      superseded_author_id: PEOPLE.amit.id,
      superseded_client_updated_at: ago(9),
      base_version: 1,
      created_at: ago(4),
    },
  ];
}

/**
 * The fixture's pull, plus the conflicts, the entries they name, two more people and a super form.
 * `settled`: as a pull after the lead settled all three — the conflicts resolved, Yael's copy of
 * the duplicate soft-deleted.
 */
function pullWith(state: 'open' | 'settled') {
  const e = FIXTURE.pull.entities;
  const { live, a, b, sup } = entries();
  const settled = state === 'settled';
  const resolutions = [{ keep: 'live' }, { keep_row_id: a.id }, { keep: 'live' }];
  return {
    ...FIXTURE.pull,
    entities: {
      ...e,
      users: [
        ...e.users,
        ...[PEOPLE.dana, PEOPLE.noaC].map((p) => ({
          ...p,
          username: p.full_name.toLowerCase().replace(' ', '.'),
          role: 'scouter',
          must_change_password: false,
          disabled_at: null,
          created_at: '2026-01-10T08:00:00.000Z',
        })),
      ],
      form_fields: [...e.form_fields, ...SUPER_FIELDS],
      scouting_entries: [
        ...e.scouting_entries,
        ...[live, a, b, sup]
          .map(row)
          .map((r) => (settled && r.id === b.id ? { ...r, deleted_at: ago(2) } : r)),
      ],
      sync_conflicts: conflictRows().map((c, i) =>
        settled
          ? { ...c, resolved_at: ago(4 - i), resolved_by: LEAD.id, resolution: resolutions[i] }
          : c,
      ),
    },
  };
}

// ---------------------------------------------------------------------------------------
// The same conflicts in listConflicts' shape (packages/shared/src/api/conflicts.ts)

const team = (n: number) => {
  const t = FIXTURE.pull.entities.teams.find((x) => x.number === n)!;
  return { id: String(t.id), number: n, name: String(t.name) };
};
const match = (n: number) => ({ id: matchId(n), match_type: 'qualification' as const, number: n });
const copyOf = (e: Entry) => ({
  row_id: e.id,
  version: 2,
  form_version_id: e.match === null ? SUPER_VERSION : FORM.version_id,
  author: e.by,
  client_updated_at: e.saved.replace('Z', '+00:00'),
  robot_status: e.status,
  breakdown_seconds: e.breakdown ?? null,
  data: e.data,
  deleted_at: null,
});
const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
function diff(x: Record<string, unknown>, y: Record<string, unknown>) {
  const xd = x.data as Record<string, unknown>;
  const yd = y.data as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(xd), ...Object.keys(yd)])].sort();
  return [
    ...['robot_status', 'breakdown_seconds'].map((k) => [k, x[k], y[k]] as const),
    ...keys.map((k) => [k, xd[k], yd[k]] as const),
  ].map(([field_key, p, q]) => ({ field_key, p: p ?? null, q: q ?? null, differs: !same(p, q) }));
}

function serverItems(): ConflictItem[] {
  const { live, a, b, sup } = entries();
  const rows = conflictRows();
  type Superseded = {
    form_version_id: string;
    robot_status: string | null;
    breakdown_seconds: null;
    data: Record<string, unknown>;
  };
  const divergence = (
    c: (typeof rows)[number],
    e: Entry,
    sup: Superseded,
    by: { id: string; full_name: string },
  ): ConflictItem => {
    const liveCopy = copyOf(e);
    const superseded = {
      ...sup,
      author: by,
      client_updated_at: c.superseded_client_updated_at,
      base_version: c.base_version,
    };
    return {
      id: c.id,
      kind: 'divergence',
      created_at: c.created_at,
      form_kind: e.match === null ? 'super' : 'match',
      team: team(e.team),
      match: e.match === null ? null : match(e.match),
      alliance: e.alliance,
      live: liveCopy,
      superseded,
      counted: 'live',
      diff: diff(liveCopy, superseded).map(({ field_key, p, q, differs }) => ({
        field_key,
        live: p,
        superseded: q,
        differs,
      })),
    };
  };
  const ac = copyOf(a);
  const bc = copyOf(b);
  return [
    divergence(rows[0]!, live, SUPERSEDED_Q2, PEOPLE.noaC),
    {
      id: rows[1]!.id,
      kind: 'duplicate',
      created_at: rows[1]!.created_at,
      form_kind: 'match',
      team: team(1690),
      match: match(4),
      alliance: 'blue',
      a: ac,
      b: bc,
      counted: 'a',
      diff: diff(ac, bc).map(({ field_key, p, q, differs }) => ({
        field_key,
        a: p,
        b: q,
        differs,
      })),
    },
    divergence(rows[2]!, sup, SUPERSEDED_SUPER, PEOPLE.amit),
  ];
}

function settledToday(): SettledConflict[] {
  const at = (m: number) => ago(m);
  return [
    {
      id: id(32),
      kind: 'divergence',
      form_kind: 'super',
      team: team(4338),
      match: null,
      resolution: { keep: 'live' },
      resolved_at: at(1),
      resolved_by: LEAD,
      kept: { row_id: id(23), author_full_name: 'Tamar Mizrahi' },
    },
    {
      id: id(31),
      kind: 'duplicate',
      form_kind: 'match',
      team: team(1690),
      match: match(4),
      resolution: { keep_row_id: id(21) },
      resolved_at: at(2),
      resolved_by: LEAD,
      kept: { row_id: id(21), author_full_name: 'Omer Katz' },
    },
    {
      id: id(30),
      kind: 'divergence',
      form_kind: 'match',
      team: team(2096),
      match: match(2),
      resolution: { keep: 'live' },
      resolved_at: at(4),
      resolved_by: LEAD,
      kept: { row_id: id(20), author_full_name: 'Dana Levi' },
    },
  ];
}

/** A server whose queue changes as the page resolves: what it settles leaves the queue. */
function server() {
  let items = serverItems();
  const settled: SettledConflict[] = [];
  const resolved: unknown[] = [];
  return {
    resolved,
    overrides: {
      listConflicts: (): ListConflictsOutput =>
        listConflictsOutput.parse({ items, next_cursor: null, settled }),
      resolveConflict: (input: Record<string, unknown>) => {
        resolved.push(input);
        const item = items.find((i) => i.id === input.conflict_id)!;
        items = items.filter((i) => i !== item);
        settled.unshift({
          id: item.id,
          kind: item.kind,
          form_kind: item.form_kind,
          team: item.team,
          match: item.match,
          resolution: input.resolution as SettledConflict['resolution'],
          resolved_at: new Date().toISOString(),
          resolved_by: LEAD,
          kept:
            item.kind === 'divergence'
              ? { row_id: item.live.row_id, author_full_name: item.live.author.full_name }
              : [item.a, item.b]
                  .filter(
                    (c) => c.row_id === (input.resolution as { keep_row_id: string }).keep_row_id,
                  )
                  .map((c) => ({ row_id: c.row_id, author_full_name: c.author.full_name }))[0]!,
        });
        return {
          conflict_id: item.id,
          resolved_at: new Date().toISOString(),
          resolution: input.resolution,
          row_id: item.kind === 'divergence' ? item.live.row_id : item.a.row_id,
          new_version: null,
          soft_deleted: null,
        };
      },
    },
  };
}

async function open(
  page: Page,
  role: Role,
  overrides: Record<string, unknown>,
  state: 'open' | 'settled' = 'open',
) {
  await signIn(page, role, { overrides: { 'sync/pull': pullWith(state), ...overrides } });
  await page.waitForLoadState('networkidle');
}

const card = (page: Page, name: RegExp) => page.getByRole('article', { name });

test('conflicts: one scroll of cards, only what differs, opened from the nav with its count', async ({
  page,
}) => {
  test.slow();
  const api = server();
  await open(page, 'lead', api.overrides);
  await page.getByRole('link', { name: 'Conflicts, 3 to review' }).click();
  await expect(page).toHaveURL(/\/conflicts$/);
  await expect(page.getByText('District #3 · Tel Aviv · 3 to review')).toBeVisible();
  const q2 = card(page, /^Q2 · 2096 RobActive$/);
  await expect(q2).toContainText('Red 2');
  await expect(q2).toContainText('Edited on two phones3 fields differ');
  await expect(q2.locator('tr[data-differs="true"]')).toHaveCount(3);
  await expect(q2.locator('tr[data-differs="false"]')).toHaveCount(0);
  await expect(q2.getByRole('button', { name: 'Show the 3 that match' })).toBeVisible();
  await expect(q2.getByRole('button', { name: 'Keep Dana’s' })).toBeEnabled();
  await expect(q2.getByRole('button', { name: 'Restore Noa’s' })).toBeEnabled();
  const q4 = card(page, /^Q4 · 1690 Orbit$/);
  await expect(q4).toContainText('Scouted twice');
  await expect(q4.getByRole('button', { name: /^Keep / })).toHaveText([
    'Keep Yael’s',
    'Keep Omer’s',
  ]);
  await expect(card(page, /^Super · 4338 Falcons$/)).toContainText('2 fields differ');
  await shoot(page, 'conflicts', undefined, { long: true });
});

test('conflicts: a choice folds the card with an Undo countdown, and only then is sent', async ({
  page,
}) => {
  test.slow();
  const api = server();
  // Hold the 5-second send while the pictures are taken (the countdown still ticks).
  await page.addInitScript(() => {
    const real = window.setTimeout.bind(window);
    (window as unknown as { __hold: boolean }).__hold = false;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) =>
      ms === 5_000 && (window as unknown as { __hold: boolean }).__hold
        ? 0
        : real(fn, ms, ...rest)) as typeof window.setTimeout;
  });
  await open(page, 'lead', api.overrides);
  await page.goto('/conflicts');
  await page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = true));
  const keep = () =>
    card(page, /^Q2 · 2096/)
      .getByRole('button', { name: 'Keep Dana’s' })
      .click();
  await keep();
  await expect(
    page.getByRole('status').filter({ hasText: 'Kept Dana’s copy · Q2 2096' }),
  ).toBeVisible();
  await expect(page.getByText('District #3 · Tel Aviv · 2 to review')).toBeVisible();
  await shoot(page, 'conflicts-settling', undefined, {
    // Each picture starts a fresh countdown, so it shows what a person sees in the first seconds.
    before: async () => {
      await page.getByRole('button', { name: /^Undo/ }).click();
      await keep();
    },
  });
  // Undo takes it back: nothing went to the server.
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(card(page, /^Q2 · 2096/)).toBeVisible();
  expect(api.resolved).toEqual([]);

  // Now let it run out: one resolveConflict, the card leaves, Settled today names it.
  await page.evaluate(() => ((window as unknown as { __hold: boolean }).__hold = false));
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/resolveConflict'));
  const at = Date.now();
  await keep();
  const request = await sent;
  expect(Date.now() - at).toBeGreaterThanOrEqual(4_500);
  expect(request.postDataJSON()).toEqual({ conflict_id: id(30), resolution: { keep: 'live' } });
  await expect(card(page, /^Q2 · 2096/)).toHaveCount(0);
  const log = page.getByRole('region', { name: 'Settled today' });
  await expect(log).toContainText(/Q2 · 2096 kept Dana’s\d\d:\d\d · Noa L\./);
  await expect(page.getByText('District #3 · Tel Aviv · 2 to review')).toBeVisible();
});

test('conflicts: offline, readable from the cache with one card opened in full, nothing resolvable', async ({
  page,
}) => {
  test.slow();
  const api = server();
  await open(page, 'lead', api.overrides);
  await page.getByRole('link', { name: 'Conflicts, 3 to review' }).click();
  await expect(card(page, /^Q2 · 2096/)).toBeVisible();
  await goOffline(page);
  await expect(
    page.getByText(/resolving needs a connection, because it settles the entry/),
  ).toBeVisible();
  const q2 = card(page, /^Q2 · 2096/);
  await q2.getByRole('button', { name: 'Show the 3 that match' }).click();
  await expect(q2.getByRole('button', { name: 'Show only the differences' })).toBeVisible();
  await expect(q2).toContainText('Dana’s later edit is counted now; Noa’s is kept aside.');
  for (const button of await page.getByRole('button', { name: /^(Keep|Restore) / }).all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: /^(Keep|Restore) / })).toHaveCount(6);
  await shoot(page, 'conflicts-offline');
});

test('conflicts: a scouter reads the queue, every action off, and has no nav row', async ({
  page,
}) => {
  test.slow();
  const api = server();
  await open(page, 'scouter', api.overrides);
  await expect(page.getByRole('link', { name: 'Sync', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Conflicts/ })).toHaveCount(0);
  await page.goto('/conflicts');
  await expect(page.getByText('A lead or an admin resolves these.')).toBeVisible();
  await expect(card(page, /^Q2 · 2096/)).toBeVisible();
  for (const button of await page.getByRole('button', { name: /^(Keep|Restore) / }).all()) {
    await expect(button).toBeDisabled();
  }
  await shoot(page, 'conflicts-scouter');
});

test('conflicts: all settled, with today’s log', async ({ page }) => {
  await open(
    page,
    'lead',
    {
      listConflicts: listConflictsOutput.parse({
        items: [],
        next_cursor: null,
        settled: settledToday(),
      }),
    },
    'settled',
  );
  await page.goto('/conflicts');
  await expect(page.getByRole('heading', { name: 'Nothing left to review' })).toBeVisible();
  await expect(page.getByText('District #3 · Tel Aviv · all settled')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Sync' })).toHaveAttribute('href', '/sync');
  const log = page.getByRole('region', { name: 'Settled today' }).getByRole('listitem');
  await expect(log).toHaveText([
    /^Super · 4338 kept Tamar’s\d\d:\d\d · Noa L\.$/,
    /^Q4 · 1690 kept Omer’s, removed Yael’s\d\d:\d\d · Noa L\.$/,
    /^Q2 · 2096 kept Dana’s\d\d:\d\d · Noa L\.$/,
  ]);
  await shoot(page, 'conflicts-settled');
});

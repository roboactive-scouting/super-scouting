import { expect, test, type Page } from '@playwright/test';
import {
  buildRankTable,
  type EngineEntry,
  type FormFieldDefinition,
  type PullResponse,
  type ScoringRule,
} from '@frc/shared';
import { goOffline, signIn } from './api-mock';
import { ENTRIES, EVENT, FIXTURE, matchId, USERS, type FixtureEntry } from './fixtures';
import { shoot } from './shoot';

/*
 * The ranking (task 1.58; docs/design/pages/27-ranking/final, variant N): District #3 with its
 * 22-team roster plus 14 more (36 teams, three of them with no entries yet), scouted with
 * breakdowns, disabled robots and no-shows. Online, `rankTeams` answers with the shared builder
 * over the very rows the device holds (what the server does); offline the device computes the same
 * table itself. Computer: Scoring with BumbleB in the study panel; Availability with the Sort
 * builder holding Availability then Breakdowns. Phone: Scoring by default; offline, Availability
 * then Breakdowns; BumbleB's summary sheet.
 */

const T0 = '2026-01-10T08:00:00.000Z';
const uid = (kind: number, n: number) =>
  `${kind.toString(16).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** 14 more teams on the roster; the last three never scouted ("No counted matches yet"). */
const EXTRA_TEAMS: [number, string][] = [
  [3083, 'Artemis'],
  [4744, 'Starlight'],
  [6741, 'Ninjas'],
  [7067, 'Team Spice'],
  [1576, 'Voltrix'],
  [2212, 'The Spikes'],
  [3211, 'Y Team'],
  [4416, 'Skynet'],
  [5614, 'Sycamore'],
  [5715, 'Drone Lords'],
  [6104, 'Desert Eagles'],
  [9738, 'Ionic Bond'],
  [8738, 'Slice'],
  [7177, 'Nova'],
];
const NO_DATA = new Set([9738, 8738, 7177]);

const teams = EXTRA_TEAMS.map(([number, name]) => ({
  id: uid(3, number),
  number,
  name,
  created_at: T0,
  updated_at: T0,
}));
const numberOf = new Map(
  [...(FIXTURE.pull.entities.teams as { id: string; number: number }[]), ...teams].map((t) => [
    t.id,
    t.number,
  ]),
);

/** A played match's answers, fixed by a seed (the form's fields: fixtures.ts). */
function answers(seed: number): Record<string, unknown> {
  return {
    auto_notes: seed % 5,
    auto_left_zone: seed % 3 !== 0,
    teleop_notes: 4 + ((seed * 7) % 17),
    endgame_climb: ['none', 'park', 'low', 'high'][seed % 4],
    teleop_coral_l4: seed % 6,
    teleop_coral_l1_3: (seed * 3) % 9,
    teleop_algae_net: seed % 4,
  };
}

const STATUS = ['played', 'broke_down', 'disabled', 'no_show'] as const;
type Status = (typeof STATUS)[number];

/** Problem matches, fixed by match and team: about one in eight. */
function statusFor(match: number, team: number): Status {
  const k = (match * 7 + team) % 31;
  if (k === 0 || k === 13 || k === 22) return 'broke_down';
  if (k === 5) return 'disabled';
  if (k === 9 || k === 27) return 'no_show';
  return 'played';
}

const withStatus = (e: FixtureEntry, status: Status): FixtureEntry => ({
  ...e,
  robot_status: status,
  breakdown_seconds: status === 'broke_down' ? 25 : null,
  // A dead robot records nothing (11.3).
  data: status === 'no_show' || status === 'disabled' ? {} : e.data,
});

function matchNumber(id: string): number {
  for (let n = 1; n <= 40; n++) if (matchId(n) === id) return n;
  return 0;
}

const scouters = USERS.filter((u) => u.role !== 'admin').map((u) => u.id);
let next = 9000;
const extraEntries: FixtureEntry[] = teams
  .filter((t) => !NO_DATA.has(t.number))
  .flatMap((team, i) =>
    Array.from({ length: 9 }, (_, j) => {
      const n = 1 + ((i * 3 + j * 4) % 34);
      const at = new Date(Date.UTC(2026, 2, 17, 6, n * 4 + (i % 3))).toISOString();
      const seed = n * 11 + team.number;
      const entry: FixtureEntry = {
        id: uid(7, next++),
        form_version_id: ENTRIES[0]!.form_version_id,
        form_kind: 'match',
        event_id: EVENT.id,
        match_id: matchId(n),
        team_id: team.id,
        alliance: j % 2 ? 'red' : 'blue',
        scouter_id: scouters[(i + j) % scouters.length]!,
        robot_status: 'played',
        breakdown_seconds: null,
        data: answers(seed),
        version: 1,
        created_at: at,
        updated_at: at,
        client_created_at: at,
        client_updated_at: at,
        deleted_at: null,
      };
      return withStatus(entry, statusFor(n, team.number));
    }),
  );

const RANK_ENTRIES: FixtureEntry[] = [
  ...ENTRIES.map((e) => {
    const n = matchNumber(e.match_id);
    // The design's seeds (Q35–Q38) keep their own statuses; the morning gets a few problems.
    if (n >= 35 || e.robot_status !== 'played') return e;
    return withStatus(e, statusFor(n, numberOf.get(e.team_id) ?? 0));
  }),
  ...extraEntries,
];

const BASE = FIXTURE.pull;
const PULL: PullResponse = {
  ...BASE,
  entities: {
    ...BASE.entities,
    teams: [...BASE.entities.teams, ...teams],
    event_teams: [
      ...BASE.entities.event_teams,
      ...teams.map((t) => ({
        id: uid(12, t.number),
        event_id: EVENT.id,
        team_id: t.id,
        created_at: T0,
        updated_at: T0,
        deleted_at: null,
      })),
    ],
    scouting_entries: RANK_ENTRIES,
  },
} as PullResponse;

/** `rankTeams` as the server answers it: the shared builder over the same rows. */
function rankTeamsAnswer() {
  const matches = new Map(
    (PULL.entities.matches as { id: string; number: number; match_type: string }[]).map((m) => [
      m.id,
      m,
    ]),
  );
  const roster = new Set(
    (PULL.entities.event_teams as { team_id: string }[]).map((r) => r.team_id),
  );
  const allTeams = PULL.entities.teams as { id: string; number: number; name: string }[];
  const entries: EngineEntry[] = RANK_ENTRIES.map((e) => ({
    ...e,
    match_type: 'qualification' as const,
    match_number: matches.get(e.match_id)?.number ?? null,
    event_sort_order: EVENT.sort_order,
  }));
  const rules = (PULL.entities.scoring_rules as Record<string, unknown>[]).map((r) => ({
    field_key: String(r.field_key),
    points: Number(r.points),
    option_points: (r.option_points ?? null) as ScoringRule['option_points'],
  }));
  return {
    event: { id: EVENT.id, name: EVENT.name },
    rows: buildRankTable({
      teams: allTeams
        .filter((t) => roster.has(t.id))
        .map((t) => ({ id: t.id, number: t.number, name: t.name })),
      entries,
      scoring: { fields: PULL.entities.form_fields as unknown as FormFieldDefinition[], rules },
    }),
  };
}

/** Signs in at 11:43 (Tel Aviv, 17 March 2026) with the ranking pull, and opens /ranking. */
async function openRanking(page: Page) {
  await page.clock.setFixedTime(new Date('2026-03-17T11:43:00+02:00'));
  await signIn(page, 'lead', {
    overrides: { 'sync/pull': PULL, rankTeams: () => rankTeamsAnswer() },
  });
  await page.waitForLoadState('networkidle');
  await page.goto('/ranking');
}

test('ranking: Scoring with a team in the study panel, Availability with the Sort builder', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRanking(page);
  const main = page.getByRole('main');
  await expect(main.getByText(/From the server · as of/)).toBeVisible();
  const table = main.getByRole('table');
  // Every roster team, no pagination; the medals on the first three only.
  await expect(table.locator('tbody tr')).toHaveCount(36);
  await expect(table.getByRole('img', { name: /^Medal/ })).toHaveCount(3);
  // The no-data teams sort last, "—" in every figure.
  await expect(table.locator('tbody tr').last()).toContainText('No counted matches yet');
  // The sidebar marks Ranking; the bar order is the phone's.
  await expect(page.getByRole('link', { name: 'Ranking' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await table.getByRole('row', { name: /3339 BumbleB/ }).click();
  const panel = main.getByRole('complementary', { name: 'Team study, 3339 BumbleB' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Open team page/ })).toBeVisible();
  // The click scrolled BumbleB's row into view; the design's frame is the top of the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, 'ranking', 'desktop');

  // Availability, sorted by Availability then Breakdowns, the builder open.
  await panel.getByRole('button', { name: 'Close the team study' }).click();
  await main.getByRole('radio', { name: /^Availability/ }).click();
  await main.getByRole('button', { name: /^Sort Availability:/ }).click();
  const builder = main.getByRole('dialog', { name: 'Sort Availability by' });
  await builder.getByRole('button', { name: '+ Breakdowns' }).click();
  await expect(main.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
    'Sort Availability: Availability, best first, then Breakdowns, fewest first',
  );
  await expect(builder.getByRole('button', { name: /^\+ / })).toHaveText([
    '+ No-shows',
    '+ Disabled',
  ]);
  await shoot(page, 'ranking-availability', 'desktop');

  // The narrowest computer (1024 px): no sideways page scroll; the study opens in the sheet.
  await page.keyboard.press('Escape');
  await main.getByRole('radio', { name: /^Scoring/ }).click();
  await shoot(page, 'ranking', 'laptop');
  await page.setViewportSize({ width: 1024, height: 768 });
  await table.getByRole('row', { name: /1690 Orbit/ }).click();
  await expect(page.getByRole('dialog', { name: '1690 Orbit' })).toBeVisible();
  await expect(main.getByRole('complementary')).toHaveCount(0);
});

test('ranking: the phone — Scoring, offline Availability then Breakdowns, the summary sheet', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 375, height: 812 });
  await openRanking(page);
  const main = page.getByRole('main');
  const list = main.getByRole('list', { name: 'Teams, Scoring' });
  await expect(list.getByRole('listitem')).toHaveCount(36);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Home',
    'Scout',
    'Search',
    'Ranking',
  ]);
  await shoot(page, 'ranking', 'phone');

  // BumbleB's summary after a tap.
  await list.getByRole('button', { name: /3339 BumbleB/ }).click();
  const sheet = page.getByRole('dialog', { name: '3339 BumbleB' });
  await expect(sheet.getByRole('link', { name: /Open team page/ })).toBeVisible();
  await shoot(page, 'ranking-summary', 'phone');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Offline: the device computes the same table and says so.
  await goOffline(page);
  await expect(main.getByText('Computed from the data on this device')).toBeVisible();
  await main.getByRole('radio', { name: 'Availability' }).click();
  await main.getByRole('button', { name: /^Sort Availability:/ }).click();
  const builder = page.getByRole('dialog', { name: 'Sort Availability by' });
  await builder.getByRole('button', { name: '+ Breakdowns' }).click();
  await builder.getByRole('button', { name: 'Close' }).click();
  await expect(main.getByRole('button', { name: /^Sort Availability:/ })).toHaveAccessibleName(
    'Sort Availability: Availability, best first, then Breakdowns, fewest first',
  );
  // The design's frame 2 is the top of the page: the event, the device notice, the list.
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, 'ranking-offline-availability', 'phone');
});

import { beforeEach, describe, expect, it } from 'vitest';
import { scoreEntry, type Caller } from '@frc/shared';
import { getEntry, listTeamEvents, queryEntries, searchTeams } from './search.js';
import { makeFakeContext, type FakeContext } from '../../test/fake-context.js';

const scouter: Caller = { kind: 'user', userId: 'u-s', role: 'scouter' };
const service: Caller = { kind: 'service', label: 'mcp' };

let ctx: FakeContext;
beforeEach(() => {
  ctx = makeFakeContext();
  ctx.seedSmallSeason(); // se-1, ev-1 (active) and ev-2, teams t-1..t-3, entries e-1..e-12
});

describe('searchTeams (SPEC-FINAL 13.2)', () => {
  it('matches by number and by name, across the whole season', async () => {
    expect((await searchTeams(scouter, { query: '2096' }, ctx)).items.map((t) => t.id)).toContain(
      't-1',
    );
    expect(
      (await searchTeams(scouter, { query: 'robactive' }, ctx)).items.map((t) => t.id),
    ).toContain('t-1');
  });

  it('marks teams in the active event with their rank and leaves others unranked', async () => {
    const items = (await searchTeams(scouter, { query: '' }, ctx)).items;
    expect(items.find((t) => t.id === 't-1')!.rank).toBe(1);
    expect(items.find((t) => t.id === 't-3')!.rank).toBeNull();
  });

  it('is bounded and paginated, and never returns the whole registry at once', async () => {
    const page = await searchTeams(scouter, { query: '', limit: 2 }, ctx);
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
  });
});

describe('listTeamEvents', () => {
  it('returns only events where we hold entries for that team', async () => {
    const events = await listTeamEvents(scouter, { team_id: 't-1' }, ctx);
    expect(events.items.map((e) => e.id)).toEqual(['ev-1']);
  });
});

describe('queryEntries (SPEC-FINAL 13.3)', () => {
  it('returns entries of one event only, never another', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(result.items.every((e) => e.event_id === 'ev-1')).toBe(true);
  });

  it('filters by form kind, and returns both kinds when unfiltered', async () => {
    const matchOnly = await queryEntries(scouter, { event_id: 'ev-1', form_kind: 'match' }, ctx);
    expect(matchOnly.items.every((e) => e.form_kind === 'match')).toBe(true);
    const both = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(new Set(both.items.map((e) => e.form_kind)).size).toBe(2);
  });

  it('matches a scouter name, a team name, a team number and a match number', async () => {
    for (const query of ['Seed Scouter', 'ROBACTIVE', '2096', '3']) {
      expect(
        (await queryEntries(scouter, { event_id: 'ev-1', query }, ctx)).items.length,
        query,
      ).toBeGreaterThan(0);
    }
  });

  it('never returns a soft-deleted entry', async () => {
    ctx.softDelete('e-1');
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(result.items.map((e) => e.id)).not.toContain('e-1');
  });

  it('carries each row scouted points, computed by the shared engine', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    const played = result.items.find((e) => e.robot_status === 'played')!;
    expect(typeof played.scouted_points).toBe('number');
    const noShow = result.items.find((e) => e.robot_status === 'no_show');
    if (noShow) expect(noShow.scouted_points).toBeNull();
  });
});

describe('getEntry (SPEC-FINAL 13.4, 18.5)', () => {
  it('returns every field value by phase, the score, and the scouter full name', async () => {
    const entry = await getEntry(scouter, { entry_id: 'e-1' }, ctx);
    expect(entry.scouter_name).toBe('Seed Scouter');
    expect(entry.phases.map((p) => p.phase)).toEqual(['auto', 'teleop', 'endgame', 'post_match']);
    expect(typeof entry.scouted_points).toBe('number');
  });

  it('returns not-found for a soft-deleted entry', async () => {
    ctx.softDelete('e-1');
    await expect(getEntry(scouter, { entry_id: 'e-1' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('the service caller', () => {
  it('may call all four, because they are queries', async () => {
    await expect(searchTeams(service, { query: '' }, ctx)).resolves.toBeTruthy();
    await expect(listTeamEvents(service, { team_id: 't-1' }, ctx)).resolves.toBeTruthy();
    await expect(queryEntries(service, { event_id: 'ev-1' }, ctx)).resolves.toBeTruthy();
    await expect(getEntry(service, { entry_id: 'e-1' }, ctx)).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// Beyond the plan's test: the wire shapes later tasks code against, and the negatives.
// ---------------------------------------------------------------------------------------------

const lead: Caller = { kind: 'user', userId: 'u-lead', role: 'lead' };
const seed: Caller = { kind: 'user', userId: 'u-seed', role: 'scouter' };
/** e-1's client_created_at (the fixture's minute 1). */
const E1_CREATED = Date.UTC(2026, 10, 14, 8, 1);

async function allPages<T>(
  read: (cursor: string | undefined) => Promise<{ items: T[]; next_cursor: string | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i += 1) {
    const page = await read(cursor);
    out.push(...page.items);
    if (!page.next_cursor) return out;
    cursor = page.next_cursor;
  }
  throw new Error('pagination did not end');
}

describe('searchTeams — the page-23 wire shape', () => {
  it('orders at-event teams by rank, then the others by number, with counts and the event', async () => {
    const result = await searchTeams(scouter, {}, ctx);
    expect(result.event).toEqual({ id: 'ev-1', name: 'District #3 · Tel Aviv' });
    expect(result.items.map((t) => [t.id, t.in_active_event, t.rank])).toEqual([
      ['t-1', true, 1],
      ['t-2', true, 2],
      ['t-3', false, null],
    ]);
    expect(result.counts).toEqual({ all: 3, at_event: 2, other: 1 });
    expect(result.next_cursor).toBeNull();
  });

  it('counts live entries here (both kinds) and names the other events we hold entries at', async () => {
    const items = (await searchTeams(scouter, {}, ctx)).items;
    const byId = new Map(items.map((t) => [t.id, t]));
    // t-1: e-1, e-2, e-3, e-7, e-10 (super), e-12 at ev-1.
    expect(byId.get('t-1')).toMatchObject({ entries_here: 6, other_events: [] });
    expect(byId.get('t-2')).toMatchObject({
      entries_here: 6,
      other_events: [{ id: 'ev-2', name: "District #2 · Be'er Sheva" }],
    });
    expect(byId.get('t-3')).toMatchObject({
      entries_here: 0,
      other_events: [{ id: 'ev-2', name: "District #2 · Be'er Sheva" }],
    });
    ctx.softDelete('e-22');
    const after = (await searchTeams(scouter, {}, ctx)).items.find((t) => t.id === 't-3')!;
    expect(after.other_events).toEqual([]);
  });

  it('filters by chip while the counts follow only the query', async () => {
    const other = await searchTeams(scouter, { filter: 'other' }, ctx);
    expect(other.items.map((t) => t.id)).toEqual(['t-3']);
    expect(other.counts).toEqual({ all: 3, at_event: 2, other: 1 });
    const here = await searchTeams(scouter, { filter: 'at_event', query: 'or' }, ctx);
    expect(here.items.map((t) => t.id)).toEqual(['t-2']);
    expect(here.counts).toEqual({ all: 1, at_event: 1, other: 0 });
  });

  it('takes a number prefix and a name literally, case-insensitively', async () => {
    expect((await searchTeams(scouter, { query: '20' }, ctx)).items.map((t) => t.id)).toEqual([
      't-1',
    ]);
    expect((await searchTeams(scouter, { query: 'JATT' }, ctx)).items.map((t) => t.id)).toEqual([
      't-3',
    ]);
    expect((await searchTeams(scouter, { query: '96' }, ctx)).items).toEqual([]);
    expect((await searchTeams(scouter, { query: '%' }, ctx)).items).toEqual([]);
  });

  it('pages through every team exactly once', async () => {
    const all = await allPages((cursor) => searchTeams(scouter, { limit: 1, cursor }, ctx));
    expect(all.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3']);
  });

  it('ranks at the caller’s effective event when one is given (a session override)', async () => {
    const result = await searchTeams(scouter, { event_id: 'ev-2' }, ctx);
    expect(result.event?.id).toBe('ev-2');
    // ev-2: t-2 scored 12, t-3 scored 14 — t-3 ranks 1 there; t-1 is not at ev-2.
    expect(result.items.map((t) => [t.id, t.rank])).toEqual([
      ['t-3', 1],
      ['t-2', 2],
      ['t-1', null],
    ]);
    expect(result.items.find((t) => t.id === 't-1')!.other_events.map((e) => e.id)).toEqual([
      'ev-1',
    ]);
  });

  it('refuses an event that does not exist, and lists unranked with no active event', async () => {
    await expect(searchTeams(scouter, { event_id: 'ev-404' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
    ctx.setActiveContext('se-1', null);
    const result = await searchTeams(scouter, {}, ctx);
    expect(result.event).toBeNull();
    expect(result.items.every((t) => t.rank === null && !t.in_active_event)).toBe(true);
    expect(result.counts).toEqual({ all: 3, at_event: 0, other: 3 });
    ctx.setActiveContext(null, null);
    expect(await searchTeams(scouter, {}, ctx)).toEqual({
      items: [],
      counts: { all: 0, at_event: 0, other: 0 },
      event: null,
      next_cursor: null,
    });
  });

  it('a no-show, a disabled robot and a practice match never feed the rank', async () => {
    // Soft-delete t-1's two counted entries: what remains (no-show, disabled, practice) counts
    // for nothing, so t-1 is "not ranked yet" rather than ranked on zeros.
    ctx.softDelete('e-1');
    ctx.softDelete('e-2');
    const items = (await searchTeams(scouter, {}, ctx)).items;
    expect(items.map((t) => [t.id, t.rank])).toEqual([
      ['t-2', 1],
      ['t-1', null],
      ['t-3', null],
    ]);
  });
});

describe('listTeamEvents — the event picker', () => {
  it('lists each event with its live entry count and newest entry, in event order', async () => {
    const result = await listTeamEvents(scouter, { team_id: 't-2' }, ctx);
    expect(result.items).toEqual([
      {
        id: 'ev-1',
        name: 'District #3 · Tel Aviv',
        entry_count: 6,
        last_entry_at: '2026-11-14T08:11:00.000Z',
      },
      {
        id: 'ev-2',
        name: "District #2 · Be'er Sheva",
        entry_count: 1,
        last_entry_at: '2026-11-14T08:13:00.000Z',
      },
    ]);
    expect(result.next_cursor).toBeNull();
  });

  it('leaves out soft-deleted entries, and an unknown team has none', async () => {
    ctx.softDelete('e-21');
    expect((await listTeamEvents(scouter, { team_id: 't-2' }, ctx)).items.map((e) => e.id)).toEqual(
      ['ev-1'],
    );
    expect((await listTeamEvents(scouter, { team_id: 't-404' }, ctx)).items).toEqual([]);
  });

  it('pages', async () => {
    const all = await allPages((cursor) =>
      listTeamEvents(scouter, { team_id: 't-2', limit: 1, cursor }, ctx),
    );
    expect(all.map((e) => e.id)).toEqual(['ev-1', 'ev-2']);
  });
});

describe('queryEntries — the entry search', () => {
  it('lists newest first, with the match label, the team and the scouter name', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1' }, ctx);
    expect(result.items.map((e) => e.id)).toEqual([
      'e-12',
      'e-11',
      'e-10',
      'e-9',
      'e-8',
      'e-7',
      'e-6',
      'e-5',
      'e-4',
      'e-3',
      'e-2',
      'e-1',
    ]);
    expect(result.items.find((e) => e.id === 'e-1')).toEqual({
      id: 'e-1',
      event_id: 'ev-1',
      form_kind: 'match',
      match_id: 'm-1',
      match_type: 'qualification',
      match_number: 1,
      match_label: 'Q1',
      team_id: 't-1',
      team_number: 2096,
      team_name: 'ROBACTIVE',
      alliance: 'red',
      scouter_id: 'u-seed',
      scouter_name: 'Seed Scouter',
      robot_status: 'played',
      scouted_points: 35,
      client_created_at: '2026-11-14T08:01:00.000Z',
      client_updated_at: '2026-11-14T08:01:00.000Z',
    });
  });

  it('gives no points to a no-show, a disabled robot or a super entry — never 0', async () => {
    const items = (await queryEntries(scouter, { event_id: 'ev-1' }, ctx)).items;
    const points = (id: string) => items.find((e) => e.id === id)!.scouted_points;
    expect(points('e-3')).toBeNull(); // no_show
    expect(points('e-7')).toBeNull(); // disabled
    expect(points('e-10')).toBeNull(); // super
    expect(points('e-6')).toBe(2); // broke down: scored on what it did
    const superRow = items.find((e) => e.id === 'e-10')!;
    expect(superRow).toMatchObject({ match_id: null, match_label: null, robot_status: null });
  });

  it("scores with the form's ACTIVE version, whatever version the entry was scouted on", async () => {
    const items = (await queryEntries(scouter, { event_id: 'ev-1' }, ctx)).items;
    // e-9 is on the retired v1; it scores by the active v2's fields and the form's rules.
    expect(items.find((e) => e.id === 'e-9')!.scouted_points).toBe(3);
  });

  it('never returns another event’s entry, and the other event never returns ours', async () => {
    const one = await queryEntries(scouter, { event_id: 'ev-1', query: '1690' }, ctx);
    expect(one.items.map((e) => e.id)).not.toContain('e-21');
    const two = await queryEntries(scouter, { event_id: 'ev-2' }, ctx);
    expect(two.items.map((e) => e.id).sort()).toEqual(['e-21', 'e-22']);
    expect(await queryEntries(scouter, { event_id: 'ev-404' }, ctx)).toEqual({
      items: [],
      next_cursor: null,
    });
  });

  it('matches a match number exactly, or its label, and a scouter name in any case', async () => {
    const ids = async (query: string) =>
      (await queryEntries(scouter, { event_id: 'ev-1', query }, ctx)).items.map((e) => e.id).sort();
    expect(await ids('3')).toEqual(['e-3', 'e-6']);
    expect(await ids('q4')).toEqual(['e-7', 'e-9']);
    expect(await ids('P1')).toEqual(['e-12', 'e-8']);
    expect(await ids('fixture scouter')).toEqual(['e-11', 'e-4', 'e-5', 'e-6', 'e-8', 'e-9']);
    expect(await ids('orb')).toEqual(['e-11', 'e-4', 'e-5', 'e-6', 'e-8', 'e-9']);
    expect(await ids('nobody')).toEqual([]);
  });

  it('combines the search with the kind filter', async () => {
    const result = await queryEntries(
      scouter,
      { event_id: 'ev-1', query: 'robactive', form_kind: 'super' },
      ctx,
    );
    expect(result.items.map((e) => e.id)).toEqual(['e-10']);
  });

  it('pages newest first through every live entry exactly once', async () => {
    ctx.softDelete('e-5');
    const all = await allPages((cursor) =>
      queryEntries(scouter, { event_id: 'ev-1', limit: 5, cursor }, ctx),
    );
    expect(all.map((e) => e.id)).toEqual([
      'e-12',
      'e-11',
      'e-10',
      'e-9',
      'e-8',
      'e-7',
      'e-6',
      'e-4',
      'e-3',
      'e-2',
      'e-1',
    ]);
  });

  it('clamps a large limit and refuses an unreadable cursor', async () => {
    const result = await queryEntries(scouter, { event_id: 'ev-1', limit: 10_000 }, ctx);
    expect(result.items).toHaveLength(12);
    await expect(
      queryEntries(scouter, { event_id: 'ev-1', cursor: 'not-a-cursor' }, ctx),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('getEntry — the entry preview', () => {
  it('renders the answers by phase with points, subtotals, labels and the form version', async () => {
    const entry = await getEntry(scouter, { entry_id: 'e-1' }, ctx);
    expect(entry).toMatchObject({
      id: 'e-1',
      match_label: 'Q1',
      team_number: 2096,
      form_id: 'fm-1',
      form_version_id: 'fv-m2',
      form_version: 2,
      scouted_points: 35,
      team_average: 25,
    });
    expect(entry.phases).toEqual([
      {
        phase: 'auto',
        subtotal: 13,
        fields: [
          { key: 'auto_leave', label: 'auto leave', type: 'toggle', value: true, points: 3 },
          { key: 'auto_notes', label: 'auto notes', type: 'counter', value: 2, points: 10 },
        ],
      },
      {
        phase: 'teleop',
        subtotal: 10,
        fields: [{ key: 'tele_notes', label: 'tele notes', type: 'counter', value: 5, points: 10 }],
      },
      {
        phase: 'endgame',
        subtotal: 12,
        fields: [
          { key: 'climb', label: 'climb', type: 'single_select', value: 'Deep cage', points: 12 },
        ],
      },
      {
        phase: 'post_match',
        subtotal: null,
        fields: [
          { key: 'comments', label: 'comments', type: 'long_text', value: 'Fast', points: null },
        ],
      },
    ]);
  });

  it('has a total that is exactly the shared scoreEntry over the active version', async () => {
    const fields = await ctx.store.getFormFields('fv-m2');
    const rules = await ctx.store.getScoringRules('fm-1');
    for (const id of ['e-1', 'e-2', 'e-6', 'e-9']) {
      const entry = await getEntry(scouter, { entry_id: id }, ctx);
      const row = ctx.rows.scouting_entries.get(id)!;
      expect(entry.scouted_points, id).toBe(
        scoreEntry(
          { robot_status: 'played', data: row.data as Record<string, unknown> },
          fields,
          rules,
        ),
      );
      expect(
        entry.phases.reduce((s, p) => s + (p.subtotal ?? 0), 0),
        id,
      ).toBe(entry.scouted_points);
    }
  });

  it('gives a no-show no field rows and no score — never zeros', async () => {
    const entry = await getEntry(scouter, { entry_id: 'e-3' }, ctx);
    expect(entry).toMatchObject({ robot_status: 'no_show', phases: [], scouted_points: null });
    const disabled = await getEntry(scouter, { entry_id: 'e-7' }, ctx);
    expect(disabled).toMatchObject({ phases: [], scouted_points: null });
  });

  it('gives a super entry its answers by phase, with no points, no score and no average', async () => {
    const entry = await getEntry(scouter, { entry_id: 'e-10' }, ctx);
    expect(entry).toMatchObject({
      form_kind: 'super',
      match_label: null,
      scouted_points: null,
      team_average: null,
      form_version: 1,
    });
    expect(entry.phases.map((p) => p.phase)).toEqual(['teleop', 'post_match']);
    expect(
      entry.phases.every((p) => p.subtotal === null && p.fields.every((f) => f.points === null)),
    ).toBe(true);
  });

  it('is not-found for an unknown id', async () => {
    await expect(getEntry(scouter, { entry_id: 'e-404' }, ctx)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  describe('can_edit (SPEC-FINAL 7.6, through mayEditEntryNow)', () => {
    it('lets the scouter edit their own match entry within 5 minutes of creating it', async () => {
      ctx.nowValue = new Date(E1_CREATED + 2 * 60_000);
      expect((await getEntry(seed, { entry_id: 'e-1' }, ctx)).can_edit).toBe(true);
    });

    it('refuses the scouter past 5 minutes, measured to the server clock', async () => {
      ctx.nowValue = new Date(E1_CREATED + 5 * 60_000 + 1);
      expect((await getEntry(seed, { entry_id: 'e-1' }, ctx)).can_edit).toBe(false);
    });

    it("refuses another scouter's match entry, even inside the window", async () => {
      ctx.nowValue = new Date(E1_CREATED + 60_000);
      expect((await getEntry(scouter, { entry_id: 'e-1' }, ctx)).can_edit).toBe(false);
    });

    it('refuses a service caller', async () => {
      ctx.nowValue = new Date(E1_CREATED + 60_000);
      expect((await getEntry(service, { entry_id: 'e-1' }, ctx)).can_edit).toBe(false);
    });

    it('lets the scouter edit their own super entry at any time, and a lead any entry', async () => {
      expect((await getEntry(seed, { entry_id: 'e-10' }, ctx)).can_edit).toBe(true);
      expect((await getEntry(scouter, { entry_id: 'e-10' }, ctx)).can_edit).toBe(false);
      expect((await getEntry(lead, { entry_id: 'e-1' }, ctx)).can_edit).toBe(true);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { coverage } from './coverage';

const M = [
  { id: 'q1', type: 'qualification', number: 1 },
  { id: 'q2', type: 'qualification', number: 2 },
  { id: 'p1', type: 'practice', number: 1 },
];
const slots = ['a', 'b', 'c', 'd', 'e', 'f'].map((t, i) => ({
  match_id: 'q1',
  team_id: t,
  alliance: i < 3 ? ('red' as const) : ('blue' as const),
  station: ((i % 3) + 1) as 1 | 2 | 3,
}));

describe('schedule coverage (Home README)', () => {
  it('is qualification only, ordered by number', () => {
    expect(coverage(M, slots, []).map((c) => c.number)).toEqual([1, 2]);
  });
  it('full when every slotted team has an entry, gap when some do, none when nobody', () => {
    const all = slots.map((s) => ({ match_id: 'q1', team_id: s.team_id }));
    expect(coverage(M, slots, all)[0]!.state).toBe('full');
    expect(coverage(M, slots, all.slice(1))[0]!.state).toBe('gap');
    expect(coverage(M, slots, [])[0]!.state).toBe('none');
  });
  it('ignores deleted entries', () => {
    const all = slots.map((s) => ({
      match_id: 'q1',
      team_id: s.team_id,
      deleted_at: s.team_id === 'a' ? '2026-10-06T00:00:00Z' : null,
    }));
    expect(coverage(M, slots, all)[0]!.state).toBe('gap');
  });
  it('ignores super-scout entries', () => {
    const all = slots.map((s) => ({ match_id: 'q1', team_id: s.team_id, form_kind: 'super' }));
    expect(coverage(M, slots, all)[0]!.state).toBe('none');
  });
  it('counts the robots scouted in each match, once per robot (UF.21)', () => {
    const four = ['a', 'b', 'c', 'd'].map((t) => ({ match_id: 'q1', team_id: t }));
    const twice = [...four, { match_id: 'q1', team_id: 'a' }];
    const dropped = [...four, { match_id: 'q1', team_id: 'e', deleted_at: '2026-10-06T00:00:00Z' }];
    expect(coverage(M, slots, twice).map((c) => c.scouted)).toEqual([4, 0]);
    expect(coverage(M, slots, dropped)[0]!.scouted).toBe(4);
    const all = slots.map((s) => ({ match_id: 'q1', team_id: s.team_id }));
    expect(coverage(M, slots, all)[0]).toMatchObject({ state: 'full', scouted: 6 });
  });

  it('draws a match the device holds twice as one square, the robots of both copies merged (UF.22)', () => {
    // A phone that made Q2 twice before UF.22: two rows, entries on each, one robot on both.
    const twice = [...M, { id: 'q2-copy', type: 'qualification', number: 2 }];
    const entries = [
      { match_id: 'q2', team_id: 'a' },
      { match_id: 'q2', team_id: 'b' },
      { match_id: 'q2-copy', team_id: 'b' },
      { match_id: 'q2-copy', team_id: 'c' },
    ];
    const cells = coverage(twice, slots, entries);
    expect(cells.map((c) => c.number)).toEqual([1, 2]);
    expect(cells[1]).toMatchObject({ matchId: 'q2', state: 'gap', scouted: 3 });
  });
  it('judges a merged square against the line-up of whichever copy has one (UF.22)', () => {
    // The server's Q1 carries the line-up; a bare copy made on the device carries entries.
    const twice = [{ id: 'q1-bare', type: 'qualification', number: 1 }, ...M];
    const all = slots.map((s, i) => ({ match_id: i < 3 ? 'q1' : 'q1-bare', team_id: s.team_id }));
    const cells = coverage(twice, slots, all);
    expect(cells.filter((c) => c.number === 1)).toHaveLength(1);
    expect(cells[0]).toMatchObject({ matchId: 'q1', state: 'full', scouted: 6 });
  });
});

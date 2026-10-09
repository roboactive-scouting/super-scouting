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
});

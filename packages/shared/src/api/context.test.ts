import { describe, expect, it } from 'vitest';
import { activeContext, getActiveContextInput } from './context';

const SEASON = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000002';

describe('the active-context wire schemas (SPEC-FINAL 3.1, 4.1; task 1.17b)', () => {
  it('takes no input, and refuses a field rather than dropping it', () => {
    expect(getActiveContextInput.parse({})).toEqual({});
    expect(getActiveContextInput.safeParse({ event_id: EVENT }).success).toBe(false);
  });

  it('answers a season and an event, either of which may be null', () => {
    expect(activeContext.parse({ active_season_id: SEASON, active_event_id: EVENT })).toEqual({
      active_season_id: SEASON,
      active_event_id: EVENT,
    });
    expect(activeContext.parse({ active_season_id: null, active_event_id: null })).toEqual({
      active_season_id: null,
      active_event_id: null,
    });
    expect(activeContext.parse({ active_season_id: SEASON, active_event_id: null })).toEqual({
      active_season_id: SEASON,
      active_event_id: null,
    });
  });

  it('refuses an id that is not a uuid, and a missing field', () => {
    expect(
      activeContext.safeParse({ active_season_id: 'nope', active_event_id: null }).success,
    ).toBe(false);
    expect(activeContext.safeParse({ active_season_id: null }).success).toBe(false);
  });
});

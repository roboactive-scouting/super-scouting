import { describe, expect, it } from 'vitest';
import {
  activeContext,
  createEventInput,
  createSeasonInput,
  eventRow,
  getActiveContextInput,
  listEventsInput,
  reorderEventsInput,
  seasonRow,
  updateEventInput,
  updateSeasonInput,
} from './context';

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

describe('the season and event wire schemas (SPEC-FINAL 6.2, 6.4; task 1.18)', () => {
  const image = 'seasons/2026/field.webp';

  it('trims names, and refuses an empty one, a year out of range and a non-integer year', () => {
    expect(
      createSeasonInput.parse({ year: 2026, game_name: '  REEFSCAPE ', field_image_path: image }),
    ).toEqual({ year: 2026, game_name: 'REEFSCAPE', field_image_path: image });
    for (const bad of [
      { year: 2026, game_name: '   ', field_image_path: image },
      { year: 1991, game_name: 'A', field_image_path: image },
      { year: 2026.5, game_name: 'A', field_image_path: image },
      { year: 2026, game_name: 'A', field_image_path: '' },
    ]) {
      expect(createSeasonInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('refuses a field a use case does not take, rather than dropping it', () => {
    expect(
      createSeasonInput.safeParse({
        year: 2026,
        game_name: 'A',
        field_image_path: image,
        id: SEASON,
      }).success,
    ).toBe(false);
    // updateEvent renames only: it can neither reorder an event nor move it to another season
    expect(updateEventInput.safeParse({ event_id: EVENT, name: 'A', sort_order: 1 }).success).toBe(
      false,
    );
    expect(
      updateEventInput.safeParse({ event_id: EVENT, name: 'A', season_id: SEASON }).success,
    ).toBe(false);
    expect(
      createEventInput.safeParse({ season_id: SEASON, name: 'A', sort_order: 3 }).success,
    ).toBe(false);
  });

  it('needs at least one field to update a season', () => {
    expect(updateSeasonInput.safeParse({ season_id: SEASON }).success).toBe(false);
    expect(updateSeasonInput.safeParse({ season_id: SEASON, game_name: 'B' }).success).toBe(true);
    expect(updateSeasonInput.safeParse({ season_id: SEASON, year: 2027 }).success).toBe(true);
  });

  it('takes uuids for every id', () => {
    expect(listEventsInput.safeParse({ season_id: 'se-1' }).success).toBe(false);
    expect(reorderEventsInput.safeParse({ season_id: SEASON, event_ids: ['ev-1'] }).success).toBe(
      false,
    );
    expect(reorderEventsInput.safeParse({ season_id: SEASON, event_ids: [EVENT] }).success).toBe(
      true,
    );
  });

  it('describes a season row and an event row, whose code may be null', () => {
    const at = '2026-09-27T12:00:00.000+00:00';
    expect(
      seasonRow.safeParse({
        id: SEASON,
        year: 2026,
        game_name: 'A',
        field_image_path: image,
        created_at: at,
        updated_at: at,
      }).success,
    ).toBe(true);
    expect(
      eventRow.safeParse({
        id: EVENT,
        season_id: SEASON,
        name: 'Week 1',
        code: null,
        sort_order: 1,
        created_at: at,
        updated_at: at,
      }).success,
    ).toBe(true);
  });
});

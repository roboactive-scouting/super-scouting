import { describe, expect, it } from 'vitest';
import { canonicalEntries, entriesForAggregates } from './select';
import type { EngineEntry } from './types';

const entry = (over: Partial<EngineEntry>): EngineEntry => ({
  id: 'e',
  form_version_id: 'fv-1',
  form_kind: 'match',
  event_id: 'ev-1',
  match_id: 'm-1',
  team_id: 't-1',
  alliance: 'red',
  scouter_id: 'u-1',
  robot_status: 'played',
  data: {},
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  deleted_at: null,
  match_type: 'qualification',
  match_number: 1,
  event_sort_order: 1,
  ...over,
});

const super_ = (over: Partial<EngineEntry>): EngineEntry =>
  entry({ form_kind: 'super', match_id: null, alliance: null, robot_status: null, ...over });

const ids = (entries: EngineEntry[]) => entries.map((e) => e.id);

describe('canonicalEntries (SPEC-FINAL 11.6)', () => {
  it('keeps one entry per (team, match, form kind)', () => {
    const result = canonicalEntries([entry({ id: 'a' }), entry({ id: 'b', team_id: 't-2' })]);
    expect(result).toHaveLength(2);
  });

  it('keeps distinct matches of one team apart', () => {
    const result = canonicalEntries([entry({ id: 'a' }), entry({ id: 'b', match_id: 'm-2' })]);
    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('reads only the greatest client_updated_at when two duplicates exist', () => {
    const result = canonicalEntries([
      entry({ id: 'a', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({ id: 'b', client_updated_at: '2026-11-14T09:08:00.000Z' }),
    ]);
    expect(ids(result)).toEqual(['b']);
  });

  it('picks the latest whatever order the rows arrive in, among three duplicates', () => {
    const rows = [
      entry({ id: 'a', client_updated_at: '2026-11-14T09:01:00.000Z' }),
      entry({ id: 'b', client_updated_at: '2026-11-14T09:09:00.000Z' }),
      entry({ id: 'c', client_updated_at: '2026-11-14T09:05:00.000Z' }),
    ];
    expect(ids(canonicalEntries(rows))).toEqual(['b']);
    expect(ids(canonicalEntries([...rows].reverse()))).toEqual(['b']);
  });

  it('compares instants, not strings', () => {
    // As strings '…T11:00:00+02:00' sorts above '…T10:00:00.000Z'; as instants it is 09:00Z,
    // an hour EARLIER, so the client stamp wins.
    const rows = [
      entry({ id: 'offset', client_updated_at: '2026-11-14T11:00:00+02:00' }),
      entry({ id: 'utc', client_updated_at: '2026-11-14T10:00:00.000Z' }),
    ];
    expect(ids(canonicalEntries(rows))).toEqual(['utc']);
    expect(ids(canonicalEntries([...rows].reverse()))).toEqual(['utc']);
  });

  it('breaks a tie on client_updated_at by the greater client_created_at, in either order', () => {
    const rows = [
      entry({ id: 'z-early', client_created_at: '2026-11-14T08:00:00.000Z' }),
      entry({ id: 'a-late', client_created_at: '2026-11-14T08:30:00.000Z' }),
    ];
    expect(ids(canonicalEntries(rows))).toEqual(['a-late']);
    expect(ids(canonicalEntries([...rows].reverse()))).toEqual(['a-late']);
  });

  it('breaks a full tie by the greater id, in either order, and across stamp formats', () => {
    const rows = [
      entry({ id: 'aaa', client_updated_at: '2026-11-14T09:08:00.000Z' }),
      entry({ id: 'bbb', client_updated_at: '2026-11-14T09:08:00+00:00' }),
    ];
    expect(ids(canonicalEntries(rows))).toEqual(['bbb']);
    expect(ids(canonicalEntries([...rows].reverse()))).toEqual(['bbb']);
  });

  it('separates a match entry from a super entry for the same team', () => {
    const result = canonicalEntries([entry({ id: 'a' }), super_({ id: 'b' })]);
    expect(result).toHaveLength(2);
  });

  it('keeps one super entry per team per event, and separate events apart', () => {
    const result = canonicalEntries([
      super_({ id: 'a', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      super_({ id: 'b', client_updated_at: '2026-11-14T10:00:00.000Z' }),
      super_({ id: 'c', event_id: 'ev-2' }),
    ]);
    expect(ids(result)).toEqual(['b', 'c']);
  });

  it('never returns a soft-deleted entry', () => {
    expect(canonicalEntries([entry({ id: 'a', deleted_at: '2026-11-14T10:00:00.000Z' })])).toEqual(
      [],
    );
  });

  it('lets a soft-deleted later duplicate neither count nor hide the live one', () => {
    const result = canonicalEntries([
      entry({ id: 'live', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({
        id: 'gone',
        client_updated_at: '2026-11-14T09:30:00.000Z',
        deleted_at: '2026-11-14T10:00:00.000Z',
      }),
    ]);
    expect(ids(result)).toEqual(['live']);
  });

  it('returns an empty list for empty input', () => {
    expect(canonicalEntries([])).toEqual([]);
  });
});

describe('entriesForAggregates (SPEC-FINAL 11.2, 11.3)', () => {
  it('keeps only qualification matches, absolutely', () => {
    const result = entriesForAggregates([
      entry({ id: 'q', match_type: 'qualification' }),
      entry({ id: 'p', match_type: 'practice', match_id: 'm-2' }),
      entry({ id: 'f', match_type: 'playoff', match_id: 'm-3' }),
    ]);
    expect(ids(result)).toEqual(['q']);
  });

  it('drops a match entry whose match type is unknown', () => {
    expect(entriesForAggregates([entry({ id: 'x', match_type: null })])).toEqual([]);
  });

  it('keeps a super entry, which has no match and no robot status', () => {
    expect(ids(entriesForAggregates([super_({ id: 's', match_type: null })]))).toEqual(['s']);
  });

  it('includes played and broke_down', () => {
    const result = entriesForAggregates([
      entry({ id: 'a', robot_status: 'played' }),
      entry({ id: 'b', robot_status: 'broke_down', match_id: 'm-2', breakdown_seconds: 40 }),
    ]);
    expect(ids(result).sort()).toEqual(['a', 'b']);
  });

  it('excludes no_show and disabled entirely, and never as a zero', () => {
    const result = entriesForAggregates([
      entry({ id: 'a', robot_status: 'no_show' }),
      entry({ id: 'b', robot_status: 'disabled', match_id: 'm-2' }),
    ]);
    expect(result).toEqual([]);
  });

  it('removes only the dead robots from a mixed population, leaving the denominator smaller', () => {
    const result = entriesForAggregates([
      entry({ id: 'p', robot_status: 'played', match_id: 'm-1' }),
      entry({ id: 'n', robot_status: 'no_show', match_id: 'm-2' }),
      entry({ id: 'b', robot_status: 'broke_down', match_id: 'm-3', breakdown_seconds: 10 }),
      entry({ id: 'd', robot_status: 'disabled', match_id: 'm-4' }),
    ]);
    expect(ids(result)).toEqual(['p', 'b']);
  });

  it('applies the duplicate rule before the status rule, so the latest entry decides', () => {
    const result = entriesForAggregates([
      entry({ id: 'old', robot_status: 'played', client_updated_at: '2026-11-14T09:00:00.000Z' }),
      entry({ id: 'new', robot_status: 'no_show', client_updated_at: '2026-11-14T09:05:00.000Z' }),
    ]);
    expect(result).toEqual([]);
  });

  it('counts a duplicate once: the later played copy, not both', () => {
    const result = entriesForAggregates([
      entry({ id: 'old', client_updated_at: '2026-11-14T09:00:00.000Z', data: { auto: 1 } }),
      entry({ id: 'new', client_updated_at: '2026-11-14T09:05:00.000Z', data: { auto: 4 } }),
    ]);
    expect(ids(result)).toEqual(['new']);
  });

  it('never lets a soft-deleted entry into the population', () => {
    expect(
      entriesForAggregates([entry({ id: 'a', deleted_at: '2026-11-14T10:00:00.000Z' })]),
    ).toEqual([]);
  });

  it('returns an empty list for empty input', () => {
    expect(entriesForAggregates([])).toEqual([]);
  });
});

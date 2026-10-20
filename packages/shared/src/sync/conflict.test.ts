import { describe, expect, it } from 'vitest';
import type { Operation } from './operation';
import { classifyPush, latestWins, logicalKeyOf } from './conflict';

const op = (over: Partial<Operation> = {}): Operation => ({
  op_id: 'o-1',
  entity: 'scouting_entry',
  row_id: 'r-1',
  action: 'update',
  base_version: 2,
  payload: {
    event_id: 'ev-1',
    form_kind: 'match',
    team_id: 't-1',
    match_id: 'm-1',
    data: { a: 1 },
  },
  author_user_id: 'u-1',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:05:00.000Z',
  seq: 1,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  version: 2,
  event_id: 'ev-1',
  form_kind: 'match',
  team_id: 't-1',
  match_id: 'm-1',
  client_updated_at: '2026-11-14T09:03:00.000Z',
  deleted_at: null,
  ...over,
});

describe('the logical key (SPEC-FINAL 9.5)', () => {
  it('is (event, kind, team, match) for a match entry', () => {
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'match', team_id: 't', match_id: 'm' })).toBe(
      'e|match|t|m',
    );
  });

  it('drops the match for a super entry, so two null match_ids compare equal', () => {
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: null })).toBe(
      'e|super|t|',
    );
    expect(logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: null })).toBe(
      logicalKeyOf({ event_id: 'e', form_kind: 'super', team_id: 't', match_id: undefined }),
    );
  });
});

describe('classifyPush', () => {
  it('fast-forwards a create of a new row', () => {
    expect(
      classifyPush({
        operation: op({ action: 'create', base_version: null }),
        existingRow: null,
        duplicateRow: null,
      }),
    ).toMatchObject({ kind: 'fast-forward', nextVersion: 1 });
  });

  it('fast-forwards an update whose base version matches, bumping the version', () => {
    expect(classifyPush({ operation: op(), existingRow: row(), duplicateRow: null })).toMatchObject(
      { kind: 'fast-forward', nextVersion: 3 },
    );
  });

  it('flags a divergence when the base version is stale', () => {
    const decision = classifyPush({
      operation: op({ base_version: 1 }),
      existingRow: row({ version: 3 }),
      duplicateRow: null,
    });
    expect(decision.kind).toBe('divergence');
  });

  it('makes the greater client_updated_at the live value, whichever arrived first', () => {
    const incomingIsNewer = classifyPush({
      operation: op({ base_version: 1, client_updated_at: '2026-11-14T09:09:00.000Z' }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(incomingIsNewer).toMatchObject({ kind: 'divergence', winner: 'incoming' });

    const existingIsNewer = classifyPush({
      operation: op({ base_version: 1, client_updated_at: '2026-11-14T09:01:00.000Z' }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(existingIsNewer).toMatchObject({ kind: 'divergence', winner: 'existing' });
  });

  it('preserves the losing copy in full, with its author and its client timestamp', () => {
    const decision = classifyPush({
      operation: op({
        base_version: 1,
        author_user_id: 'u-2',
        client_updated_at: '2026-11-14T09:01:00.000Z',
      }),
      existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00.000Z' }),
      duplicateRow: null,
    });
    expect(decision.kind === 'divergence' && decision.superseded).toMatchObject({
      payload: { data: { a: 1 } },
      author_id: 'u-2',
      client_updated_at: '2026-11-14T09:01:00.000Z',
      base_version: 1,
    });
  });

  it('never merges fields', () => {
    const decision = classifyPush({
      operation: op({ base_version: 1, payload: { ...op().payload, data: { b: 2 } } }),
      existingRow: row({ version: 3, data: { a: 1 } }),
      duplicateRow: null,
    });
    expect(decision.kind === 'divergence' && decision.live.data).toEqual({ b: 2 });
  });

  it('keeps BOTH rows on a duplicate and links them', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-2' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1' }),
    });
    expect(decision).toMatchObject({ kind: 'duplicate', nextVersion: 1, duplicateRowId: 'r-1' });
  });

  it('is not a duplicate when the other row is soft-deleted', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-2' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1', deleted_at: '2026-11-14T09:00:00.000Z' }),
    });
    expect(decision.kind).toBe('fast-forward');
  });

  it('is not a duplicate of itself', () => {
    const decision = classifyPush({
      operation: op({ action: 'create', base_version: null, row_id: 'r-1' }),
      existingRow: null,
      duplicateRow: row({ id: 'r-1' }),
    });
    expect(decision.kind).toBe('fast-forward');
  });
});

describe('latestWins', () => {
  it('picks the greater client_updated_at, and the first argument on a tie', () => {
    const a = { client_updated_at: '2026-11-14T09:05:00.000Z', id: 'a' };
    const b = { client_updated_at: '2026-11-14T09:04:00.000Z', id: 'b' };
    expect(latestWins(a, b).id).toBe('a');
    expect(latestWins(b, a).id).toBe('a');
    expect(latestWins(a, { ...b, client_updated_at: a.client_updated_at }).id).toBe('a');
  });
});

describe('timestamps are compared as instants, not strings', () => {
  // PostgREST: +00:00, no milliseconds. Client: Z, with milliseconds. As strings '+' < '.'.
  const pg = '2026-11-14T09:04:00+00:00';
  const clientLater = '2026-11-14T09:04:00.500Z';
  const clientEarlier = '2026-11-14T09:03:59.500Z';

  it('latestWins picks the later instant across the two formats, in both orders', () => {
    const a = { client_updated_at: pg, id: 'pg' };
    const later = { client_updated_at: clientLater, id: 'later' };
    const earlier = { client_updated_at: clientEarlier, id: 'earlier' };
    expect(latestWins(a, later).id).toBe('later');
    expect(latestWins(later, a).id).toBe('later');
    expect(latestWins(a, earlier).id).toBe('pg');
    expect(latestWins(earlier, a).id).toBe('pg');
  });

  it('classifyPush picks the later instant across the two formats, in both orders', () => {
    const existingPg = row({ version: 3, client_updated_at: pg });
    expect(
      classifyPush({
        operation: op({ base_version: 1, client_updated_at: clientLater }),
        existingRow: existingPg,
        duplicateRow: null,
      }),
    ).toMatchObject({ kind: 'divergence', winner: 'incoming' });
    expect(
      classifyPush({
        operation: op({ base_version: 1, client_updated_at: clientEarlier }),
        existingRow: existingPg,
        duplicateRow: null,
      }),
    ).toMatchObject({ kind: 'divergence', winner: 'existing' });
  });

  it('counts the same instant in the two formats as a tie', () => {
    const a = { client_updated_at: '2026-11-14T09:04:00+00:00', id: 'a' };
    const b = { client_updated_at: '2026-11-14T09:04:00.000Z', id: 'b' };
    expect(latestWins(a, b).id).toBe('a');
    expect(latestWins(b, a).id).toBe('b');
    // A divergence tie keeps the existing row.
    expect(
      classifyPush({
        operation: op({ base_version: 1, client_updated_at: '2026-11-14T09:04:00.000Z' }),
        existingRow: row({ version: 3, client_updated_at: '2026-11-14T09:04:00+00:00' }),
        duplicateRow: null,
      }),
    ).toMatchObject({ kind: 'divergence', winner: 'existing' });
  });
});

import type { Operation } from './operation';

export type LogicalRow = {
  event_id: string;
  form_kind: string;
  team_id: string;
  match_id?: string | null;
};

/**
 * SPEC-FINAL 9.5, matched with SQL's null-safe `is not distinct from` semantics so
 * super entries — where match_id is null on both sides — compare correctly.
 */
export function logicalKeyOf(row: LogicalRow): string {
  const match = row.form_kind === 'match' ? (row.match_id ?? '') : '';
  return `${row.event_id}|${row.form_kind}|${row.team_id}|${match}`;
}

/**
 * Compares instants, not strings: PostgREST returns `2026-11-14T09:04:00+00:00` (often without
 * milliseconds) while a client sends `2026-11-14T09:04:00.000Z`, and the two orderings disagree.
 * Strictly later only, so a tie (the same instant in either format) is never a win.
 */
function isLater(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

export type StampedRow = Record<string, unknown> & { client_updated_at: string };

/** The latest entered wins, in the duplicate rule and the divergence rule alike. */
export function latestWins<T extends StampedRow>(a: T, b: T): T {
  return isLater(b.client_updated_at, a.client_updated_at) ? b : a;
}

export type ExistingRow = Record<string, unknown> & {
  id: string;
  version: number;
  client_updated_at: string;
  deleted_at: string | null;
};

export type SupersededCopy = {
  payload: Record<string, unknown>;
  author_id: string;
  client_updated_at: string;
  base_version: number | null;
};

export type PushDecision =
  | { kind: 'fast-forward'; nextVersion: number; live: Record<string, unknown> }
  | {
      kind: 'divergence';
      nextVersion: number;
      winner: 'incoming' | 'existing';
      live: Record<string, unknown>;
      superseded: SupersededCopy;
    }
  | {
      kind: 'duplicate';
      nextVersion: number;
      live: Record<string, unknown>;
      duplicateRowId: string;
    };

export function classifyPush(input: {
  operation: Operation;
  existingRow: ExistingRow | null;
  duplicateRow: ExistingRow | null;
}): PushDecision {
  const { operation, existingRow, duplicateRow } = input;
  const incoming = { ...operation.payload, client_updated_at: operation.client_updated_at };

  if (existingRow === null) {
    const isRealDuplicate =
      duplicateRow !== null &&
      duplicateRow.id !== operation.row_id &&
      duplicateRow.deleted_at === null;
    if (isRealDuplicate) {
      // Both rows are accepted and kept, linked by a sync_conflicts row (9.5).
      return { kind: 'duplicate', nextVersion: 1, live: incoming, duplicateRowId: duplicateRow.id };
    }
    return { kind: 'fast-forward', nextVersion: 1, live: incoming };
  }

  if (operation.base_version === existingRow.version) {
    return { kind: 'fast-forward', nextVersion: existingRow.version + 1, live: incoming };
  }

  // Genuine divergence: two edits branched from the same ancestor on different devices.
  const incomingWins = isLater(operation.client_updated_at, existingRow.client_updated_at);
  const superseded: SupersededCopy = incomingWins
    ? {
        payload: stripServerColumns(existingRow),
        author_id: String(existingRow.scouter_id ?? ''),
        client_updated_at: existingRow.client_updated_at,
        base_version: existingRow.version,
      }
    : {
        payload: operation.payload,
        author_id: operation.author_user_id,
        client_updated_at: operation.client_updated_at,
        base_version: operation.base_version,
      };

  return {
    kind: 'divergence',
    nextVersion: existingRow.version + 1,
    winner: incomingWins ? 'incoming' : 'existing',
    // No automatic field-level merge, ever. One whole payload wins.
    live: incomingWins ? incoming : stripServerColumns(existingRow),
    superseded,
  };
}

function stripServerColumns(row: Record<string, unknown>): Record<string, unknown> {
  const { version: _v, created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
}

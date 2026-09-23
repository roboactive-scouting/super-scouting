import {
  validateEntryData,
  validateEntryShape,
  type FormFieldDefinition,
  type RobotStatus,
} from '@frc/shared';
import { db } from '@/data/db';
import { enqueue, nextSeq } from '@/data/outbox';
import { findLocalEntry } from './localEntries';

export type SubmitEntryInput = {
  fields: FormFieldDefinition[];
  eventId: string;
  formVersionId: string;
  formKind: 'match' | 'super';
  matchId: string | null;
  teamId: string;
  alliance: 'red' | 'blue' | null;
  authorUserId: string;
  robotStatus: RobotStatus | null;
  breakdownSeconds?: number;
  data: Record<string, unknown>;
  draftKey?: string;
  rowId?: string;
};

/**
 * SPEC-FINAL 8.2, 9.4, 9.5. The client refuses to create a second entry for the same
 * logical key locally; the duplicate path exists for the case it cannot see — two
 * devices, both offline.
 */
export async function submitEntry(input: SubmitEntryInput): Promise<{ row_id: string }> {
  const dead = input.robotStatus === 'no_show' || input.robotStatus === 'disabled';
  const data = dead ? {} : input.data;

  // The same three SPEC-FINAL 3.5 rules the server enforces on push. Checking them here
  // too is what turns a server rejection into a message the scouter sees before they
  // leave the screen.
  const shapeIssues = validateEntryShape({
    form_kind: input.formKind,
    match_id: input.matchId,
    alliance: input.formKind === 'match' ? input.alliance : null,
    robot_status: input.formKind === 'match' ? input.robotStatus : null,
    breakdown_seconds: input.robotStatus === 'broke_down' ? (input.breakdownSeconds ?? null) : null,
  });
  if (shapeIssues.length > 0) throw new Error(shapeIssues.join('\n'));

  const validation = validateEntryData(input.fields, input.robotStatus ?? 'played', data);
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => i.message).join('\n'));
  }

  if (!input.rowId) {
    // The backstop for the picker's own check (SelectRobotPage): the same predicate.
    const existing = await findLocalEntry({
      eventId: input.eventId,
      formKind: input.formKind,
      matchId: input.matchId,
      teamId: input.teamId,
    });
    if (existing) {
      throw new Error('there is already an entry for this team in this match on this device');
    }
  }

  const rowId = input.rowId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const existingRow = input.rowId ? await db.rows.get(['scouting_entries', rowId]) : undefined;

  const payload: Record<string, unknown> = {
    id: rowId,
    form_version_id: input.formVersionId,
    form_kind: input.formKind,
    event_id: input.eventId,
    match_id: input.matchId,
    team_id: input.teamId,
    alliance: input.formKind === 'match' ? input.alliance : null,
    scouter_id: input.authorUserId,
    robot_status: input.formKind === 'match' ? input.robotStatus : null,
    breakdown_seconds: input.robotStatus === 'broke_down' ? (input.breakdownSeconds ?? null) : null,
    data,
  };

  await enqueue({
    op_id: crypto.randomUUID(),
    entity: 'scouting_entry',
    row_id: rowId,
    action: existingRow ? 'update' : 'create',
    base_version: existingRow ? Number(existingRow.version ?? 1) : null,
    payload,
    author_user_id: input.authorUserId,
    client_created_at: String(existingRow?.client_created_at ?? now),
    client_updated_at: now,
    seq: await nextSeq(),
  });

  // Optimistic local write: the user's own action appears instantly (SPEC-FINAL 10).
  await db.rows.put({
    ...payload,
    entity: 'scouting_entries',
    id: rowId,
    version: Number(existingRow?.version ?? 1),
    client_created_at: String(existingRow?.client_created_at ?? now),
    client_updated_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (input.draftKey) await db.drafts.delete(input.draftKey);

  return { row_id: rowId };
}

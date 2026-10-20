import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { practiceMode } from './practice';
import { submitEntry } from './submitEntry';

const base = {
  fields: [],
  eventId: 'ev-1',
  formVersionId: 'fv-1',
  formKind: 'match' as const,
  matchId: 'm-1',
  teamId: 't-1',
  alliance: 'red' as const,
  authorUserId: 'u-1',
  robotStatus: 'played' as const,
  data: {},
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  practiceMode.exit();
});

describe('practice mode (SPEC-FINAL 8.5)', () => {
  it('writes nothing to scouting_entries and nothing to the outbox', async () => {
    practiceMode.enter();
    await submitEntry(base);
    expect(await pending(10)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(0);
  });

  it('writes practice drafts to their own store', async () => {
    practiceMode.enter();
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: { a: 1 }, updated_at: 'now' });
    expect(await db.drafts.count()).toBe(0);
    expect(await db.practiceDrafts.count()).toBe(1);
  });

  it('clears the practice store on exit', async () => {
    practiceMode.enter();
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });
    await practiceMode.exit();
    expect(await db.practiceDrafts.count()).toBe(0);
  });

  it('clears the practice store on app start, whatever happened last time', async () => {
    await db.practiceDrafts.put({ key: 'k', row_id: '', payload: {}, updated_at: 'now' });
    await practiceMode.clearOnStart();
    expect(await db.practiceDrafts.count()).toBe(0);
  });

  it('leaves real drafts and a real outbox completely alone', async () => {
    await submitEntry(base);
    practiceMode.enter();
    await practiceMode.exit();
    expect(await pending(10)).toHaveLength(1);
  });
});

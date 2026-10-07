import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getStation, setStation } from './station';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('remembered station', () => {
  it('is null until chosen, then remembered', async () => {
    expect(await getStation()).toBeNull();
    await setStation('B2');
    expect(await getStation()).toBe('B2');
  });
});

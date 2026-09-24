import { describe, expect, it } from 'vitest';
import { SEED_PREFIX, strayIds } from './strays';

describe('strayIds', () => {
  it('keeps only ids outside the seed id space', () => {
    const seedId = `${SEED_PREFIX}000000000006`;
    const strayId = '11111111-1111-4111-8111-111111111111';
    expect(strayIds([seedId, strayId])).toEqual([strayId]);
  });

  it('returns nothing when every id is seeded', () => {
    const seedId = `${SEED_PREFIX}000000000001`;
    expect(strayIds([seedId])).toEqual([]);
  });

  it('returns everything when nothing is seeded', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    expect(strayIds([a, b])).toEqual([a, b]);
  });

  it('accepts an explicit prefix', () => {
    expect(strayIds(['other-1', 'seed-1'], 'seed-')).toEqual(['other-1']);
  });
});

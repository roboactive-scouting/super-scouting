import { describe, expect, it } from 'vitest';
import { beginSync, endSync } from './connection';
import { notifyChanged, onChanged, type ChangeKind } from './changes';

describe('change bus', () => {
  it('delivers a kind to listeners until they unsubscribe', () => {
    const seen: ChangeKind[] = [];
    const off = onChanged((k) => seen.push(k));
    notifyChanged('rows');
    off();
    notifyChanged('outbox');
    expect(seen).toEqual(['rows']);
  });
  it('announces syncing starting and stopping as a meta change', () => {
    const seen: ChangeKind[] = [];
    const off = onChanged((k) => seen.push(k));
    beginSync();
    endSync();
    off();
    expect(seen).toEqual(['meta', 'meta']);
  });
  it('keeps delivering when one listener throws, and never throws to the writer', () => {
    const seen: ChangeKind[] = [];
    const offBad = onChanged(() => {
      throw new Error('boom');
    });
    const offGood = onChanged((k) => seen.push(k));
    expect(() => notifyChanged('rows')).not.toThrow();
    offBad();
    offGood();
    expect(seen).toEqual(['rows']);
  });
});

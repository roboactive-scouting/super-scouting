import { describe, expect, it } from 'vitest';
import { SELF_EDIT_WINDOW_MS } from '@frc/shared';
import { canSelfEdit, editableUntil, type LocalEntry } from './localEntries';

const created = '2026-11-14T09:00:00.000Z';
const entry = { scouter_id: 'u-1', client_created_at: created } as LocalEntry;
const at = (msAfter: number) => new Date(Date.parse(created) + msAfter);
const scouter = { id: 'u-1', role: 'scouter' as const };

describe('canSelfEdit (SPEC-FINAL 7.6), on the shared rule', () => {
  it('lets a scouter edit their own entry inside the window, and not after it', () => {
    expect(canSelfEdit(entry, scouter, at(SELF_EDIT_WINDOW_MS - 1))).toBe(true);
    expect(canSelfEdit(entry, scouter, at(SELF_EDIT_WINDOW_MS + 1))).toBe(false);
  });

  it("never lets a scouter edit someone else's entry", () => {
    expect(canSelfEdit(entry, { id: 'u-2', role: 'scouter' }, at(1000))).toBe(false);
  });

  it('lets a lead or admin edit any entry at any time', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(canSelfEdit(entry, { id: 'u-2', role: 'lead' }, at(day))).toBe(true);
    expect(canSelfEdit(entry, { id: 'u-3', role: 'admin' }, at(day))).toBe(true);
  });

  it('measures the window with the one shared constant', () => {
    expect(editableUntil(entry).getTime()).toBe(Date.parse(created) + SELF_EDIT_WINDOW_MS);
  });
});

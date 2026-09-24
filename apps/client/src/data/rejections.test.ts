import { describe, expect, it } from 'vitest';
import { rejectionMessage } from './rejections';

const at = '2026-11-14T09:00:00.000Z';

describe('rejectionMessage — never a raw code in front of a student (SPEC-FINAL 17.8)', () => {
  it('says a locked entry needs a lead', () => {
    expect(rejectionMessage({ code: 'edit-window-expired', message: 'x', at })).toBe(
      'This entry is locked — ask a lead',
    );
  });

  it('says a forbidden one is not allowed for this account', () => {
    expect(rejectionMessage({ code: 'forbidden', message: 'unknown author', at })).toBe(
      'Not allowed for this account — ask a lead',
    );
  });

  it("uses the server's message for anything else", () => {
    expect(rejectionMessage({ code: 'invalid', message: 'stale base version 3', at })).toBe(
      'stale base version 3',
    );
  });

  it('never falls back to the code itself', () => {
    const text = rejectionMessage({ code: 'invalid', message: '', at });
    expect(text).not.toMatch(/invalid/);
    expect(text.length).toBeGreaterThan(10);
  });
});

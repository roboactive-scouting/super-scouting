import { describe, expect, it } from 'vitest';
import { rejectionMessage } from './rejections';

const at = '2026-11-14T09:00:00.000Z';

describe('rejectionMessage — never a raw code in front of a student (SPEC-FINAL 17.8)', () => {
  it('says what happened to an edit after the window, and that a lead can save it (7.6, v1.44)', () => {
    const line = 'Changed after the 5-minute edit window. A lead can save it for you.';
    expect(rejectionMessage({ code: 'edit-window-expired', message: 'x', at })).toBe(line);
    // A record refused before the rewording still holds the server's old words.
    expect(
      rejectionMessage({
        code: 'edit-window-expired',
        message: 'this entry is locked — ask a lead',
        at,
      }),
    ).toBe(line);
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

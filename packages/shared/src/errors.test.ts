import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES } from './errors';

describe('AppError', () => {
  it('carries a code, a message and details', () => {
    const e = new AppError('not-found', 'no such team', { teamId: 't-1' });
    expect(e.code).toBe('not-found');
    expect(e.message).toBe('no such team');
    expect(e.details).toEqual({ teamId: 't-1' });
    expect(e).toBeInstanceOf(Error);
  });

  it('lists every rejection reason the push protocol can return', () => {
    for (const reason of ['parent-deleted', 'edit-window-expired', 'forbidden', 'invalid']) {
      expect(ERROR_CODES).toContain(reason);
    }
  });
});

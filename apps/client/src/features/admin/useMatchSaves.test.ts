import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMatchSaves } from './useMatchSaves';

describe('useMatchSaves', () => {
  it('keeps the queue going after a save rejects: the next save of that match still runs', async () => {
    const { result } = renderHook(() => useMatchSaves('ev-1', []));
    const second = vi.fn(async () => {});
    await act(async () => {
      const first = result.current.enqueue('m-1', async () => {
        throw new Error('boom');
      });
      const next = result.current.enqueue('m-1', second);
      await expect(first).rejects.toThrow('boom');
      await next;
    });
    expect(second).toHaveBeenCalledWith('m-1');
    expect(result.current.busy.has('m-1')).toBe(false);
  });
});

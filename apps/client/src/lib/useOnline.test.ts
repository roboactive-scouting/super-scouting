import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOnline } from './useOnline';

function stubOnLine(read: () => boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: read });
}

afterEach(() => {
  // the jsdom default, back on the prototype
  delete (navigator as { onLine?: boolean }).onLine;
});

describe('useOnline', () => {
  it('follows the online and offline events', () => {
    let online = true;
    stubOnLine(() => online);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    online = false;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('catches a change between the first render and the subscription (no event heard)', () => {
    let reads = 0;
    stubOnLine(() => reads++ === 0); // online at the first render only
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });
});

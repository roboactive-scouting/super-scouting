import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { notifyChanged } from './changes';
import { useDeviceQuery } from './useDeviceQuery';

let value = 1;
function Probe() {
  const v = useDeviceQuery(async () => value, [], ['outbox']);
  return <p>{v ?? 'loading'}</p>;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useDeviceQuery', () => {
  it('reads once, then again only when its kind changes', async () => {
    render(<Probe />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    value = 2;
    await act(async () => notifyChanged('rows'));
    expect(screen.getByText('1')).toBeInTheDocument();
    await act(async () => notifyChanged('outbox'));
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('resets to undefined while the new key loads, then shows the new value', async () => {
    const gate = deferred<string>();
    const load = (id: string) => (id === 'a' ? Promise.resolve('A') : gate.promise);
    function Keyed({ id }: { id: string }) {
      const v = useDeviceQuery(() => load(id), [id], ['rows']);
      return <p>{v ?? 'loading'}</p>;
    }
    const { rerender } = render(<Keyed id="a" />);
    expect(await screen.findByText('A')).toBeInTheDocument();
    rerender(<Keyed id="b" />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    await act(async () => gate.resolve('B'));
    expect(await screen.findByText('B')).toBeInTheDocument();
  });

  it('drops an older slow load that resolves after a newer one', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const queue = [slow, fast];
    function Racer() {
      const v = useDeviceQuery(() => queue.shift()!.promise, [], ['rows']);
      return <p>{v ?? 'loading'}</p>;
    }
    render(<Racer />);
    await act(async () => notifyChanged('rows'));
    await act(async () => fast.resolve('new'));
    expect(await screen.findByText('new')).toBeInTheDocument();
    await act(async () => slow.resolve('old'));
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('unsubscribes on unmount', async () => {
    const load = vi.fn(async () => 1);
    function Once() {
      const v = useDeviceQuery(load, [], ['rows']);
      return <p>{v ?? 'loading'}</p>;
    }
    const { unmount } = render(<Once />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => notifyChanged('rows'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good value when a read throws or rejects', async () => {
    let mode: 'ok' | 'sync-throw' | 'reject' = 'ok';
    function Fragile() {
      const v = useDeviceQuery(
        () => {
          if (mode === 'sync-throw') throw new Error('sync');
          if (mode === 'reject') return Promise.reject(new Error('dexie'));
          return Promise.resolve('good');
        },
        [],
        ['rows'],
      );
      return <p>{v ?? 'loading'}</p>;
    }
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    render(<Fragile />);
    expect(await screen.findByText('good')).toBeInTheDocument();
    mode = 'sync-throw';
    await act(async () => notifyChanged('rows'));
    mode = 'reject';
    await act(async () => notifyChanged('rows'));
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', unhandled);
    expect(screen.getByText('good')).toBeInTheDocument();
    expect(unhandled).not.toHaveBeenCalled();
  });
});

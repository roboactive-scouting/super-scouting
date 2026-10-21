import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCollector } from '@frc/shared/qr';
import { db } from '@/data/db';
import { enqueue } from '@/data/outbox';
import { pending } from '@/data/outbox';
import { QrSendPage } from './QrSendPage';

const toCanvas = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('qrcode', () => ({ default: { toCanvas: (...args: unknown[]) => toCanvas(...args) } }));

const op = (i: number) => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry' as const,
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create' as const,
  base_version: null,
  payload: {
    event_id: 'ev-1',
    team_id: 't-1',
    match_id: 'm-1',
    form_kind: 'match',
    data: { auto_notes: i },
  },
  author_user_id: '00000000-0000-4000-8000-000000000006',
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: i,
});

/** An operation whose notes do not compress, so a few dozen of them take several frames. */
const bulky = (i: number) => {
  const base = op(i);
  const notes = Array.from({ length: 8 }, () => crypto.randomUUID()).join(' ');
  return { ...base, payload: { ...base.payload, data: { notes } } };
};

/*
 * Only the interval is faked: fake-indexeddb runs on setImmediate and RTL's waitFor on
 * setTimeout, and both must stay real (DEVIATIONS 1.47).
 */
beforeEach(async () => {
  await db.delete();
  await db.open();
  toCanvas.mockClear();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => vi.useRealTimers());

/** Moves the five-a-second clock on, letting React render each tick. */
const tick = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
/** `n` frames, one render each (one big `tick` renders only where it ends). */
async function stepFrames(n: number) {
  for (let i = 0; i < n; i += 1) await tick(200);
}

/** The frame bytes of a toCanvas call. */
const frameOf = (call: unknown[]) => (call[1] as { data: Uint8Array }[])[0]!.data;
const batchIdOf = (frame: Uint8Array) =>
  new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false);

describe('QrSendPage (SPEC-FINAL 9.8)', () => {
  it('says plainly when there is nothing to send', async () => {
    render(<QrSendPage />);
    expect(
      await screen.findByText(/everything on this device has already reached the cloud/i),
    ).toBeInTheDocument();
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('splits a backlog above 200 operations into consecutive batches with their own ids', async () => {
    for (let i = 0; i < 205; i += 1) await enqueue(op(i));
    render(<QrSendPage />);
    expect(await screen.findByText(/batch 1 of 2/i)).toBeInTheDocument();
  });

  it('renders a QR code in byte mode at error-correction level M', async () => {
    await enqueue(op(1));
    render(<QrSendPage />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    const [, segments, options] = toCanvas.mock.calls[0]!;
    expect((segments as { mode: string }[])[0]!.mode).toBe('byte');
    expect(options).toMatchObject({ errorCorrectionLevel: 'M', version: 40 });
  });

  it('advances one frame every 200 ms and wraps from the last frame back to the first', async () => {
    // Bulky, so the batch is several frames and the wrap is real (60 × op() fits in one).
    for (let i = 0; i < 60; i += 1) await enqueue(bulky(i));
    render(<QrSendPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/frame 1 of \d+/i));
    const total = Number(screen.getByRole('status').textContent!.match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThan(2);
    // The interval starts in a passive effect: flush it before the clock moves.
    await tick(0);
    await tick(199);
    expect(screen.getByRole('status')).toHaveTextContent(`Frame 1 of ${total}`);
    await tick(1);
    expect(screen.getByRole('status')).toHaveTextContent(`Frame 2 of ${total}`);
    await tick(200 * (total - 3));
    expect(screen.getByRole('status')).toHaveTextContent(`Frame ${total - 1} of ${total}`);
    await tick(200);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(`Frame ${total} of ${total}`),
    );
    await tick(200);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(`Frame 1 of ${total}`),
    );
  });

  it('keeps every pending operation in the outbox after sending — a scan is not an ack', async () => {
    await enqueue(op(1));
    render(<QrSendPage />);
    await tick(5000);
    expect(await pending(10)).toHaveLength(1);
  });

  it('stops cleanly and releases the timer when the page unmounts', async () => {
    await enqueue(op(1));
    const { unmount } = render(<QrSendPage />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    const before = toCanvas.mock.calls.length;
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    await tick(2000);
    expect(toCanvas.mock.calls.length).toBe(before);
    // The interval itself is gone, not merely ticking into an unmounted page.
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** A wake lock the test controls: `request` resolves a sentinel, or rejects when refused. */
function installWakeLock(refuse = false) {
  const sentinel = { released: false, release: vi.fn(async () => void (sentinel.released = true)) };
  const request = vi.fn(async () => {
    if (refuse) throw new DOMException('not allowed', 'NotAllowedError');
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  });
  return { sentinel, request };
}

describe('QrSendPage: batches, the wake lock, and never an ack (20-qr-send final)', () => {
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  it('Next batch shows batch 2’s frames; the last batch has Done only', async () => {
    for (let i = 0; i < 205; i += 1) await enqueue(op(i));
    render(<QrSendPage />);
    expect(await screen.findByText(/200 of 205 records/)).toBeInTheDocument();
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    const first = batchIdOf(frameOf(toCanvas.mock.calls.at(-1)!));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next batch/i }));
    expect(await screen.findByText(/batch 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText('the last 5 records')).toBeInTheDocument();
    await waitFor(() => expect(batchIdOf(frameOf(toCanvas.mock.calls.at(-1)!))).not.toBe(first));
    // Batch 2's frames decode to the last five operations, in order.
    const collector = newCollector();
    const second = toCanvas.mock.calls.map(frameOf).filter((frame) => batchIdOf(frame) !== first);
    for (const frame of second) collector.add(frame);
    expect(collector.isComplete()).toBe(true);
    expect(collector.result().map((o) => o.seq)).toEqual([200, 201, 202, 203, 204]);

    expect(screen.queryByRole('button', { name: /next batch/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done — back to Sync' })).toBeInTheDocument();
  });

  it('carries every unacked operation, the refused (parked) ones too, read once on open', async () => {
    for (let i = 0; i < 60; i += 1) await enqueue(bulky(i), i === 3 ? 'qr' : 'local');
    await db.syncState.update(op(2).row_id, {
      rejection: { code: 'edit-window-expired', message: 'locked', at: '2026-11-14T09:05:00.000Z' },
    });
    // pending() leaves the parked one out; the QR send does not (Sync's Waiting counts it).
    expect(await pending(100)).toHaveLength(59);
    render(<QrSendPage />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/frame 1 of/i));
    expect(Number(screen.getByRole('status').textContent!.match(/of (\d+)/)![1])).toBeGreaterThan(
      2,
    );
    // Saved while the code shows: it waits for the next send, and the code never changes.
    await enqueue(op(60));
    await stepFrames(30);
    const frames = toCanvas.mock.calls.map(frameOf);
    expect(new Set(frames.map(batchIdOf)).size).toBe(1);
    const collector = newCollector();
    for (const frame of frames) collector.add(frame);
    expect(collector.result().map((o) => o.seq)).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });

  it('never acks: after every frame and Done the outbox and sync states are as they were', async () => {
    for (let i = 0; i < 60; i += 1) await enqueue(op(i), i === 7 ? 'qr' : 'local');
    const before = await db.syncState.toArray();
    const onDone = vi.fn();
    render(<QrSendPage onDone={onDone} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/frame 1 of/i));
    const total = Number(screen.getByRole('status').textContent!.match(/of (\d+)/)![1]);
    await stepFrames(total * 2);
    fireEvent.click(screen.getByRole('button', { name: 'Done — back to Sync' }));
    expect(onDone).toHaveBeenCalledOnce();

    expect(await pending(100)).toHaveLength(60);
    expect(await db.outbox.count()).toBe(60);
    // Only qr_shown_at was written: sync_state, acked_at and origin are untouched.
    await waitFor(async () =>
      expect((await db.syncState.toArray()).every((s) => typeof s.qr_shown_at === 'string')).toBe(
        true,
      ),
    );
    const after = await db.syncState.toArray();
    expect(after.map(({ qr_shown_at: _, ...rest }) => rest)).toEqual(before);
    expect(after.every((s) => s.sync_state === 'pending' && s.acked_at === null)).toBe(true);
  });

  it('holds the screen on while open, and Done releases the wake lock', async () => {
    const { sentinel, request } = installWakeLock();
    await enqueue(op(1));
    const onDone = vi.fn();
    render(<QrSendPage onDone={onDone} />);
    expect(await screen.findByText('Screen stays on while this is open')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinel.release).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done — back to Sync' }));
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('releases the wake lock when the page unmounts', async () => {
    const { sentinel } = installWakeLock();
    await enqueue(op(1));
    const { unmount } = render(<QrSendPage />);
    await screen.findByText('Screen stays on while this is open');
    unmount();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('a refused wake lock still renders the code, without "Screen stays on"', async () => {
    const { request } = installWakeLock(true);
    await enqueue(op(1));
    render(<QrSendPage />);
    await waitFor(() => expect(toCanvas).toHaveBeenCalled());
    expect(request).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.queryByText(/screen stays on/i)).toBeNull();
  });

  it('closes on Escape (the computer’s way out) as well as Done', async () => {
    await enqueue(op(1));
    const onDone = vi.fn();
    render(<QrSendPage onDone={onDone} />);
    const dialog = await screen.findByRole('dialog', { name: 'Send by QR' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledOnce();
  });
});

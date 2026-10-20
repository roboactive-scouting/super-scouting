import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultMetadataType } from '@zxing/library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operation } from '@frc/shared';
import { encodeBatch, QR_HEADER_BYTES } from '@frc/shared/qr';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { clearDevicePrefs, qrSound } from '@/lib/devicePrefs';
import { QrReceivePage } from './QrReceivePage';

/*
 * No camera in CI: BrowserQRCodeReader is replaced by a scanner the test drives. Each `show()`
 * hands the page's callback a result shaped like zxing's, its bytes in BYTE_SEGMENTS.
 */
const scanner = vi.hoisted(() => ({
  callback: null as null | ((result: unknown) => void),
  fail: null as unknown,
  starts: [] as unknown[][],
  stop: (() => undefined) as () => void,
  stops: 0,
}));
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice(deviceId: unknown, video: unknown, callback: (r: unknown) => void) {
      scanner.starts.push([deviceId, video]);
      if (scanner.fail) return Promise.reject(scanner.fail);
      scanner.callback = callback;
      return Promise.resolve({
        stop: () => {
          scanner.stops += 1;
          scanner.stop();
        },
      });
    }
  },
}));

const YAEL = '00000000-0000-4000-8000-0000000000a1';
const OMER = '00000000-0000-4000-8000-0000000000a2';
const STRANGER = '00000000-0000-4000-8000-0000000000a3';

/** An entry by `author` whose notes do not compress, so a few dozen take several frames. */
const op = (i: number, author = YAEL, kind: 'match' | 'super' = 'match'): Operation => ({
  op_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  entity: 'scouting_entry',
  row_id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`,
  action: 'create',
  base_version: null,
  payload: {
    event_id: 'ev-1',
    team_id: 't-1',
    match_id: kind === 'match' ? 'm-1' : null,
    form_kind: kind,
    scouter_id: author,
    data: { notes: Array.from({ length: 8 }, () => crypto.randomUUID()).join(' ') },
  },
  author_user_id: author,
  client_created_at: '2026-11-14T09:00:00.000Z',
  client_updated_at: '2026-11-14T09:00:00.000Z',
  seq: i,
});

/** 40 match entries and 1 super entry by Yael: several frames. */
const batch = () => [...Array.from({ length: 40 }, (_, i) => op(i)), op(40, YAEL, 'super')];

const result = (bytes: Uint8Array) => ({
  getResultMetadata: () => new Map([[ResultMetadataType.BYTE_SEGMENTS, [bytes]]]),
  getText: () => '',
});

/** The camera reads one frame. */
async function show(frame: Uint8Array) {
  await waitFor(() => expect(scanner.callback).not.toBeNull());
  await act(async () => {
    scanner.callback!(result(frame));
    await Promise.resolve();
  });
}

const heldCells = () =>
  [...document.querySelectorAll('[data-frame][data-held="true"]')].map((cell) =>
    Number(cell.getAttribute('data-frame')),
  );
const cells = () => document.querySelectorAll('[data-frame]');

const tones: string[] = [];
class FakeAudio {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: () => undefined,
      start: () => tones.push('beep'),
      stop: () => undefined,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: () => undefined,
    };
  }
  resume = () => Promise.resolve();
  close = () => Promise.resolve();
}
const vibrate = vi.fn();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.rows.bulkPut([
    { entity: 'users', id: YAEL, full_name: 'Yael Shapira', role: 'scouter' },
    { entity: 'users', id: OMER, full_name: 'Omer Katz', role: 'scouter' },
  ]);
  scanner.callback = null;
  scanner.fail = null;
  scanner.starts = [];
  scanner.stops = 0;
  tones.length = 0;
  vibrate.mockClear();
  clearDevicePrefs();
  vi.stubGlobal('AudioContext', FakeAudio);
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('QrReceivePage (SPEC-FINAL 9.8; 21-qr-receive final)', () => {
  it('scans continuously from the rear camera, with no Start', async () => {
    render(<QrReceivePage />);
    await waitFor(() => expect(scanner.starts).toHaveLength(1));
    // No device id: @zxing/browser then asks for `facingMode: 'environment'`.
    expect(scanner.starts[0]![0]).toBeUndefined();
    expect(scanner.starts[0]![1]).toBeInstanceOf(HTMLVideoElement);
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
    // Before the first frame: the ring reads 0, and there are no cells.
    expect(cells()).toHaveLength(0);
  });

  it('marks the held frames in any order, one numbered cell per frame', async () => {
    const frames = encodeBatch(batch(), 11);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    render(<QrReceivePage />);
    await show(frames[2]!);
    expect(cells()).toHaveLength(frames.length);
    expect(heldCells()).toEqual([3]);
    await show(frames[0]!);
    await show(frames[2]!); // a frame seen again changes nothing
    expect(heldCells()).toEqual([1, 3]);
    expect(screen.getByText(`2 of ${frames.length} frames`)).toBeInTheDocument();
    expect(
      screen.getByText(
        `2 of ${frames.length} frames, in any order. A green screen and a beep mean it is done.`,
      ),
    ).toBeInTheDocument();
    expect(await pending(100)).toHaveLength(0);
  });

  it('on complete names the author and counts the records, beeps and vibrates', async () => {
    const ops = batch();
    const frames = encodeBatch(ops, 12);
    render(<QrReceivePage />);
    for (const frame of [...frames].reverse()) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('records · 40 entries, 1 super')).toBeInTheDocument();
    expect(screen.getByText('Next phone, step up.')).toBeInTheDocument();
    expect(
      screen.getByText('The phone shows Next batch? Tap it there, then scan again.'),
    ).toBeInTheDocument();
    expect(await pending(100)).toHaveLength(41);
    expect(tones).toEqual(['beep']);
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it('lists several authors, and "a scouter" for one this device does not hold', async () => {
    render(<QrReceivePage />);
    await show(encodeBatch([op(1, YAEL), op(2, OMER), op(3, STRANGER)], 13)[0]!);
    expect(
      await screen.findByRole('heading', { name: 'Got it: Yael, Omer, a scouter' }),
    ).toBeInTheDocument();
    expect(screen.getByText('records · 3 entries')).toBeInTheDocument();
  });

  it('drops a batch whose checksum fails: nothing written, the cells reset, scanning again', async () => {
    const frames = encodeBatch(batch(), 14);
    const last = frames[frames.length - 1]!.slice();
    last[QR_HEADER_BYTES + 3] = last[QR_HEADER_BYTES + 3]! ^ 0xff;
    render(<QrReceivePage />);
    for (const frame of [...frames.slice(0, -1), last]) await show(frame);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code was damagedStarting again, hold still',
    );
    expect(screen.getByText('Scanning again')).toBeInTheDocument();
    expect(screen.getByText('The pieces did not add up. Nothing was saved.')).toBeInTheDocument();
    expect(heldCells()).toEqual([]);
    expect(cells()).toHaveLength(frames.length);
    expect(await pending(100)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(0);
    // …and the next pass, read whole, is written.
    for (const frame of frames) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    expect(await pending(100)).toHaveLength(41);
  });

  it('writes nothing when the page is left mid-batch, and stops the camera', async () => {
    const frames = encodeBatch(batch(), 15);
    const { unmount } = render(<QrReceivePage />);
    for (const frame of frames.slice(0, -1)) await show(frame);
    expect(heldCells()).toHaveLength(frames.length - 1);
    unmount();
    expect(scanner.stops).toBe(1);
    expect(await pending(100)).toHaveLength(0);
    expect(await db.rows.where('entity').equals('scouting_entries').count()).toBe(0);
  });

  it('starts afresh on a frame of another batch, writing nothing of the first', async () => {
    const first = encodeBatch(batch(), 16);
    const second = encodeBatch([op(90)], 17);
    render(<QrReceivePage />);
    await show(first[0]!);
    await show(first[1]!);
    expect(heldCells()).toEqual([1, 2]);
    await show(second[0]!);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    const queued = await pending(100);
    expect(queued.map((q) => q.op_id)).toEqual([op(90).op_id]);
  });

  it('plays nothing when Sound is off on this device, and still vibrates', async () => {
    const user = userEvent.setup();
    render(<QrReceivePage />);
    const toggle = screen.getByRole('switch', { name: 'Sound on' });
    await user.click(toggle);
    expect(screen.getByRole('switch', { name: 'Sound off' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(qrSound.get()).toBe(false);
    await show(encodeBatch([op(1)], 18)[0]!);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    expect(tones).toEqual([]);
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it('a blocked camera says so, with Try again', async () => {
    scanner.fail = new DOMException('Permission denied', 'NotAllowedError');
    const user = userEvent.setup();
    render(<QrReceivePage />);
    expect(
      await screen.findByRole('heading', { name: 'The camera is blocked' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Allow the camera for this site in the browser’s settings, then try again.'),
    ).toBeInTheDocument();
    scanner.fail = null;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(scanner.starts).toHaveLength(2));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'The camera is blocked' })).toBeNull(),
    );
  });

  it('Scan the next phone scans again; Done and Escape go back to Sync', async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<QrReceivePage onDone={onDone} />);
    await show(encodeBatch([op(1)], 19)[0]!);
    await user.click(await screen.findByRole('button', { name: 'Scan the next phone' }));
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
    expect(cells()).toHaveLength(0);
    // The same batch again: written again with no effect, the same count.
    await show(encodeBatch([op(1)], 20)[0]!);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    expect(await pending(100)).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Done — back to Sync is there while scanning', async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<QrReceivePage onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Done — back to Sync' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

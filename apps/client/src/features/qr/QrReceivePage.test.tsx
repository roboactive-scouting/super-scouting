import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import EsmFinderPatternFinder from '@zxing/library/esm/core/qrcode/detector/FinderPatternFinder';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Operation } from '@frc/shared';
import { encodeBatch, frameToText, QR_HEADER_BYTES } from '@frc/shared/qr';
import { db } from '@/data/db';
import { pending } from '@/data/outbox';
import { clearDevicePrefs, qrSound } from '@/lib/devicePrefs';
import { QrReceivePage } from './QrReceivePage';
import { IMPROVED } from './zxingFinder';
import type * as QrReceiveModule from '@/data/qrReceive';

/*
 * No camera in CI: BrowserQRCodeReader is replaced by a scanner the test drives. Each `show()`
 * hands the page's callback a result shaped like zxing's: the frame as the sender draws it, Base45
 * text, from `getText()`. jsdom has no BarcodeDetector, so the page takes the zxing path here; the
 * native path has its own describe below. `fail` is what each start rejects with, in turn.
 */
const scanner = vi.hoisted(() => ({
  callback: null as null | ((result: unknown) => void),
  fail: [] as unknown[],
  starts: [] as unknown[][],
  hints: [] as unknown[],
  stream: null as unknown,
  stop: (() => undefined) as () => void,
  stops: 0,
}));
/** When set, the done screen's name lookup fails after the batch was written (review m2). */
const names = vi.hoisted(() => ({ fail: false }));
vi.mock('@/data/qrReceive', async (original) => {
  const real = await original<typeof QrReceiveModule>();
  return {
    ...real,
    describeBatch: (operations: Parameters<typeof real.describeBatch>[0]) =>
      names.fail ? Promise.reject(new Error('users unreadable')) : real.describeBatch(operations),
  };
});
vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    constructor(hints: unknown) {
      scanner.hints.push(hints);
    }
    decodeFromConstraints(
      constraints: unknown,
      video: HTMLVideoElement,
      callback: (r: unknown) => void,
    ) {
      scanner.starts.push([constraints, video]);
      const fail = scanner.fail.shift();
      if (fail) return Promise.reject(fail);
      // As @zxing/browser does: the stream goes on the preview video.
      if (scanner.stream) (video as { srcObject: unknown }).srcObject = scanner.stream;
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

const result = (text: string) => ({ getText: () => text });

/** The camera reads one code: by default one of our frames, as the sender draws it. */
async function show(frame: Uint8Array | string) {
  await waitFor(() => expect(scanner.callback).not.toBeNull());
  await act(async () => {
    scanner.callback!(result(typeof frame === 'string' ? frame : frameToText(frame)));
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
  scanner.fail = [];
  scanner.hints = [];
  scanner.stream = null;
  names.fail = false;
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
  it('scans continuously from the rear camera at 1080p, with no Start', async () => {
    render(<QrReceivePage />);
    await waitFor(() => expect(scanner.starts).toHaveLength(1));
    // Not zxing's default (`facingMode: 'environment'` alone opens about 640×480): 1080p, ideal.
    expect(scanner.starts[0]![0]).toEqual({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    expect(scanner.starts[0]![1]).toBeInstanceOf(HTMLVideoElement);
    // QR codes only, and no TRY_HARDER (too slow on live video).
    expect(scanner.hints[0]).toEqual(
      new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]),
    );
    // …with zxing's QR finder fixed, in the build of it the app's bundle uses (zxingFinder.ts).
    expect((EsmFinderPatternFinder.prototype as { [IMPROVED]?: true })[IMPROVED]).toBe(true);
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
    for (const frame of encodeBatch([op(1, YAEL), op(2, OMER), op(3, STRANGER)], 13))
      await show(frame);
    expect(
      await screen.findByRole('heading', { name: 'Got it: Yael, Omer, a scouter' }),
    ).toBeInTheDocument();
    expect(screen.getByText('records · 3 entries')).toBeInTheDocument();
  });

  it('reaches the done screen under StrictMode (mount, clean up, mount again)', async () => {
    render(
      <StrictMode>
        <QrReceivePage />
      </StrictMode>,
    );
    for (const frame of encodeBatch([op(1)], 21)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
  });

  it('a batch that was written never reads "Nothing was saved", even when its names cannot be read', async () => {
    names.fail = true;
    render(<QrReceivePage />);
    for (const frame of encodeBatch([op(1), op(2)], 22)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, a scouter!' })).toBeInTheDocument();
    expect(screen.getByText('records · 2 entries')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was saved/)).toBeNull();
    expect(await pending(100)).toHaveLength(2);
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
    for (const frame of encodeBatch([op(1)], 18)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
    expect(tones).toEqual([]);
    expect(vibrate).toHaveBeenCalledWith(200);
  });

  it('a blocked camera says so, with Try again', async () => {
    scanner.fail = [new DOMException('Permission denied', 'NotAllowedError')];
    const user = userEvent.setup();
    render(<QrReceivePage />);
    expect(
      await screen.findByRole('heading', { name: 'The camera is blocked' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Allow the camera for this site in the browser’s settings, then try again.'),
    ).toBeInTheDocument();
    // Refused is refused: no second, plainer request behind the user's back.
    expect(scanner.starts).toHaveLength(1);
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
    for (const frame of encodeBatch([op(1)], 19)) await show(frame);
    await user.click(await screen.findByRole('button', { name: 'Scan the next phone' }));
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
    expect(cells()).toHaveLength(0);
    // The same batch again: written again with no effect, the same count.
    for (const frame of encodeBatch([op(1)], 20)) await show(frame);
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

/** A camera stream with one video track whose focus modes the test sets. */
function fakeStream(focusMode?: string[], refuse = false) {
  const track = {
    kind: 'video',
    stop: vi.fn(),
    getCapabilities: () => (focusMode ? { focusMode } : {}),
    applyConstraints: vi.fn(async (_c: unknown) => {
      if (refuse) throw new DOMException('no', 'OverconstrainedError');
    }),
  };
  return { track, stream: { getVideoTracks: () => [track], getTracks: () => [track] } };
}

describe('QrReceivePage: the camera (DEVIATIONS, Phase 1 G fix)', () => {
  it('ignores a code that is not one of ours and keeps scanning', async () => {
    const frames = encodeBatch([op(1)], 30);
    render(<QrReceivePage />);
    await show('https://example.com/not-a-frame');
    await show('HELLO WORLD'); // alphanumeric, but too short to be a frame
    await show(''); // an empty code
    expect(cells()).toHaveLength(0);
    expect(screen.getByText('Scanning…')).toBeInTheDocument();
    for (const frame of frames) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
  });

  it('asks once more for any camera when 1080p from the rear cannot be had', async () => {
    scanner.fail = [new DOMException('no such camera', 'OverconstrainedError')];
    render(<QrReceivePage />);
    await waitFor(() => expect(scanner.starts).toHaveLength(2));
    expect(scanner.starts[1]![0]).toEqual({ video: true, audio: false });
    for (const frame of encodeBatch([op(1)], 31)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
  });

  it('says the camera did not start when no camera at all can be had', async () => {
    scanner.fail = [
      new DOMException('none', 'NotFoundError'),
      new DOMException('none', 'NotFoundError'),
    ];
    render(<QrReceivePage />);
    expect(
      await screen.findByRole('heading', { name: 'The camera did not start' }),
    ).toBeInTheDocument();
    // One retry, not a loop.
    expect(scanner.starts).toHaveLength(2);
  });

  it('turns on continuous focus where the camera offers it, and shrugs off a refusal', async () => {
    const offered = fakeStream(['manual', 'continuous']);
    scanner.stream = offered.stream;
    const { unmount } = render(<QrReceivePage />);
    await waitFor(() =>
      expect(offered.track.applyConstraints).toHaveBeenCalledWith({
        advanced: [{ focusMode: 'continuous' }],
      }),
    );
    unmount();

    const none = fakeStream(['manual']);
    scanner.stream = none.stream;
    const second = render(<QrReceivePage />);
    await waitFor(() => expect(scanner.starts).toHaveLength(2));
    expect(none.track.applyConstraints).not.toHaveBeenCalled();
    second.unmount();

    const refused = fakeStream(['continuous'], true);
    scanner.stream = refused.stream;
    render(<QrReceivePage />);
    await waitFor(() => expect(refused.track.applyConstraints).toHaveBeenCalled());
    for (const frame of encodeBatch([op(1)], 32)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' })).toBeInTheDocument();
  });
});

/** The native loop reads one code per animation frame (about 16 ms in jsdom), slower under load. */
const SLOW = { timeout: 10_000 };

/*
 * Android Chrome: the browser's own BarcodeDetector reads the video. The detector is the test's;
 * each `detect()` answers with the next code put in `detector.queue` (or nothing), and the test
 * counts how many are in flight at once.
 */
const detector = {
  queue: [] as string[],
  calls: 0,
  inFlight: 0,
  most: 0,
  formats: ['qr_code', 'ean_13'],
  made: [] as unknown[],
};
class FakeBarcodeDetector {
  constructor(options: unknown) {
    detector.made.push(options);
  }
  static getSupportedFormats() {
    return Promise.resolve(detector.formats);
  }
  async detect(source: unknown) {
    if (!(source instanceof HTMLVideoElement)) throw new TypeError('not the video');
    detector.calls += 1;
    detector.inFlight += 1;
    detector.most = Math.max(detector.most, detector.inFlight);
    await new Promise((done) => setTimeout(done, 1));
    detector.inFlight -= 1;
    const text = detector.queue.shift();
    return text === undefined ? [] : [{ rawValue: text, format: 'qr_code' }];
  }
}

describe('QrReceivePage: the native reader where the browser has one (Android Chrome)', () => {
  let camera: ReturnType<typeof fakeStream>;
  const getUserMedia = vi.fn();
  beforeEach(() => {
    Object.assign(detector, { queue: [], calls: 0, inFlight: 0, most: 0, made: [] });
    detector.formats = ['qr_code', 'ean_13'];
    vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector);
    camera = fakeStream(['continuous']);
    getUserMedia.mockReset();
    getUserMedia.mockImplementation(async () => camera.stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.restoreAllMocks();
  });

  it('reads a whole multi-frame batch with BarcodeDetector, never zxing', async () => {
    const frames = encodeBatch(batch(), 40);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    // Out of order, with a foreign code and a repeat among them, as a camera sees a loop.
    detector.queue = [
      frameToText(frames[1]!),
      'https://example.com',
      frameToText(frames[1]!),
      ...[...frames].reverse().map(frameToText),
    ];
    render(<QrReceivePage />);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' }, SLOW)).toBeInTheDocument();
    expect(screen.getByText('records · 40 entries, 1 super')).toBeInTheDocument();
    expect(await pending(100)).toHaveLength(41);
    // The browser's reader, asked for QR codes only, on the rear camera at 1080p.
    expect(detector.made).toEqual([{ formats: ['qr_code'] }]);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    expect(camera.track.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous' }],
    });
    expect(scanner.starts).toHaveLength(0);
    // Never two detect() calls at once.
    expect(detector.calls).toBeGreaterThan(frames.length);
    expect(detector.most).toBe(1);
  });

  it('a damaged batch read natively writes nothing', async () => {
    const frames = encodeBatch(batch(), 41);
    const last = frames[frames.length - 1]!.slice();
    last[QR_HEADER_BYTES + 3] = last[QR_HEADER_BYTES + 3]! ^ 0xff;
    detector.queue = [...frames.slice(0, -1), last].map(frameToText);
    render(<QrReceivePage />);
    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent('That code was damaged');
    expect(await pending(100)).toHaveLength(0);
  });

  it('stops reading and releases the camera on leaving mid-batch, writing nothing', async () => {
    const frames = encodeBatch(batch(), 42);
    detector.queue = frames.slice(0, 2).map(frameToText);
    const { unmount } = render(<QrReceivePage />);
    await waitFor(() => expect(heldCells()).toEqual([1, 2]), SLOW);
    unmount();
    expect(camera.track.stop).toHaveBeenCalled();
    const calls = detector.calls;
    detector.queue = frames.slice(2).map(frameToText);
    await new Promise((done) => setTimeout(done, 100));
    // At most the one already in flight when the page left.
    expect(detector.calls).toBeLessThanOrEqual(calls + 1);
    expect(await pending(100)).toHaveLength(0);
  });

  it('asks once more for any camera when 1080p from the rear cannot be had', async () => {
    getUserMedia.mockImplementationOnce(async () => {
      throw new DOMException('no such camera', 'OverconstrainedError');
    });
    detector.queue = encodeBatch([op(1)], 43).map(frameToText);
    render(<QrReceivePage />);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' }, SLOW)).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith({ video: true, audio: false });
  });

  it('a blocked camera says so, natively too', async () => {
    getUserMedia.mockImplementation(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    render(<QrReceivePage />);
    expect(
      await screen.findByRole('heading', { name: 'The camera is blocked' }),
    ).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('falls back to zxing when the BarcodeDetector cannot read QR codes', async () => {
    detector.formats = ['ean_13'];
    render(<QrReceivePage />);
    await waitFor(() => expect(scanner.starts).toHaveLength(1));
    expect(getUserMedia).not.toHaveBeenCalled();
    for (const frame of encodeBatch([op(1)], 44)) await show(frame);
    expect(await screen.findByRole('heading', { name: 'Got it, Yael!' }, SLOW)).toBeInTheDocument();
  });
});

import { BrowserQRCodeReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
// The build of zxing's finder that `@zxing/library` resolves to in the app (its `module` entry,
// esm/), so the fix below reaches the reader BrowserQRCodeReader runs.
import FinderPatternFinder from '@zxing/library/esm/core/qrcode/detector/FinderPatternFinder';
import { improveFinder } from './zxingFinder';

/**
 * The QR receiver's camera and reader (SPEC-FINAL 9.8; task 1.48; DEVIATIONS "Phase 1 G fix").
 * Only the lazy receive page imports this module.
 *
 * The camera is asked for 1080p from the rear: zxing's own default (`facingMode: 'environment'`
 * and nothing else) opened it at about 640×480, too coarse for a code on another screen. Each
 * decoded code's **text** goes to `onText`; two readers produce it:
 * - **native** — the browser's `BarcodeDetector` where it reads QR codes (Android Chrome): fast,
 *   and off the main thread's JavaScript;
 * - **zxing** — `@zxing/browser` everywhere else (iPhone Safari has no BarcodeDetector), with
 *   its QR finder fixed (`zxingFinder.ts`).
 */

/** Between decode attempts and after a hit: fast enough for a sender at five frames a second. */
export const SCAN_DELAY_MS = 50;

/** The rear camera at 1080p where it has it; every value is `ideal`, never required. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

/** Any camera at all: the one retry after the camera above could not be had. */
export const FALLBACK_CONSTRAINTS: MediaStreamConstraints = { video: true, audio: false };

/** Errors that mean "not that camera", not "no camera for you": worth one plainer request. */
const RETRY_PLAINER = new Set(['OverconstrainedError', 'NotFoundError']);

/** `BarcodeDetector` (Shape Detection API) is not in TypeScript's DOM lib: typed here. */
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

export type ScannerPath = 'native' | 'zxing';
export type Scanner = { path: ScannerPath; stop(): void };

const errorName = (error: unknown) => (error as { name?: unknown } | null)?.name;

/** Opens the camera with `CAMERA_CONSTRAINTS`, and once more with any camera when that fails. */
async function withFallback<T>(open: (constraints: MediaStreamConstraints) => Promise<T>) {
  try {
    return await open(CAMERA_CONSTRAINTS);
  } catch (error) {
    if (!RETRY_PLAINER.has(errorName(error) as string)) throw error;
    return open(FALLBACK_CONSTRAINTS);
  }
}

/**
 * The browser's QR reader, or null where there is none: feature-detected, never assumed. A
 * `BarcodeDetector` that does not list `qr_code` (desktop Chrome on some systems) is none.
 */
export async function nativeQrDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (window as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof Detector !== 'function') return null;
  try {
    const formats = await Detector.getSupportedFormats();
    return formats.includes('qr_code') ? new Detector({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

/**
 * Asks the running camera to keep refocusing where it can (a phone held up to another screen
 * moves); most iPhones do it anyway and do not list `focusMode`. A refusal changes nothing.
 */
function focusContinuously(stream: MediaStream | null): void {
  try {
    const track = stream?.getVideoTracks?.()[0];
    const modes = (track?.getCapabilities?.() as { focusMode?: string[] } | undefined)?.focusMode;
    if (!track || !modes?.includes('continuous')) return;
    void track
      .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
      .catch(noop);
  } catch {
    // No focus control is no failure.
  }
}

const noop = () => undefined;

/**
 * Starts the camera on `video` and reads every code it sees, handing each one's text to
 * `onText` (which must not throw; it is guarded anyway). Rejects with the camera's error
 * (`NotAllowedError` and the like) when there is no camera to be had. `stop()` stops the reading
 * and the camera.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onText: (text: string) => void,
): Promise<Scanner> {
  const read = (text: string) => {
    try {
      onText(text);
    } catch {
      // Never into the reader: an error zxing does not know ends its scan loop for good.
    }
  };
  const detector = await nativeQrDetector();
  return detector ? startNative(video, detector, read) : startZxing(video, read);
}

/** iPhone Safari and every browser without a QR BarcodeDetector. */
async function startZxing(video: HTMLVideoElement, read: (text: string) => void) {
  // zxing-js misses the third finder pattern of a large code (zxingFinder.ts).
  improveFinder(FinderPatternFinder);
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
  const reader = new BrowserQRCodeReader(hints, {
    delayBetweenScanAttempts: SCAN_DELAY_MS,
    delayBetweenScanSuccess: SCAN_DELAY_MS,
  });
  const controls = await withFallback((constraints) =>
    reader.decodeFromConstraints(constraints, video, (result) => {
      if (result) read(result.getText());
    }),
  );
  focusContinuously(video.srcObject as MediaStream | null);
  return { path: 'zxing' as const, stop: () => controls.stop() };
}

/**
 * Android Chrome: the camera straight into `video`, and `detector.detect(video)` once per new
 * video frame (requestVideoFrameCallback, else requestAnimationFrame), never two at once — the
 * next is asked for only when the last has answered.
 */
async function startNative(
  video: HTMLVideoElement,
  detector: BarcodeDetectorLike,
  read: (text: string) => void,
) {
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    throw new DOMException('This browser has no camera access', 'NotSupportedError');
  }
  const stream = await withFallback((constraints) => media.getUserMedia(constraints));
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
    if (video.srcObject === stream) video.srcObject = null;
  };
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    release();
    throw error;
  }
  focusContinuously(stream);

  let stopped = false;
  let frame: number | null = null;
  const byVideoFrame = typeof video.requestVideoFrameCallback === 'function';
  const next = () => {
    if (stopped) return;
    frame = byVideoFrame ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  const tick = () => {
    frame = null;
    if (stopped) return;
    detector.detect(video).then(
      (codes) => {
        if (stopped) return;
        for (const code of codes) read(code.rawValue);
        next();
      },
      // A frame the detector could not take (not decoded yet, a resize): try the next one.
      next,
    );
  };
  next();

  return {
    path: 'native' as const,
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (frame !== null) {
        if (byVideoFrame) video.cancelVideoFrameCallback(frame);
        else cancelAnimationFrame(frame);
      }
      release();
    },
  };
}

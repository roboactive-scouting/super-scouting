import { ResultMetadataType } from '@zxing/library';

/**
 * The e2e camera (task 1.48): CI has no camera, so the Playwright build — and only it — aliases
 * `@zxing/browser` to this file (vite.config.ts, when `E2E_QR_CAMERA=stub`, which only
 * playwright.config.ts sets). It stands in for `BrowserQRCodeReader`: `decodeFromVideoDevice`
 * draws nothing and decodes nothing, and the spec hands the page frames through
 * `window.__qrCamera.show(base64)`, each delivered to the page's callback as a result shaped like
 * zxing's, its bytes in BYTE_SEGMENTS. `page.addInitScript` may set `window.__qrCamera = {
 * blocked: true }` first, and the camera is then refused as a browser refuses it. A normal build
 * never contains this file (the spec's build check greps `dist` for `__qrCamera`).
 */
type Camera = { blocked?: boolean; show?: (base64: string) => void; running?: boolean };
type Callback = (result: unknown, error?: unknown, controls?: unknown) => void;

const camera = (): Camera => {
  const w = window as unknown as { __qrCamera?: Camera };
  w.__qrCamera ??= {};
  return w.__qrCamera;
};

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

export class BrowserQRCodeReader {
  constructor(_hints?: unknown, _options?: unknown) {}

  async decodeFromVideoDevice(_deviceId: unknown, _video: unknown, callback: Callback) {
    const state = camera();
    if (state.blocked) throw new DOMException('Permission denied', 'NotAllowedError');
    const controls = {
      stop: () => {
        state.running = false;
        state.show = undefined;
      },
    };
    state.running = true;
    state.show = (base64) => {
      const bytes = bytesOf(base64);
      callback(
        { getResultMetadata: () => new Map([[ResultMetadataType.BYTE_SEGMENTS, [bytes]]]) },
        undefined,
        controls,
      );
    };
    return controls;
  }
}

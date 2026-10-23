/**
 * The e2e camera (task 1.48; DEVIATIONS "Phase 1 G fix"): CI has no camera, so the Playwright
 * build — and only it — aliases `@zxing/browser` to this file (vite.config.ts, when
 * `E2E_QR_CAMERA=stub`, which only playwright.config.ts sets). It stands in for
 * `BrowserQRCodeReader`: `decodeFromConstraints` draws nothing and decodes nothing; it keeps the
 * constraints it was asked for in `window.__qrCamera.constraints`, and the spec hands the page
 * codes through `window.__qrCamera.show(text)` — a frame as the sender draws it, its Base45 text —
 * each delivered to the page's callback as a result shaped like zxing's (`getText()`).
 * `page.addInitScript` may set `window.__qrCamera = { blocked: true }` first, and the camera is
 * then refused as a browser refuses it. A normal build never contains this file (the spec's build
 * check greps `dist` for `__qrCamera`).
 *
 * The receiver takes the browser's BarcodeDetector when there is one that reads QR codes, and this
 * stub is only the zxing side: so the e2e app always takes the zxing path, the stub removes
 * `window.BarcodeDetector` as the receive page loads it. (Playwright's Chrome on this Windows
 * machine has none — checked, headless Chrome 155 — but Chrome on other systems may.)
 */
type Camera = {
  blocked?: boolean;
  show?: (text: string) => void;
  running?: boolean;
  constraints?: unknown[];
};
type Callback = (result: unknown, error?: unknown, controls?: unknown) => void;

const camera = (): Camera => {
  const w = window as unknown as { __qrCamera?: Camera };
  w.__qrCamera ??= {};
  return w.__qrCamera;
};

Reflect.deleteProperty(window, 'BarcodeDetector');

export class BrowserQRCodeReader {
  constructor(_hints?: unknown, _options?: unknown) {}

  async decodeFromConstraints(constraints: unknown, _video: unknown, callback: Callback) {
    const state = camera();
    (state.constraints ??= []).push(constraints);
    if (state.blocked) throw new DOMException('Permission denied', 'NotAllowedError');
    const controls = {
      stop: () => {
        state.running = false;
        state.show = undefined;
      },
    };
    state.running = true;
    state.show = (text) => callback({ getText: () => text }, undefined, controls);
    return controls;
  }
}

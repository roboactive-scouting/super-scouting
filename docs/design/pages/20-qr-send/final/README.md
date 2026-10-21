# 20 · QR send — final

- desktop: `qr-send-desktop.png`, a dialog over the Sync page
- phone: `qr-send-phone.png`: showing, batch 1 of 2, the last batch, nothing waiting

The `.html` files are the source, and `bash docs/design/pages/render.sh 20-qr-send final` re-renders them. Shared CSS and JS are in `../src/`; the computer view also loads `17-sync/src/` for the page underneath. Spec: SPEC-FINAL v1.33 §9.8; living spec v0.85 (Q7.9, Q7.10). Task 1.47.

Chosen: **variant A, "Dark full-screen plate"**, without a Stop button (user, 2026-10-20).

## Behaviour

- **Route** `/sync/qr/send`, opened from Sync's More → Send by QR. On a phone it covers the whole screen (no top bar or bottom bar) on `--rail`. On a computer it is a dialog over Sync: the code on a dark panel at the left, the details at the right.
- **The code** sits on a white card (radius 14 px, 10 px padding), as wide as the phone allows, black on white, because the QR format needs it to scan. It is a **moving QR**: frames 1…N loop by themselves at 5 a second until the page closes. The user taps nothing per frame.
- **Head:** "Send by QR" over what it holds ("12 entries · 1 super entry"; "205 records · 2 batches"), and at the right "☀ Screen stays on" (Q7.10).
- **Under the code:** the frame strip (one segment per frame: the one on screen white, the ones already shown this pass in muted green, the rest `--rail-raised`), then "Frame 4 of 11" in mono with "loops by itself", then the hint "Hold the phone still, about 20 cm from the tablet’s camera."
- **Done — back to Sync** (primary, 52 px, at the thumb) closes it. On a computer, Esc closes it too. There is **no Stop**: closing is the only way out, and nothing is marked sent either way. A small line under it says so: "Nothing is marked sent. These records wait for the cloud as before." Each record in a batch that was on screen gets "shown by QR hh:mm" on Sync (page 17).
- **More than 200 records (Q7.9):** a "Batch 1 of 2 · 200 of 205 records" band above the code, and the foot becomes **Done** (secondary, outline on dark) + **Next batch ›** (primary). The user taps Next batch once the tablet shows "Batch complete". The last batch has Done only. A phone rarely holds more than 200 records, so most sends never see this.
- **Nothing waiting:** "Nothing to send · Everything on this phone has already reached the cloud." with **Back to Sync**. No code, no strip.
- **The batch is fixed when the page opens.** A record saved while the code shows waits for the next send.
- **Screen stays on (Q7.10):** the page holds a Screen Wake Lock while it is open and releases it on Done or on leaving the page. If the browser refuses, the label is hidden and the transfer still works.

## Feature decisions

| Feature | Decision |
|---|---|
| Dark full-screen plate (A) | Now |
| Frame strip, one segment per frame (A) | Now |
| What the code holds, as one line (A) | Now |
| Screen stays on (Wake Lock) (A) | Now (Q7.10 A) |
| Next batch button above 200 records (A) | Now (Q7.9 A) |
| Stop button | No: Done only (user) |
| Light sheet over Sync, record list (B) | No |
| Start screen and three steps, brightness note (C) | No |
| Tap the code to pause on one frame (D) | No |

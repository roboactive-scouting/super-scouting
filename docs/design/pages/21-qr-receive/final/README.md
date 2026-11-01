# 21 · QR receive — final

- desktop: `qr-receive-desktop.png`, a full page: the camera at the left, the ring and frame cells at the right
- phone: `qr-receive-phone.png`: scanning, done, a damaged code, camera blocked

The `.html` files are the source, and `bash docs/design/pages/render.sh 21-qr-receive final` re-renders them. Shared CSS and JS are in `../src/` (plus `20-qr-send/src/` for the code parts). Spec: SPEC-FINAL v1.34 §9.8; living spec v0.86. Task 1.48.

Chosen: **variant C, "Big status, seen from both sides"**, plus **one green cell per frame**, so both people see which frames are still missing (user, 2026-10-20).

## Behaviour

- **Route** `/sync/qr/receive`, opened from Sync's More → Receive by QR. On a phone or tablet it covers the whole screen on `--rail` (no top or bottom bar), so the scouter holding up their phone can read it from the other side. On a computer it is a full page: the camera at the left, the status at the right.
- **Head:** "Receive by QR" and, at the right, "Sound on" (tap to turn the beep off; the choice is remembered on this device).
- **The camera** fills the width, rear camera, with white aim corners. Scanning runs continuously; there is no Start.
- **How it knows what it needs, offline:** every frame carries its own header (batch id, frame number, frame count, checksum of the whole batch, SPEC-FINAL §9.8). The first frame read tells the tablet "frame 4 of 11", so from then on it knows the total and which frames are missing. Nothing comes from the network.
- **Under the camera:** a ring (`--accent` on `--rail-raised`) with the count of frames collected ("7 of 11"), "Scanning…" and "Missing frames come round again.", then **one numbered cell per frame**: `--accent` once collected, `--rail-raised` while missing. Frames fill in any order. Before the first frame the ring reads 0 and there are no cells.
- **Done (the whole screen turns `--accent`):** a white check, "**Got it, Yael!**" (the author of the records; several authors read "Got it: Yael, Omer"), the record count large in mono, "records · 12 entries, 1 super", "Next phone, step up.", and the hint "Her phone shows Next batch? Tap it there, then scan again." The tablet cannot tell that a phone has another batch, because a frame carries no batch count. A short beep and, where the device supports it, a vibration (`navigator.vibrate`; iPhones have none). **Scan the next phone** (white primary) clears it and scans again; **Done — back to Sync** under it. The received copies then wait on Sync's "Received by QR" block (page 17).
- **A damaged batch** (the checksum does not match): a warning card on the camera, "That code was damaged · Starting again, hold still"; the ring and cells reset to 0; "The pieces did not add up. Nothing was saved."
- **Camera blocked:** "The camera is blocked · Allow the camera for this site in the browser’s settings, then try again." with **Try again**.
- **Done — back to Sync** (outline on dark) is always at the thumb. Leaving mid-batch saves nothing; a batch is written only when complete.
- A batch scanned twice is written again with no effect (the copies keep their ids, §9.8); the done screen shows the same count.

## Feature decisions

| Feature | Decision |
|---|---|
| Big ring, full-screen dark scanner (C) | Now |
| Green full screen with the author's name and the count (C) | Now |
| Beep and vibration on done, with a Sound on/off toggle (C) | Now |
| Damaged-code state that restarts (C) | Now |
| One numbered cell per frame (A's cells in B's green) | Now (user) |
| "Next batch" hint on the done screen | Now |
| Sheet with who / what / next phone (A) | No |
| This-session list on the page (B) | No (Sync already shows Received by QR) |
| "Nothing new" when scanned twice (B) | No |
| Scouters today with "not since Q31" (D) | No |

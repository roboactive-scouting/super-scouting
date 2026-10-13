# Conflicts (`/conflicts`) — closed 2026-10-12

**The code must look like these images:**
- phone: `conflicts-phone.png` — the scroll of cards, a settled card folded with its Undo countdown, offline with one card opened in full, a scouter's read-only view, and all settled with today's log
- desktop: `conflicts-desktop.png` — one card just settled (Undo running), two still to review

The `.html` files are the source, and `bash docs/design/pages/render.sh 18-conflicts final` re-renders them. Shared CSS and JS are in `../src/` (it also loads `05-entries/src/entries.css`/`entries.js` for the station tags and `17-sync/src/sync.css` for the SUPER tag). Spec: SPEC-FINAL v1.28 §9.5, §9.6, §17.9; living spec v0.80. Task 1.44 builds the page; 1.41 the server queue and command.

Chosen: **variant C ("One scroll")** (user, 2026-10-12), plus **"n fields differ"** and the **Settled today log** (picked by me when the user said "whatever you think will work good"; the filter chips and the progress bar were left out because a queue is usually two or three items).

## Where it lives

- **This device** nav group: Sync · **Conflicts** (with the open count) · Settings. The nav row shows for **leads and admins**. A scouter who reaches `/conflicts` (by URL) reads the queue but cannot resolve.
- Sync's amber "n conflicts to review › Review" link opens it.
- Any width (§17.2): it cannot wait for a laptop.

## The page

1. "Conflicts", then "District #3 · Tel Aviv · 3 to review" (the count drops as cards settle; "all settled" at zero).
2. **One scroll of cards**, oldest first. Each card:
   - **Head:** match (or the SUPER tag), the station tag, team number and name; then the **kind tag** — **Edited on two phones** (a divergence) or **Scouted twice** (a duplicate) — and "**3 fields differ**" in `--warn`. On a computer, and when a card is opened in full on a phone, one line says what happened and which copy is counted now.
   - **The diff table:** Field | first copy | second copy. Each copy's column head is the author's first name and their client time in mono, and the copy the statistics use now carries **Counted now**. **Only the differing fields show by default**, each on `--warn-tint` with a 3 px `--warn` edge and bold values; "**Show the 4 that match ⌄**" opens the rest (unmarked, muted), and "Show only the differences ⌃" closes them.
   - **Two buttons:**
     - Edited on two phones: **Keep Dana's** (primary; the counted copy) and **Restore Noa's**.
     - Scouted twice: **Keep Yael's** and **Keep Omer's**, both secondary; the other row is removed (soft-deleted).
   - Phone: the buttons sit side by side under the table. Computer: the card is two columns — who, the kind, the explanation and the buttons stacked on the left (300 px), the diff on the right.

## Settling a card, and Undo

- Tapping a button **folds the card at once** to a green line: "✓ **Kept Dana's copy** · Q12 2096" with **Undo** and a countdown ring (5 s).
- **The resolve command is sent only when the countdown ends** (user, 2026-10-12: "delayed send"). Undo just cancels it, so nothing reaches the server and the card opens again. No server undo exists.
- Leaving the page while a countdown runs sends it at once. If the send fails (the connection dropped), the card opens again with the Error line naming the failure.

## Offline, and scouters

- **Offline:** an amber line "**Offline.** You can read these, but resolving needs a connection, because it settles the entry for everyone." Every button is disabled; Show the n that match still works.
- **A scouter:** the Info note "**A lead or an admin resolves these.** Until then the copy marked "Counted now" is the one in the statistics." Every button is disabled.

## All settled

- The empty state with a green check: "**Nothing left to review** — Every copy is settled. New conflicts appear here after a sync." and **Back to Sync**.
- Under it, **Settled today**: one row per conflict resolved today on this event — "✓ **Q14 · 1690** kept Omer's, removed Yael's", the time and who settled it (mono). It also shows under the cards while any remain (not drawn).

## Features decided (2026-10-12)

| Feature | Decision |
|---|---|
| One scroll of cards (C) | Now |
| Only the differing fields by default, "Show the n that match" | Now |
| Settled card folds to a line with Undo | Now, as a delayed send (no server undo) |
| "Counted now" tag | Now |
| "n fields differ" (B, D) | Now (my pick) |
| Settled today log (D) | Now (my pick) |
| One at a time with a pager (A, D), list and detail (B), pick then confirm (D) | Not chosen |
| Filter chips (B), settled progress bar (A) | Not chosen (my pick: too few items to need them) |
| Buttons naming both outcomes ("Keep Yael's — remove Omer's", A) | Not chosen |

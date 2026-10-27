# Sync (`/sync`) — closed 2026-10-12

**The code must look like these images:**
- phone: `sync-phone.png` — Waiting (with the conflicts link a lead sees), Sending, Problems, the More sheet, after Send by QR, and the collector tablet
- desktop: `sync-desktop.png` — offline, the Waiting tab

The `.html` files are the source, and `bash docs/design/pages/render.sh 17-sync final` re-renders them. Shared CSS and JS are in `../src/` (it also loads `05-entries/src/entries.css` and `entries.js` for the robot status and station tags). Spec: SPEC-FINAL v1.27 §9.8–§9.10, §17.9; living spec v0.79. Task 1.43 builds the page; 1.42 the discarded notice and log; 1.44 the Conflicts page the link opens; 1.47–1.48 the QR pages and marks.

Chosen: **variant B ("Status strip and tabs")**, plus A's **conflicts link** and **sending progress**, and D's **"shown by QR" mark** and **received-by-QR counts** (user, 2026-10-12).

## Where it lives

- **This device** nav group: **Sync** (with the waiting count), **Conflicts** (leads and admins, with the open count; task 1.44), **Settings**. Sidebar on a computer, the phone menu on a phone. Not in the bottom bar.
- Both top-bar sync chips (computer) and the phone top bar's sync pill open `/sync` from every screen (§9.10).

## The page

1. "Sync", then "What this phone has sent, and what is still waiting." (computer: "this device"; a collector tablet: "this tablet").
2. **Status strip** (white card): the state in words with a dot — **Offline** (grey) · **Online** (green) · **Sending…** (spinner) — and under it "last sync 11:40 · sends by itself" (offline) or "last sync 11:49". At the right, **Sync now**, the page's one primary button. On a phone the **⋯** button sits beside it; on a computer **⋯ More** sits at the right of the page title.
   - **While sending:** the strip shows the progress line "Sent · 2 of 5", the button reads "Sending…" and is disabled, and the rows tick off one by one ("✓ 11:49").
3. **Conflicts link** (leads and admins only, only while any are open): an amber row "2 conflicts to review · Two copies of the same entry. A lead picks." with **Review ›**, opening `/conflicts`. On a computer it sits beside the strip.
4. **Tabs** with counts: **Waiting · Sent · Problems**. Problems carries an amber dot while it has anything.
5. The tab's list (cards on a phone, the data table on a computer).

## Waiting

- Every unsynced record on the device, **whatever its event**, grouped by competition: this event first ("this event · 4"), then each earlier event under its own heading ("earlier event · 1"). **Exactly as many items as the top-bar count** (§9.10).
- Each record: match (none for a super entry, which shows the SUPER tag instead of a status), team number and name, the robot status tag, the station tag, "saved 11:47", and where it was made: **This phone** or **QR · from Yael**.
- An entry whose match was created on this device: "+ New match — sends with this entry". A bare match is never its own line.
- A refused record stays here too, with its reason line (and is also listed under Problems).
- **After Send by QR** (§9.8): each record the phone has shown says "**shown by QR 11:44**" (the last time its batch was on screen). It still waits for the cloud; the mark is not a receipt.
- **On a device holding received copies** (the collector tablet): a **Received by QR** block first, "12 from 3 scouters", one row per scouter who authored them: initials, name, "last scan 11:44", and the count in mono.

## Sent

- What reached the cloud, newest first, each with "✓ sent 11:49". (Not drawn; the same cards and table rows, dimmed, with the tick.)

## Problems

- **Refused records** (§9.3.1, every reason except `parent-deleted`): the card with the error line *(reworded 2026-10-23, SPEC-FINAL v1.44 §7.6)* "**Not sent:** Changed after the 5-minute edit window. A lead can save it for you." (one line, no separate reason sentence) and one action, **Open entry** (the entry preview, §13.4). **No discard here** (user, 2026-10-12): §9.7 stays the only path that destroys typed data. **A lead clears it** (Q7.8 A, SPEC-FINAL §9.3.1): signed in on this device, they open it, fix it if needed, and save it as their own change; it then sends normally and leaves the list.
- **The discarded-records notice** (§9.7, task 1.42): an amber notice "2 entries were removed from this phone. An admin deleted the event they belonged to, so they can't be sent." listing each (match · team · scouter · time), with **Dismiss** and **See the log** (`/sync/discarded`).

## More (⋯)

A sheet on a phone, the More menu on a computer:
- **Send by QR** — "To the collector tablet. No internet needed." (`/sync/qr/send`, task 1.47)
- **Receive by QR** — "On the collector tablet: scan another phone." (`/sync/qr/receive`, task 1.48)
- **Discarded records** — "2 removed because their event was deleted." (the log)
- a divider, then **Discard received QR data** (§9.8's escape hatch): disabled with "Held: 1 received copy hasn't reached the cloud." while any received copy is unacked; otherwise it opens the destructive confirmation.

**Wipe this device is not here.** It lives in Settings (closed 2026-10-09), user 2026-10-12.

## Features decided (2026-10-12)

| Feature | Decision |
|---|---|
| Status strip + Waiting / Sent / Problems tabs, tools in More (B) | Now |
| Waiting grouped by competition (B) | Now |
| Problems tab: refused records + the discarded notice (B) | Now |
| Conflicts link on Sync for leads (A) | Now |
| Sending progress "2 of 5" (A) | Now |
| "Shown by QR 11:44" mark on the sender (D) | Now |
| Received-by-QR counts per scouter on the collector tablet (D) | Now |
| Open entry on a refused record | Now |
| Discard (lead) on a refused record | No — would be a second path that destroys typed data; a lead re-saves it instead (Q7.8 A) |
| Wipe in More | No — stays in Settings |
| Status card + one list (A), sync history timeline (C), big count + two ways out (D), list grouped by match (D) | Not chosen |

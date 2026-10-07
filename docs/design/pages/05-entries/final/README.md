# Entries page (`/entries`) — closed 2026-10-07

**The code must look like `entries-desktop.png` and `entries-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 05-entries final` re-renders them. Spec: SPEC-FINAL v1.9 §17.9 (Entries row), living spec v0.57.

Chosen: **variant A, simplified**: today's table, newest first, with points in place of a sync column.

## Desktop

1. "Entries" and the line "Everything this device holds for the current competition, newest first."
2. A search field (team, match or scouter), then filter chips with counts: **All · Mine · Waiting to send · Needs a look**. The selected chip is filled `--ink`.
3. The table:

   | Column | Content |
   |---|---|
   | Match ↓ | Q38, mono |
   | Team | Station tag (Red 1 … Blue 3), team number (mono), name, and the "Not in line-up" flag when set |
   | Status | The robot status tag |
   | Scouter | Full name |
   | Time | Time only (the date only when it isn't today); a small amber ↑ when the entry is waiting to send |
   | Points | The robot's scouted points, right-aligned mono; "—" for no show and disabled |

4. A refused entry keeps its own line under the row: the error line, "Not synced: …" with today's text.
5. A key under the table: "↑ waiting to send · — no points: the robot didn't play or was disabled".

## Phone

One card per entry:
- **Top line:** match, team number, name.
- **Right:** points, large and mono, with "pts" under it.
- **Under the name:** station, status, the scouter's first name and the time (↑ if waiting).
- **When present:** the flag and the refused line.

Above the cards: search, then the same four chips (scrolling sideways when they don't fit).

## Behaviour

- Lists the current competition only, newest first.
- **Mine** = entries whose scouter is the signed-in user. **Waiting to send** = still in the outbox. **Needs a look** = refused by the server, or flagged "not in line-up".
- **A row or card opens the entry preview** (SPEC-FINAL §13.4): its own full page, not a drawer and not part of this page. Until it exists, rows don't open.
- Loading: today's skeleton. Empty: "No entries yet" with **Scout a match** (phone image 4).

## What's built when

| Part | When |
|---|---|
| Newest first, search, the four filter chips, station in the Team cell, time only, the waiting ↑, the refused line, the status tags, the "not in line-up" flag | **Now** (with the redesign build) |
| Points column | **After the metric engine** (task 1.54, `scoreEntry`). Hidden until then; the table ends at Time |
| Rows open the entry preview | **When the entry preview page is built** (§13.4); that page gets its own design round |

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Newest first | Yes |
| Search by team, match or scouter | Yes |
| Filter chips All / Mine / Waiting to send / Needs a look | Yes |
| Station on each entry | Yes |
| Points instead of a sync column; waiting shown as ↑ by the time | Yes, points after task 1.54 |
| "Not in line-up" flag | Yes (decided with Scout, spec §8.1) |
| Robot status colours | Yes, locked in `THEME.md` |
| Row opens the entry preview, a separate page | Wanted, designed in its own round later |
| Grouped by match with unscouted gaps (B) | No |
| "Needs a look" banner (C) | No (the chip covers it) |
| Preview beside the list, with lead Edit / Remove (C) | No: the preview is its own page |
| "Mine" tab with an edit countdown (D) | No |

**[RAISED BY ME]** With search and points, this page now covers most of the planned entry search page (§13.3, task 1.51). Missing: the match / super kind filter. Decide when Search is designed whether the two become one page.

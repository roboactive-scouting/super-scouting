# Manage page (`/admin/manage`) — closed 2026-10-07

**The code must look like the four images here:**
- desktop: `manage-desktop.png` (Matches), `manage-desktop-roster.png` (Teams & roster), `manage-desktop-competitions.png` (Competitions)
- phone: `manage-phone.png` (matches only)

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 07-manage final` re-renders them. Spec: SPEC-FINAL v1.11 §6.4, §17.2, §17.9; living spec v0.59.

Chosen: **variant D, "Fast entry"**, with every one of its new features, plus a **matches-only phone view**.

## Desktop (≥ 1024 px)

**Header.** "Season and event management". The line under it names the event being worked on: "Working on **District #3 · Tel Aviv** (default) · 2026". An **event select** at the right (shown when the season has more than one event) changes which event the Roster and Matches tabs manage. It changes nothing on the server.

**Three tabs**, with counts: **Competitions · Teams & roster {n} · Matches {n}**. These replace today's four tabs, because Seasons and Events merge into Competitions.

### Competitions

- **Season chips**, newest first. The active one is filled `--ink` and labelled "· Active". The last chip is **+ New season**.
- **The chosen season's card:** image preview, "2026 — REBUILT", the image path in mono, an "Active season" badge or **Make 2026 active**, and **Edit season**. The edit form is today's (year, game name, image path with the committed-image list and its hint).
- **Events**, with the note "Order is display order only — every event counts equally." Each event is a card showing:
  - its name and its position (#1…)
  - **Default event** badge, or **Make default**
  - ↑ ↓ to move it (disabled at the ends)
  - ✎ to rename it
- The current default event's card is accent-tinted. The last card is **+ New event**.
- Make active, Make default and reordering update in place. Make active and Make default are disabled offline, as today.

### Teams & roster

- **Add a team to the roster:** one field. Typing a number suggests teams from the registry ("in the registry · add"). An unknown number offers **+ New team {n} — enter its name**, which creates the team and adds it to the roster in one step.
- **Filter** (number or name), and the note "A team number is permanent. Only the name can change."
- **On this event's roster ({n})**: cards with the number (mono) and name. Clicking the name renames the team; × takes it off the roster.
- **In the registry, not on this roster ({n})**: dashed cards with + to add.

### Matches

- **One toolbar:**
  - the match-type select (it drives both create actions, as today)
  - a count field with **Create matches**
  - a match-number field with **Create match**
- **Problem summary** under the toolbar, checked as you go. For example:
  - "Q7 and Q10 are missing robots"
  - "7845 is not on this event's roster", with a link **Add 7845 to the roster**
  - the key "Type a number · Tab moves on · saved per cell"
- **The grid:**
  - one row per match, with the alliance-tinted RED 1 … BLUE 3 headers
  - each cell shows the team number (mono) and its name
  - an empty cell is dashed
  - a team not on the roster is a `--warn-tint` cell reading "Not on roster"
- **Typing in a cell** suggests roster teams. Enter or Tab saves the cell and moves on, and each match's save sends its full slot set, as today.
- ✎ edits a match's type and number. 🗑 opens today's delete confirmation, unchanged.

## Phone (< 1024 px): matches only

Phones now get the **Matches** part of this page. Seasons, events and the roster still need a computer, and the page says so in one line.

1. **Match list:**
   - Practice / Qualification / Playoff (segmented)
   - one card per match, with its red row and blue row of team numbers; empty slots are dashed, and an off-roster team is warn-outlined
   - "N empty" or "off roster" under the match number
   - **Add matches** pinned at the bottom
2. **Edit a match** (bottom sheet):
   - six typed station fields (Red 1–3 beside Blue 1–3) with roster suggestions
   - match type and number
   - **Save changes**, and **Delete match**
3. **Add matches** (sheet): the type, then either "How many?" with **Create N matches**, or one match by number with **Create match**.
4. **Delete:** today's text, with Cancel and Delete.

**Reached from:** the admin **Matches** tile on Home's phone Go-to grid, and the phone drawer's Admin group ("Matches"), both opening `/admin/manage`. On a desktop they read "Manage".

The role gate and the offline states are today's. Offline, the page keeps what was typed, and saving waits for the connection.

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Counts on the tabs | Now |
| Problem summary with "Add {n} to the roster" | Now |
| Typed line-up cells with suggestions, Tab moves on | Now |
| Seasons + Events merged into "Competitions" (chips + cards) | Now |
| One-field roster add (creates an unknown team in the same step) | Now |
| **Matches on a phone** (list, edit, add, delete) | Now. SPEC-FINAL §17.2 gets a third any-width exception |
| Paste a schedule from a spreadsheet | No. Replaced by the next row |
| **Import the schedule from a PDF** | Wanted, not now (living spec §24); the format is still unknown |
| Setup checklist (B), season/event tree (C) | No |

## Also to fix when this page is coded

- **[RAISED BY ME]** Today an offline save on this page says "Managing users needs it…": the line is shared with the Users page. Manage needs its own: "Managing seasons, events, rosters and matches needs a connection…".
- **[RAISED BY ME]** SPEC-FINAL §6.4 lists **delete** for seasons and events (hard cascade), but neither today's page nor this design has it. When it is built, it uses the type-to-confirm pattern (§17.8, multi-record and irreversible) and goes on the season card and the event card's ✎ menu.
- The mock roster shows "+ 6 more" only to fit the image. The page lists every team.

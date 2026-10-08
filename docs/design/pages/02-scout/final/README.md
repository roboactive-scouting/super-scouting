# Scout page (`/scout`) — closed 2026-10-06

**The code must look like `scout-desktop.png` and `scout-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 02-scout final` re-renders them. Colours, type and shape come from `docs/design/theme.css`; the components are locked in `docs/design/THEME.md`.

Chosen: **variant E**, which combines C (my station) and D (driver stations) and was refined twice in the chat. Spec: SPEC-FINAL v1.6 §8.1, living spec v0.54.

## Behaviour

1. **Your station.**
   - On the first visit a bottom sheet asks "Choose your station": Red 1–3 / Blue 1–3, with "Not now" / "Use Blue 2".
   - The choice is remembered **on the device** until changed, and shown as a pill in a "Your station · Blue 2 · Change" bar.
   - It only preselects. It is not an assignment.
2. **Match.** Match type is a dropdown (Qualification / Practice / Playoff). The match number is **typed** in a field that opens the number keypad (`inputmode="numeric"`, shown with a "Q" prefix). There's no stepper and no list of upcoming matches. After a **new** entry the match type is kept and the number is pre-filled with the next one (still editable, no robot picked); after an edit it stays empty (amended 2026-10-08, UI fix round; SPEC-FINAL v1.17 §8.1).
3. **The line-up.** When the typed match has a line-up on the device:
   - its six robots show as station tiles, Red 1–3 on the left and Blue 1–3 on the right, each with the team number and name
   - your station's tile has a "YOUR STATION" tag and is **picked by default**
   - **the picked tile is filled with its alliance colour** (dark red or dark blue, white text), not green (amended 2026-10-08, user)
   - the primary button names the choice: "Start entry · 5654 Phoenix"
4. **Another robot in the line-up.** Tapping a tile other than your station opens a sheet: "Scout Red 1 instead? Your station is Blue 2. This entry will be for 1690 Orbit on Red 1. Your station stays Blue 2." with Keep Blue 2 / Scout Red 1.
5. **No line-up.** For a match that is new to the device, or listed with no robots:
   - a note says the match is created on submit
   - you choose the alliance (preset from your station) and pick from the **searchable event roster**
   - this works offline, as today
6. **"Team not here?"** sits under the line-up and opens "Which team are you watching?" with the alliance and the searchable event roster.
   - It is a full-width secondary button, not link text, and Start entry is pinned at the bottom on a desktop too, so it stays in reach with the roster open (amended 2026-10-08, UI fix round; the PNGs still show the link and an unpinned desktop button).
   - Picking a team outside the line-up shows a **"Not in line-up"** mark with the explanation.
   - The entry is saved normally and carries the flag, which is **derived** (the entry's team is not in that match's `match_teams` for its alliance). It needs no new column.
   - A lead sees the flag in Entries.
   - **The match's line-up never changes from this screen.**
7. **Already scouted on this device.** The tile shows ✓ and "Scouted · edit until hh:mm", or 🔒 when locked. The button becomes "Edit the existing entry" and the existing explanation note is shown. A second entry cannot be started (unchanged rule).
8. **After a submit**, the green "Entry saved on this device" banner names the match and team (unchanged text, new look).

## Features decided (2026-10-06)

| Feature | Decision |
|---|---|
| Remembered station, marked and preselected in the line-up | **Yes** |
| Line-up as driver-station tiles (red left, blue right) | **Yes** |
| Confirm before scouting a robot that isn't your station | **Yes** (user's addition) |
| Match number typed, no − / + stepper | **Yes** (user's choice) |
| Searchable event roster when there is no line-up | **Yes** |
| "Team not here?" with a derived "not in line-up" flag; the line-up is unchanged | **Yes** |
| Already-scouted state shown on the tiles | **Yes** |
| Next match number pre-filled after a new entry (number + 1, same type, editable; none after an edit) | **Yes** (amended 2026-10-08, UI fix round; SPEC-FINAL v1.17 §8.1) |
| Next unplayed match from the schedule / upcoming-matches queue / missed matches | **No**: the team doesn't scout by schedule, and backlogs would confuse scouts |
| Schedule table as the picker | No |
| "Your session" stats panel | No |
| − / + match stepper | No |

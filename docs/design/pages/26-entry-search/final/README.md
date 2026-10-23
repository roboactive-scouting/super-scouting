# 26 · Entry search — final

- desktop: `entry-search-desktop.png` (Both, one row hovered)
- phone: `entry-search-phone.png`: Both (a card pressed), Super only, Needs a look, searching "orbit"

The `.html` files are the source, and `bash docs/design/pages/render.sh 26-entry-search final` re-renders them. Shared CSS and JS are in `../src/` (`es.css`, `es.js`, `final.js`). The page also loads the Entries round (`05-entries/src/entries.js`, `a2.js` and its CSS) and `24-team/src/team.js` for the phone frame. Spec: SPEC-FINAL v1.43 §13.3; living spec v0.95. Task 1.52.

Chosen: **variant A**: the closed Entries page (05) with a **Both · Match · Super** switch. The station tag is dropped from the desktop table **and** the phone cards (user, 2026-10-23).

**One page, not two.** This settles round 05's open question: `/entries` *is* the entry search. It keeps 05's search and chips (All · Mine · Waiting · Needs a look) and adds the kind filter, the super entries and the link to each entry's preview. Everything in `05-entries/final/README.md` still holds unless it is changed below.

## Behaviour

- **Route:** `/entries`. On a computer the sidebar marks Entries. On a phone, Entries is the raised button in the bottom bar (Home · Scout · Search · Entries), still carrying its amber waiting count.
- **Scope:** every entry of the **active competition**, match and super, newest first. The subtitle reads: "Every entry at District #3 · Tel Aviv, match and super, newest first. A row opens the entry." On a phone it is shortened to "District #3 · Tel Aviv · match and super · newest first".
- **Controls:**
  - the Search field ("Team, match or scouter"; it filters as you type by team name, team number, match number and scouter name)
  - 05's chips with counts
  - the **kind switch**: the locked Segmented control with three segments, **Both n · Match n · Super n**, Both by default. On a computer it sits at the right of the chip row; on a phone it is a full-width row between the search and the chips.
  - The chip counts follow the kind and the search.
- **Desktop table:** Match ↓ · Team · Status · Scouter · Time · Points, then a ›.
  - **The Team cell is the number and the name only.** The station tag is dropped from the table; the "Not in line-up" flag stays.
  - The rest is as in 05: the waiting ↑, "—" points for no show and disabled, the refused line under its row, and the key under the table. The key adds "a super entry has no score".
- **Phone cards:** as 05 (match, team, name; points at the right; status, first name, time) **without the station tag**. Each card is a link, with a faint › at the right. Pressed: `--accent-tint` with a 3 px `--accent` left edge.
- **Super entries** sit in the same list, in time order:
  - Match cell: "—".
  - Status: the dark **SUPER** tag.
  - Points: empty on a computer, "whole event" in `--muted` on a phone.
- **A row or card opens the entry preview** (`/entries/:id`, page 25), as a full page. On a computer, hover or focus tints the row and turns the › `--accent`.
- **Needs a look:** a refused record keeps 05's Error line, which for the edit window reads "Not sent: changed after the 5-minute edit window. A lead can save it for you." (SPEC-FINAL v1.44 §7.6).

## Feature decisions

| Feature | Decision |
|---|---|
| One `/entries` page: 05 plus the kind filter (A) | Now |
| Both · Match · Super switch (segmented control) | Now |
| Super entries in the list with the SUPER tag, no score | Now |
| Rows and cards open the entry preview | Now |
| Station tag dropped from the desktop table and the phone cards (user) | Now |
| Kind as two more chips (B) | No |
| Two tabs, This device / Whole event (C) | No |
| Filters in a sheet with robot status and scouter filters (D, NEW) | No |

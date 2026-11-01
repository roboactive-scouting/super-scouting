# 23 · Team search — final

- desktop: `team-search-desktop.png` (the default list, with one row hovered) and `team-search-desktop-switch.png` (All, with the are-you-sure dialog)
- phone: `team-search-phone.png`: the default list (one row pressed), typing with "Show all", the event picker, the are-you-sure, offline

The `.html` files are the source, and `bash docs/design/pages/render.sh 23-team-search final` re-renders them. Shared CSS and JS are in `../src/` (`ts.css`, `ts.js`, `final.js`); the page also loads `24-team/src/team.css` and `team.js` for the phone frame and icons. Spec: SPEC-FINAL v1.42 §13.2; living spec v0.94. Task 1.51.

Chosen: **variant A2**: A's single list, with "At this event" as the default chip, no Other events column, and the whole row as the way to the team page (user, 2026-10-23).

## Behaviour

- **Route:** `/teams`.
  - The sidebar gets **Search** after Scout.
  - The phone bottom bar becomes **Home · Scout · Search · Entries**. Search is the raised green button on this page, under the shell rule that the current page is raised.
- **Head:** "Search teams" over "2026 season · 64 teams · ranks from District #3 · Tel Aviv".
- **Controls:** the Search field ("Team number or name", locked), then filter chips: **All 64 · At this event 42 · Other events 22**.
  - **At this event is selected by default.**
  - Typing filters as you type, by number or name, and the matching text is highlighted (`--warn-tint`).
- **Order:** teams at this event by rank (unranked last), then other teams by number.
- **A team at this event** is one row, ≥ 60 px: the number in mono 18 px, the name over "n entries here", and the small **rank badge** at the side.
  - The badge is a 24 px `--line-2` tag "#7" in mono.
  - The **top 3** use `--accent-tint` with a medal icon.
  - A team with no entries reads "not ranked yet".
  - Our team's row is `--accent-tint`, marked "· us".
- **Opening the team page (the whole row):** each row ends in a 34 px round `--accent-tint` › (white on our team's tinted row), and the row is a link named "1690 Orbit, team page".
  - **Phone, pressed:** the row turns `--accent-tint` with a 3 px `--accent` left edge, and the › fills `--accent` with a white arrow.
  - **Computer, hovered** (or keyboard-focused): the same tint and edge, the team number underlined, and "Team page ›" in `--accent-ink` at the row's end. Elsewhere only the › shows.
  - The row opens `/teams/:teamId`.
- **A team at another event:** the row has no rank ("not at this event") and a **dashed "⇄ Other event"** button (`--bg`, dashed `--control-border`): the differently styled button §13.2 asks for. On a phone, the row's sub-line names the events.
- **"Show all":** with At this event selected, a `--bg` line at the end of the list says "22 more 2026 teams at other events", or while typing "2 more teams match at other events", with **Show all ›** in `--accent-ink`. Show all selects All, so a search never looks empty when the team exists elsewhere.
- **Switching event:**
  1. **Pick where:** "Other event" opens a sheet (Dialog on a computer): "3065 Jatt wasn't at District #3 · Pick an event we scouted them at." It lists radio rows of the events where we hold entries for the team (name, "6 entries · Mar 2026"), then Cancel and **Continue**.
  2. **Are you sure:** "Switch to another event?", with "Switch this session to **District #2 · Be'er Sheva** and open **3065 Jatt**?" and "Only on this device until you go back or sign out. Scouting still saves to District #3 · Tel Aviv." The buttons are **Keep District #3** (first) and **Switch and open** (primary).
  3. **Yes:** a session-only override of the active event, then the team's page. That page shows the locked Session banner ("Viewing District #2 for this session" + "Back to District #3").
- **Offline:** every Other event button is disabled at 45 %, and one Note says "**Offline.** Other events need a connection; teams at District #3 still open." Teams at this event open as usual.
- **Computer table:** Team · Rank here · Entries here · (›). **No Other events column.**

## Feature decisions

| Feature | Decision |
|---|---|
| A's single list, rank badge at the side, medal on the top 3 | Now |
| "At this event" as the default chip (user) | Now |
| No Other events column (user) | Now |
| The whole row opens the team page, with a round ›, pressed and hovered states (user: "design the move better") | Now |
| "Show all" line offering teams at other events | Now |
| Average points in each row (B, NEW) | Not taken |
| Top three and recent teams before typing (D, NEW) | Not taken |
| Two groups (B), team cards (C) | No |

# Round 27, second draw (E–H) — Ranking: the brief each variant subagent received

The first draw (A–D, `BRIEF.md`) gave four near-identical shaded grids (user, 2026-10-28: "all of the variants look really the same"). Cause: that brief said "one table", fixed every column and the cell shading, so it was a design in all but name. This brief states the same requirements as information and behaviour, rules out the grid the first draw produced, and gives each subagent a different **premise**: who it designs for and when, not a layout. Every subagent got this text plus its own premise and letter.

---

You are designing one page of a scouting app for an FRC robotics team (team 2096, RoboActive). Design it the way you think works best. Other designers are working on the same brief separately, each from a different premise; you will not see their work, and yours should stand on its own.

## Your premise

<PREMISE>

Let the premise decide what leads the page and how it is structured, on the phone and on the desktop. Every requirement below still holds.

## Not this

A first round of designs all came out as the same thing, so **don't design it again**: a single grid where every figure sits in its own tinted cell, one column per figure, a "Columns" menu or a row of column chips to hide columns, and, on a phone, the same grid with Rank and Team frozen while the other columns scroll sideways or switch in groups. Find a structure of your own. A table can still be part of it, but it must not be that table.

## The page

**Ranking**, route `/ranking`. It ranks every team at the current event by what our scouters recorded, so the team can see who is strong and who is dependable. The strategy lead opens it on a laptop in the stands or the pits between matches, and again before alliance selection to decide which teams to pick. Scouters and the drive team open it on a phone at a loud venue with a weak or absent connection, often for a few seconds between matches, to check where a team or our own team stands. An event has up to about 50 teams.

## It must show and do

- **Every team at the event, one entry per team**, scoped to the current event. Name the event on the page.
- **The figures for each team, with these names** (call them columns or anything else; how they are laid out is yours):
  - **Rank:** the team's place by average points (the canonical "basic rank"). **Medals on the top 3**, and on no one else.
  - **Team:** the number and the name.
  - **Average points:** the mean scouted points per match. Matches where the robot didn't show up, or was disabled, are left out and **never counted as zero**. This is the default sort, best first.
  - **Consistency:** the standard deviation of the points. It is **displayed but can never be sorted**. Clicking its header does nothing, and the page must not suggest that it sorts.
  - **Breakdowns · No-shows · Disabled:** counts. Fewer is better.
  - **Availability:** a percentage, available ÷ (available + missed). A no-show or a disabled match counts as missed, and a breakdown counts as available.
  - **Matches:** how many matches were counted for that team.
- **Sort:** the user can order the teams by Average points, Breakdowns, No-shows, Disabled or Availability, and reverse the order. The page shows what it is sorted by and in which direction. Consistency can never be a sort.
- **Choose the figures:** the user can hide and show figures. Rank and Team always stay.
- **Labels stay in view:** whatever names the figures (headers, labels) stays readable while the list scrolls.
- **No pagination:** all of the teams, up to 50, are in one scrolling list.
- **No data is a "—", never a zero.** A team with no counted matches shows "—" in every figure and sorts last. Missing data must never look like a bad value.
- **Value shading** on every figure except Rank, Team and Matches: a fast worst-to-best cue. Its colour is a lightness scale of the accent: `color-mix(in srgb, var(--accent) X%, var(--surface))`, with X running from 6 (worst) to 52 (best). What carries it (a cell, a bar, a mark, a chip, anything) is yours, and **the number is always printed** next to it. The scale runs per figure: Average points over the observed min–max of the teams, and Availability over a fixed 0–100 %. Breakdowns, No-shows and Disabled run over the observed min–max, **reversed**, because lower is better. When every value is equal, it is flat `--line-2`. A "—" gets no shading, just `--muted` text, and stays out of the min–max. Consistency is neutral: flat, no scale.
- **Online:** the figures come from the server. **Offline:** the phone computes the same ranking from the entries stored on it, and the page says so in words: "Computed from the data on this device". It also says when the device last synced.
- **No weighting in this version.** Draw no weight sliders, weight buttons or presets. Those arrive later.
- Our own team (2096) is ranked like any other team.
- Robot status is never shown by colour alone: a word or a shape goes with it.

## Draw these states

- **Desktop (1440 wide), online:** the page sorted by Average points, best first, showing how figures are chosen (open or closed, your choice).
- **Phone 1, online:** the default view, the top of the list. Every figure must still be reachable on a phone, by whatever means you design.
- **Phone 2, offline:** the same page with the sync pill showing "Offline", the "Computed from the data on this device" line with the last sync time, and the teams **sorted by Availability** instead (to show a non-default sort).

## Mock data

Event: **ISR District Event #3**, qualification matches played so far: Q1–Q40 (10 per team). Online data as of 11:40. On the offline phone, the last sync was at 11:08.

| Rank | Team | Name | Average points | Consistency (SD) | Breakdowns | No-shows | Disabled | Availability | Matches |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1690 | Orbit | 92.4 | 6.1 | 0 | 0 | 0 | 100 % | 10 |
| 2 | 5951 | Makers Assemble | 88.0 | 11.8 | 1 | 0 | 0 | 100 % | 10 |
| 3 | 1574 | MisCar | 84.7 | 9.3 | 0 | 0 | 1 | 90 % | 9 |
| 4 | 3339 | BumbleB | 81.2 | 22.4 | 3 | 0 | 0 | 100 % | 10 |
| 5 | 2231 | OnyxTronix | 78.9 | 7.0 | 0 | 1 | 0 | 90 % | 9 |
| 6 | 4590 | GreenBlitz | 76.5 | 8.4 | 1 | 0 | 0 | 100 % | 10 |
| 7 | 2096 | RoboActive | 74.1 | 10.2 | 1 | 0 | 0 | 100 % | 10 |
| 8 | 1937 | Elysium | 71.8 | 5.5 | 0 | 0 | 0 | 100 % | 10 |
| 9 | 3075 | Ha-Dream Team | 69.3 | 14.9 | 2 | 0 | 1 | 90 % | 9 |
| 10 | 5135 | Black Unicorns | 66.0 | 8.8 | 0 | 0 | 0 | 100 % | 10 |
| 11 | 4338 | Falcons | 63.4 | 12.1 | 1 | 1 | 0 | 90 % | 9 |
| 12 | 2630 | Thunderbolts | 61.7 | 6.6 | 0 | 0 | 0 | 100 % | 10 |
| 13 | 6741 | Ninjas | 58.2 | 18.0 | 2 | 0 | 0 | 100 % | 10 |
| 14 | 3083 | Artemis | 55.9 | 9.9 | 0 | 2 | 1 | 70 % | 7 |
| 15 | 1943 | NeatTeam | 53.1 | 7.7 | 0 | 0 | 0 | 100 % | 10 |
| 16 | 7067 | Team Spice | 50.4 | 13.5 | 1 | 0 | 0 | 100 % | 10 |
| 17 | 4744 | Galaxia | 47.8 | 8.1 | 0 | 0 | 0 | 100 % | 10 |
| 18 | 3316 | D-Bug | 45.0 | 16.7 | 3 | 0 | 0 | 100 % | 10 |
| 19 | 5654 | Phoenix | 42.6 | 6.9 | 0 | 1 | 0 | 90 % | 9 |
| 20 | 6738 | Excalibur | 39.9 | 10.4 | 1 | 0 | 2 | 80 % | 8 |
| 21 | 8175 | Piece of Mind | 35.2 | 7.2 | 0 | 0 | 0 | 100 % | 10 |
| 22 | 8223 | Mariners | 31.0 | 12.8 | 2 | 3 | 0 | 70 % | 7 |
| 23 | 7039 | Sirius | 24.5 | 9.6 | 1 | 0 | 0 | 100 % | 10 |
| — | 9738 | Ionic Bond | — | — | 0 | 0 | 0 | — | 0 |

Ionic Bond has no counted matches yet: its figures are "—" and it sorts last. Signed in: Noa Levi, scout lead. Three entries are waiting to send.

## Theme and shell (fixed)

- Colours, type and shape: link `docs/design/theme.css` (from your page: `../../../theme.css`) and use only its tokens. Read the "Palette", "Type", "Shape and space" and "Layout" sections of `docs/design/THEME.md`. **Skip "Locked components".** Use no colour of your own.
- Red and blue mean the two alliances only. Colour is never the only signal: every status also has a word or a shape.
- Link `docs/design/pages/shell.css` (`../../shell.css`) after the theme, and load `docs/design/pages/shell.js` (`../../shell.js`) at the end of the body. It builds the fixed shell:
  - **Desktop:** `<div class="desk"><div data-desk-shell="ranking" data-nav="stats" data-crumb="Ranking"> …your content… </div></div>`. This gives the dark sidebar (Home · Scout · Teams · Ranking · Entries, Ranking current) and the top bar with the sync chips.
  - **Phone:** `<div class="phone"><div data-phone-shell data-title="Ranking" data-bbar="ranking" data-time="11:43"> …your content… </div></div>`. This gives the status bar, the dark top bar (menu, logo, title, sync pill) and the dark bottom bar (Home · Scout · Teams · Ranking, Ranking raised in green). For the offline phone, add `data-sync='<span class="dot" style="background:var(--muted)"></span>Offline'`. Your content fills the space between the bars and scrolls there.
  - Don't change shell.css or shell.js. Your own CSS uses class names with your letter as a prefix (for example `a-`), so they don't collide with the shell's.
- Touch targets must be at least 48 px on a phone.

## Make the image

- Your files are the page `docs/design/pages/27-ranking/src/<letter>.html` and anything it loads, which goes in `docs/design/pages/27-ranking/src/<letter>/`. Don't read or change any other page's folder or another letter's files, except the shared files named above.
- The page draws a 2000 × 900 canvas: `<div class="canvas">` with a `<div class="canvas-head"><b>Ranking — <LETTER> · <your name for the design></b><span>one line on the idea</span></div>`, then `<div class="frames">` holding the desktop frame and the two phone frames side by side, each in a `<figure class="frame">` with a short `<figcaption>`. The desktop frame is `.desk` (1440 × 900 at `zoom: 0.8`). Set `.phone { zoom: 0.8 }` in your CSS so everything fits across.
- Render it with `bash docs/design/pages/render.sh 27-ranking <letter>`, run from the repo root `C:\dev\frc-scouting`. The PNG lands in `docs/design/pages/27-ranking/out/<letter>.png`. Open it with the Read tool and check it: nothing cut off, nothing overlapping, text readable. Fix it and render again until it is clean.
- Tag every feature that is not in "It must show and do" with a black NEW tag (`<span class="new">NEW</span>` from shell.css).
- Write files with LF line endings (use the Write tool, not Python).
- Don't commit, switch branches or touch anything outside your own files.

## Reply with

1. The image path.
2. One line naming the design idea.
3. Each NEW feature, one line each.
4. Nothing else.

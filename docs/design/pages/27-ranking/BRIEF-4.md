# Round 27, fourth draw (M–P) — Ranking: variant L, refined

The user picked **L · Points anatomy** from the third draw (2026-10-28) and asked for four changes:

1. In the Scoring view (Total), the user sees each team's availability without clicking, "because I do not want to click every time to check it".
2. In the Availability view, the user sees the spread of each team's match statuses, "maybe like in the scoring way" (L draws each team's points as one Auto · Teleop · Endgame bar).
3. Tapping a team on the phone shows a summary of it, like the study panel in L's desktop view.
4. The user can choose several figures to sort by, in each of the two categories.

Every subagent got this text plus its own premise and letter. Each starts from L's files and changes them; how it answers the four asks is its own.

---

You are refining one page of a scouting app for an FRC robotics team (team 2096, RoboActive). The user already picked a design for it, variant **L**, and asked for four changes. Other designers are refining the same variant separately, each from a different premise; you will not see their work, and yours should stand on its own.

## Start from L

- L's files: `docs/design/pages/27-ranking/src/l.html`, `src/l/l.css`, `src/l/l.js`, and its image `out/l.png`. Read them and look at the image first.
- Copy them to your own files and work there (see "Make the image"). Rename the `l-` class prefix to your letter.
- Keep what L is: the list of teams with each team's average drawn as one Auto · Teleop · Endgame bar, only the sorted figure shaded, the Scoring | Availability switch, and the desktop study panel that holds one team's whole record. Change what the four asks need, and fix anything in L that stands in their way. Keep L's NEW tags on the features that carry them.

## Your premise

<PREMISE>

Let the premise decide how you answer the four asks, on the phone and on the desktop. Every requirement below still holds, and the page must stay **clean to the eye while still giving the information that helps most**.

## The four asks

1. **Availability in the Scoring view.** In the Scoring view, every team's availability is visible without a click or a tap: on the desktop list, on the phone list, and wherever a team appears. It must not turn the calm list back into a wall of numbers.
2. **The status spread in the Availability view.** In the Availability view, every team shows how its scheduled matches split by robot status: Played, Broke down, Disabled, No show. Draw it the way L draws points by phase (one bar per team, or anything that reads as clearly), with the counts readable. Use the app's status words and shapes, so the spread reads the same as everywhere else in the app:
   - **Played:** `--line-2` / `--ink-2`, with a green dot.
   - **Broke down:** `--warn-tint` / `--warn`, with a diamond.
   - **Disabled:** white with a 1 px `--warn` outline, with a hollow square.
   - **No show:** white with a 1 px `--control-border` outline, with a dash.
   - None of them is red, and none is shown by colour alone.
   - A breakdown counts as available, because the robot was on the field. Make that readable.
3. **A team summary on the phone.** Tapping a team on the phone opens a summary of it with the same content as the desktop study panel: rank, points by phase, consistency, availability, and the status spread. It also leads to the team page. A sheet, a full screen, or anything else is your call.
4. **Sort by several figures.** Each category has its own sort, made of one figure or several, in order. The first figure decides the order, the next one settles ties in the first, and so on. Each figure has its own direction (best first or worst first).
   - **Scoring** sorts from Total, Auto, Teleop and Endgame.
   - **Availability** sorts from Availability, Breakdowns, No-shows and Disabled.
   - Consistency is never a sort, and the page must not suggest that it sorts.
   - The page always shows the whole sort in words, for example "Availability, best first · then Breakdowns, fewest first".
   - Each category keeps its own sort when the user switches between them.
   - Rank never changes when the list is re-sorted. It is always the place by Total.

## It must still show and do

- **Every team at the event, one entry per team**, scoped to the current event. Name the event on the page.
- **Rank and Team on every entry.** Rank is the team's place by Total average points (the canonical "basic rank"), with **medals on the top 3** and on no one else. Team is the number and the name.
- **The figures, in two categories:**
  - **Scoring:**
    - **Total:** the average scouted points per match. Matches where the robot didn't show up, or was disabled, are left out and **never counted as zero**. The default sort is Total, best first.
    - **Auto · Teleop · Endgame:** the average points in each phase. They add up to Total.
    - **Consistency:** the standard deviation of Total, displayed only.
  - **Availability:**
    - **Availability:** a percentage, available ÷ (available + missed). A no-show or a disabled match counts as missed, and a breakdown counts as available.
    - **Breakdowns · No-shows · Disabled:** counts. Fewer is better.
  - **Matches:** how many matches were counted.
- **Labels stay in view:** whatever names the figures stays readable while the list scrolls.
- **No pagination:** all of the teams, up to 50, are in one scrolling list.
- **No data is a "—", never a zero.** A team with no counted matches shows "—" in every figure and sorts last, whatever the sort. Missing data must never look like a bad value.
- **Value shading:** a fast worst-to-best cue on the figures (not on Rank, Team or Matches).
  - Its colour is a lightness scale of the accent: `color-mix(in srgb, var(--accent) X%, var(--surface))`, with X running from 6 (worst) to 52 (best). **The number is always printed** next to it.
  - The scale runs per figure: Total, Auto, Teleop and Endgame over the observed min–max of the teams, and Availability over a fixed 0–100 %. Breakdowns, No-shows and Disabled run over the observed min–max, **reversed**, because lower is better.
  - When every value is equal, it is flat `--line-2`. A "—" gets no shading, just `--muted` text, and stays out of the min–max. Consistency is neutral: flat, no scale.
  - Shading is optional per figure, as in L, but where it appears it follows this rule.
- **Online:** the figures come from the server. **Offline:** the phone computes the same ranking from the entries stored on it, and the page says so in words, "Computed from the data on this device", along with when the device last synced.
- **No weighting in this version.** Draw no weight sliders, weight buttons or presets.
- Our own team (2096) is ranked like any other team.
- Red and blue mean the two alliances only. Robot status is never shown by colour alone: a word or a shape goes with it.

## Draw these states

1. **Desktop (1440 wide), online, Scoring:** sorted by Total, best first, with BumbleB (3339) open in the study panel. Every row shows its availability.
2. **Desktop (1440 wide), online, Availability:** sorted by **Availability, best first · then Breakdowns, fewest first**, with the status spread on every row and the control that builds a sort **open**.
3. **Phone 1, online:** Scoring, the default view, the top of the list.
4. **Phone 2, offline:** the sync pill showing "Offline", the "Computed from the data on this device" line with the last sync time, and the Availability category sorted by **Availability, best first · then Breakdowns, fewest first**.
5. **Phone 3, online:** the summary of BumbleB (3339) open, after a tap on its row.

## Mock data

Event: **ISR District Event #3**. Qualification matches played so far are Q1–Q40, and each team was scheduled for 10. Online data is as of 11:40; on the offline phone, the last sync was at 11:08.

**Played** is the matches counted with no problem. Matches − Breakdowns = Played, and Played + Broke down + Disabled + No show = 10 for every team that has data.

| Rank | Team | Name | Total | Auto | Teleop | Endgame | Consistency (SD) | Played | Broke down | No show | Disabled | Availability | Matches |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1690 | Orbit | 92.4 | 18.5 | 53.6 | 20.3 | 6.1 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 2 | 5951 | Makers Assemble | 88.0 | 12.3 | 52.8 | 22.9 | 11.8 | 9 | 1 | 0 | 0 | 100 % | 10 |
| 3 | 1574 | MisCar | 84.7 | 20.3 | 50.8 | 13.6 | 9.3 | 9 | 0 | 0 | 1 | 90 % | 9 |
| 4 | 3339 | BumbleB | 81.2 | 8.1 | 48.7 | 24.4 | 22.4 | 7 | 3 | 0 | 0 | 100 % | 10 |
| 5 | 2231 | OnyxTronix | 78.9 | 17.4 | 47.3 | 14.2 | 7.0 | 9 | 0 | 1 | 0 | 90 % | 9 |
| 6 | 4590 | GreenBlitz | 76.5 | 13.8 | 53.5 | 9.2 | 8.4 | 9 | 1 | 0 | 0 | 100 % | 10 |
| 7 | 2096 | RoboActive | 74.1 | 18.5 | 40.8 | 14.8 | 10.2 | 9 | 1 | 0 | 0 | 100 % | 10 |
| 8 | 1937 | Elysium | 71.8 | 8.6 | 43.1 | 20.1 | 5.5 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 9 | 3075 | Ha-Dream Team | 69.3 | 13.9 | 48.5 | 6.9 | 14.9 | 7 | 2 | 0 | 1 | 90 % | 9 |
| 10 | 5135 | Black Unicorns | 66.0 | 5.3 | 42.9 | 17.8 | 8.8 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 11 | 4338 | Falcons | 63.4 | 13.3 | 38.1 | 12.0 | 12.1 | 8 | 1 | 1 | 0 | 90 % | 9 |
| 12 | 2630 | Thunderbolts | 61.7 | 9.9 | 42.5 | 9.3 | 6.6 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 13 | 6741 | Ninjas | 58.2 | 15.1 | 38.4 | 4.7 | 18.0 | 8 | 2 | 0 | 0 | 100 % | 10 |
| 14 | 3083 | Artemis | 55.9 | 6.1 | 36.4 | 13.4 | 9.9 | 7 | 0 | 2 | 1 | 70 % | 7 |
| 15 | 1943 | NeatTeam | 53.1 | 10.1 | 32.4 | 10.6 | 7.7 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 16 | 7067 | Team Spice | 50.4 | 7.6 | 36.2 | 6.6 | 13.5 | 9 | 1 | 0 | 0 | 100 % | 10 |
| 17 | 4744 | Galaxia | 47.8 | 11.0 | 28.7 | 8.1 | 8.1 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 18 | 3316 | D-Bug | 45.0 | 4.0 | 28.0 | 13.0 | 16.7 | 7 | 3 | 0 | 0 | 100 % | 10 |
| 19 | 5654 | Phoenix | 42.6 | 7.2 | 30.7 | 4.7 | 6.9 | 9 | 0 | 1 | 0 | 90 % | 9 |
| 20 | 6738 | Excalibur | 39.9 | 8.0 | 23.5 | 8.4 | 10.4 | 7 | 1 | 0 | 2 | 80 % | 8 |
| 21 | 8175 | Piece of Mind | 35.2 | 4.6 | 25.7 | 4.9 | 7.2 | 10 | 0 | 0 | 0 | 100 % | 10 |
| 22 | 8223 | Mariners | 31.0 | 5.6 | 23.5 | 1.9 | 12.8 | 5 | 2 | 3 | 0 | 70 % | 7 |
| 23 | 7039 | Sirius | 24.5 | 5.4 | 16.2 | 2.9 | 9.6 | 9 | 1 | 0 | 0 | 100 % | 10 |
| — | 9738 | Ionic Bond | — | — | — | — | — | 0 | 0 | 0 | 0 | — | 0 |

Ionic Bond has no scouted matches yet: its figures are "—" and it sorts last. Signed in: Noa Levi, scout lead. Three entries are waiting to send.

## Theme and shell (fixed)

- Colours, type and shape: link `docs/design/theme.css` (from your page: `../../../theme.css`) and use only its tokens. Read the "Palette", "Type", "Shape and space" and "Layout" sections of `docs/design/THEME.md`. Of "Locked components", use only the robot status shapes given above. Use no colour of your own.
- Link `docs/design/pages/shell.css` (`../../shell.css`) after the theme, and load `docs/design/pages/shell.js` (`../../shell.js`) at the end of the body. It builds the fixed shell:
  - **Desktop:** `<div class="desk"><div data-desk-shell="ranking" data-nav="stats" data-crumb="Ranking"> …your content… </div></div>`.
  - **Phone:** `<div class="phone"><div data-phone-shell data-title="Ranking" data-bbar="ranking" data-time="11:43"> …your content… </div></div>`. For the offline phone, add `data-sync='<span class="dot" style="background:var(--muted)"></span>Offline'`.
  - Don't change shell.css or shell.js.
- Touch targets must be at least 48 px on a phone.

## Make the image

- Your files are the page `docs/design/pages/27-ranking/src/<letter>-tall.html` and anything it loads, which goes in `docs/design/pages/27-ranking/src/<letter>/`. Read L's files, but don't change them. Don't read or change any other letter's files.
- The page draws a **2000 × 1660** canvas: `<div class="canvas">` with a `<div class="canvas-head"><b>Ranking — <LETTER> · <your name for the design></b><span>one line on the idea</span></div>`, then the five states in two rows, each in a `<figure class="frame">` with a short `<figcaption>`:
  - Row 1: desktop Scoring, Phone 1 and Phone 3.
  - Row 2: desktop Availability and Phone 2.
  - Each desktop frame is `.desk` (1440 × 900 at `zoom: 0.8`). Set `.phone { zoom: 0.8 }` in your CSS.
- Render it with `bash docs/design/pages/render.sh 27-ranking <letter>-tall`, run from the repo root `C:\dev\frc-scouting`. The PNG lands in `docs/design/pages/27-ranking/out/<letter>-tall.png`. Open it with the Read tool and check it: nothing cut off, nothing overlapping, text readable. Fix it and render again until it is clean.
- Tag every feature that is not in L, not in the four asks and not in "It must still show and do" with a black NEW tag (`<span class="new">NEW</span>` from shell.css).
- Write files with LF line endings (use the Write tool, not Python).
- Don't commit, switch branches or touch anything outside your own files.

## Reply with

1. The image path.
2. One line naming the design idea.
3. One line on how you answered each of the four asks.
4. Each NEW feature, one line each.
5. Nothing else.

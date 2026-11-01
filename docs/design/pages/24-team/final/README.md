# 24 · Team page — final

- desktop: `team-desktop.png` (Stats tab) and `team-desktop-matches.png` (Matches tab)
- phone: `team-phone.png`: Stats, Stats scrolled (compact header), Matches, Progress, Notes, and a team with no entries

The `.html` files are the source, and `bash docs/design/pages/render.sh 24-team final` re-renders them. Shared CSS and JS are in `../src/` (`team.css`, `team.js` for the mock data and builders, `final.js` for the screens). The phone shell is `11-phone-shell`. Spec: SPEC-FINAL v1.40 §13.1, §12.6; living spec v0.92. Task 1.53.

Chosen: **variant D2**: D's "Tiles and trends", plus B's match list and C's match strip, which shows **only on the Matches tab**. The scouter name was added to the match rows (user, 2026-10-23).

## Behaviour

- **Route:** `/teams/:teamId`, reached from team search (and later the dashboards hub). It covers the **active competition** only. On a computer the sidebar marks **Search** as the current place, and the crumb reads "Search / 1690 Orbit".
- **Sticky team header** (the page's own `<header>`): the team number in mono (40 px desktop / 30 px phone), the name, then "District #3 · Tel Aviv · 10 entries · last seen Q55". At the right: **Average points** (the headline, the canonical basic rank's value, mono) and the **rank badge** "#4 of 42" (`--line-2`). The phone has a ‹ back button to the search. **Once scrolled, the phone header shrinks to one line**: ‹ · number · name · headline · "Rank #4 / 42", with a soft shadow under it.
- **Tabs** (locked Tabs, 44 px): **Stats · Matches n · Progress · Notes n**. They sit under the header and stay with it.
- **Stats tab:**
  - **Four stat tiles** (locked Stat tile, 2 × 2): Median points ("avg 38.4"), Availability ("9 of 10 matches"), Best match ("Q37"), Trend (the `slope`, "+1.3 points per match"). On a phone the tiles sit between the header and the tabs. On a computer they head the left column.
  - **All metrics** as stat rows, one white card, grouped by phase (Overall, Autonomous, Teleop, Endgame) under `--bg` group rows. Each row is **label → value → inline bar → trend line**:
    - the value sits in a shaded chip (see Value shading)
    - the bar (`role="meter"`, 6 px `--line` track, `--accent` fill) places the value between the worst and best at the event, with `lower_is_better` reversed
    - the trend line is a 58–64 px sparkline of that metric over the team's matches, ending in a dot
    - a `neutral` metric (std dev, played defense) has no shading and a `--faint` bar
    - a nominal one ("Usual climb · Deep") shows its value in words, with no bar and no trend line
  - **Reliability** (`role="group"`): Availability, Breakdowns, No-shows, Disabled, with the matches named under the counts (Q14, Q26). Counts above 0 are in `--warn`. On a phone it is a 4-column strip above the stat rows once scrolled. On a computer it is a 2 × 2 card under the tiles.
  - **On a computer only**, the Stats tab also shows the **Progress** chart (left column) and the **latest notes** (right column, newest first).
- **Matches tab:**
  - **The match strip first, and only here:** one cell per match the team has an entry for, oldest → newest, the match label (mono 10 px) over the points (mono 14 px). The cell is shaded worst → best. A broke-down match has a 3 px `--warn` bottom edge, and a no-show is a dashed `--control-border` cell with "—". Tapping a cell opens that entry.
  - **Phone list** (B's list, newest first, "tap a row for the entry"): match (mono) · robot status tag · **scouter** (first name and initial, `--muted`) · points (mono 20 px, "pts" under it, "—" when there are none) · ›. **No station tag and no field-value line**: every value is one tap away in the entry preview.
  - **Computer table** (locked Data table, `aria-label="Match by match"`): Match · Robot · **Points ↓** · the team dashboard's metric columns (Auto high, Teleop high, Teleop low, Climb) · **Scouter** · ›. A no-show row shows "—" in every value column. The metric columns stay on the computer because §13.1 requires them. A row opens `/entries/:id`.
- **Progress tab:** the per-match line chart with the **view-time metric selector** (§12.5):
  - the points line is in `--accent`, with white dots
  - a broke-down match is a `--warn` diamond
  - a no-show is a gap, bridged by a faint dotted line with "—" over it, never a 0
  - the team average is a dashed `--faint` line
  - a legend sits under the chart
  - "+ Add a chart under it · up to 4" stacks another chart with its own picker and ✕ (the §12.5 expand)
- **Notes tab:** the team's **Long-text answers** at the event, newest first. Each note has a meta line, then the text as a quote: the Note look, white with a 3 px `--ink` left edge, `dir="auto"` so Hebrew runs right to left. The meta line is the match in mono, the field label in bold, "· scouter", and the time at the right in mono.
- **No entries yet:** the header shows "0 entries · not ranked yet" and "—" for the headline. The empty-state card reads "No entries for this team yet" with "Scout a match" as its one action.
- **No photos anywhere.**

## Feature decisions

| Feature | Decision |
|---|---|
| D's layout: stat tiles, stat rows with a trend line, notes as quotes | Now |
| Per-metric trend line (sparkline) on every stat row (D, NEW) | Now |
| Match strip on the Matches tab only (C, NEW) | Now |
| Phone match list: match · status · scouter · points; no station, no field values (B, user) | Now |
| Scouter name in the match list and table (user) | Now |
| Desktop table keeps the metric columns (§13.1) | Now |
| Next-match chip in the header (A, NEW) | Not taken |
| Event-average tick on every bar (B, NEW) | Not taken |
| One scrolling page with jump tabs (B) | No: tabs |
| Match strip on every tab (C) | No: Matches tab only (user) |

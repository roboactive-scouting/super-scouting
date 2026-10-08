# THEME — D1 "Pit Wall"

**Chosen 2026-10-06** from the four concepts in `docs/design/concepts/` (living spec §19.2, "Second redesign"). **Light only**, plus the outdoor high-contrast theme the spec requires (SPEC-FINAL §8.6, §17.4).

This file and `theme.css` are the single source for colour, type and shape:

- **Every mockup links `docs/design/theme.css` and defines no colour of its own.**
- **Every component treatment the user picks during a page round is written into "Locked components" below at once.** Later pages reuse it, and later variants only vary what is still open.
- When the build starts, the app's tokens are generated from these values. Nothing in the app is styled from memory or from an old screen.

The concept file `docs/design/concepts/src/d1-pitwall.html` shows the look this theme came from. Where it and this file differ, this file wins.

## Character

A clean, light work tool, calm and readable:
- neutral grey page, white cards with 1 px borders and no shadows
- one dark charcoal sidebar that holds the logo
- a single deep emerald accent for the primary action, "done" and "selected"
- numbers in a monospace, so team and match numbers line up and read at a glance

## Palette

Contrast is measured against white `--surface` and grey `--bg`. WCAG AA needs 4.5:1 for text and 3:1 for control boundaries and large text.

| Token | Value | Role | Contrast (surface / bg) |
|---|---|---|---|
| `--bg` | `#F4F6F8` | Page background | — |
| `--surface` | `#FFFFFF` | Cards, panels, inputs | — |
| `--line` | `#E3E7EC` | Card and table borders (decorative only) | 1.24 / — |
| `--line-2` | `#EEF1F4` | Row dividers inside a card | — |
| `--control-border` | `#808A96` | Borders of inputs, selects, toggles and other controls | 3.50 / 3.23 |
| `--ink` | `#141820` | Primary text | 17.8 / 16.4 |
| `--ink-2` | `#3A424E` | Secondary text, values | 10.2 / 9.4 |
| `--muted` | `#5F6977` | Labels, captions, helper text | 5.56 / 5.14 |
| `--faint` | `#9AA3AE` | Ticks, rank numbers, decoration. **Never text a user must read.** | 2.55 / 2.36 |
| `--rail` | `#161A21` | Sidebar background | — |
| `--rail-raised` | `#232933` | Current item in the sidebar | — |
| `--rail-ink` | `#C9CFD8` | Sidebar text | 11.1 on rail |
| `--rail-muted` | `#7D8693` | Sidebar group labels | 4.74 on rail |
| `--accent` | `#12795B` | Primary button, "done", "selected", the highlighted series in a chart | 5.37 / 4.96 |
| `--accent-ink` | `#0B5A43` | Accent text on `--accent-tint` | 7.13 on tint |
| `--accent-tint` | `#E5F2EC` | Selected row, "you" row, success badge background | — |
| `--on-accent` | `#FFFFFF` | Text on `--accent` | 5.37 |
| `--warn` | `#94600F` | Warning text and marks | 5.33 / 4.92 |
| `--warn-tint` | `#FBF1E1` | Warning badge background | — |
| `--alliance-red` | `#B53A33` | Red alliance | 5.80 / 5.36 |
| `--alliance-red-tint` | `#FBEAE8` | Red alliance background | — |
| `--alliance-blue` | `#2F62C8` | Blue alliance | 5.67 / 5.24 |
| `--alliance-blue-tint` | `#E8EEFB` | Blue alliance background | — |

**Changed from the concept for accessibility:**
- `--muted`, `--warn` and `--alliance-red` are slightly darker than in the D1 images, so they pass 4.5:1 on every surface and tint.
- `--control-border` is new: the concept's `--line` is only 1.24:1, too faint for an input's edge.

**Rules**
- The logo's yellow appears **only in the logo**, and the logo sits **only on `--rail`** or another dark surface. No UI element uses the logo's colours.
- Alliances are always red and blue. The accent is never red or blue, so "selected" can't be mistaken for an alliance.
- Colour is never the only signal. Every status, alliance and chart mark also has a word, a number or a shape.
- The lock mark (a locked entry, §6.2) is an icon, not the 🔒 emoji, so it takes the text colour and the OS never swaps its look.
- Text on `--ink` or `--rail` fills uses `text-surface`. There is **no on-dark token**: a future dark theme must add one (it would also replace `--rail-ink` on the rail), or `text-surface` turns dark on dark.

## Type

| Role | Face | Use |
|---|---|---|
| UI and headings | **Schibsted Grotesk** 400 / 500 / 600 / 700 / 800 | Everything except numbers |
| Numbers | **JetBrains Mono** 400 / 500 / 600 | Team numbers, match numbers, counts, stats, times (`.num`) |

Scale: 12 · 13 · 14 (body) · 15 · 17 · 22 · 26 · 30 px. Page titles are 24–30 px at weight 700–750 with a slight negative letter-spacing. Section titles are 13.5–17 px at weight 650.

## Shape and space

- **Radii:**
  - 6 px: tags and badges
  - 8 px: buttons and inputs
  - 12 px: cards
  - 999 px: switches and chips
- **Borders, not shadows.** Cards and panels use a 1 px `--line` border. Only floating layers (a sheet, a menu, a dialog) get a shadow, and that shadow is decided when the first one is designed.
- **Space:** 4 px base (4, 8, 12, 16, 20, 24, 32).
- **Touch targets:** at least 48 px (`--tap-min`), per SPEC-FINAL §17.7.

## Layout

- **Desktop (≥ 1024 px):**
  - a 232 px dark sidebar (logo mark and team name at the top, nav groups, the account at the foot)
  - a 60 px white top bar (where you are, plus sync status chips)
  - content on `--bg` with 32 px side padding
- **Phone (< 1024 px):** closed 2026-10-07, `pages/11-phone-shell/final/`. A `--rail` top bar, a `--rail` bottom bar with Scout raised in the middle (hidden on the entry route), and a narrow dark menu.

## Locked components

Each page round adds a row here: what was picked, which page it came from, and the date. CSS reference: `pages/01-entry/src/entry.css` + `pages/01-entry/final/final.css`.

| Component | Treatment | From page / date |
|---|---|---|
| Segmented control (e.g. robot status) | Grey `--line-2` track, 3 px inset. Segments are 46 px tall. The selected segment gets `--accent-tint`, `--accent-ink` text and a 2 px inset `--accent` ring | Entry, 2026-10-06 |
| Tabs | Equal-width tabs in a white bar. The current tab is filled `--accent-tint` with a 3 px `--accent` underline; done tabs show a ✓ in `--accent`. Each tab is 44 px tall | Entry, 2026-10-06 |
| Pane header | Title 18 px / 750, then "n of N" in `--muted`, then pager dots (current one is a 20 px `--accent` pill) | Entry, 2026-10-06 |
| Counter | Label and hint on the left. On the right, − (white, `--control-border`), the value (JetBrains Mono 22 px) and + (filled `--ink`). Buttons are 50 px, `--radius-control` | Entry, 2026-10-06 |
| Switch | 52 × 32 px. Off: white with a `--control-border` edge and a `--muted` knob. On: `--accent` with a white knob | Entry, 2026-10-06 |
| Option buttons (single select) | Equal-width, 48 px, white with a `--control-border` edge. Selected: 2 px `--accent` border on `--accent-tint` | Entry, 2026-10-06 |
| Text area / number input | White, `--control-border`, `--radius-control`, 48 px min height (input), unit shown in `--muted` | Entry, 2026-10-06 |
| Primary action bar (phone) | White bar pinned to the bottom with a `--line` top border. A full-width 52 px `--accent` button | Entry, 2026-10-06 |
| Bottom sheet | Dark scrim `rgba(20,24,32,.45)`, white sheet with 20 px top corners, a grab handle and an upward shadow. The first floating layer with a shadow | Entry, 2026-10-06 |
| Summary list | White card, `--line` border. Group headings are 12 px `--muted`; rows show the label in `--muted` and the value in `--ink` 600 | Entry, 2026-10-06 |
| Note (inline explanation) | White, `--line` border with a 3 px `--ink` left edge, 13.5 px text | Entry, 2026-10-06 |
| Alliance tag | `--alliance-*-tint` background, `--alliance-*` text, `--radius-tag` | Entry, 2026-10-06 |
| Station tile | Alliance tint (`--alliance-*-tint`), label "RED 1" 11 px / 700 in the alliance colour, team number in JetBrains Mono 19 px, name 12 px. Picked: `--accent-tint` with a 2 px inset `--accent` ring. Done: `--line-2` grey with ✓ or 🔒 at the top right. "YOUR STATION" tag: 10.5 px / 800 white on the alliance colour (on `--accent` when picked) | Scout, 2026-10-06 |
| Station pill | 32 px pill in the alliance tint with a location-pin icon, e.g. "Blue 2" | Scout, 2026-10-06 |
| Large number field | 56 px, `--control-border`, JetBrains Mono 26 px value with a muted prefix ("Q"). Focused: 2 px `--accent` border | Scout, 2026-10-06 |
| Select (dropdown) | 56 px, white, `--control-border`, 15 px / 600 text, chevron in `--muted` | Scout, 2026-10-06 |
| Alliance buttons | Two equal 52 px buttons with a small alliance square. Selected: 2 px alliance border on the alliance tint, text in the alliance colour | Scout, 2026-10-06 |
| Search field | 46 px, white, `--control-border`, magnifier in `--muted` | Scout, 2026-10-06 |
| Selectable list row | ≥ 56 px card row: radio, team number (mono 20 px) and name. Selected: 2 px `--accent` border on `--accent-tint` with a filled radio | Scout, 2026-10-06 |
| Success banner | `--accent-tint` with a light green border, a round `--accent` check and a bold `--accent-ink` first line | Scout, 2026-10-06 |
| Warning flag | `--warn-tint` background, `--warn` text, `--radius-tag`, e.g. "Not in line-up" | Scout, 2026-10-06 |
| Stat tile | White card, `--line` border. Label 12 px / 600 `--muted`, value JetBrains Mono 24 px (warning counts in `--warn`), note 12 px `--muted` | Home, 2026-10-06 |
| Our-team card | `--rail` dark card with the logo mark, team in mono white, rank "#3 / 42" in mono 26 px, sub-line in `--rail-muted`. The only dark card in the content area | Home, 2026-10-06 |
| Go-to tile | White card with a 36 px icon square (`--line-2`), title 15 px / 700 and a one-line description in `--muted`, › at the top right. Admin tiles: dark `--rail` icon square plus an "ADMIN" label instead of › | Home, 2026-10-06 |
| Coverage grid | One rounded square per match: `--accent` = all robots, `#9CCBB8` = missing a robot, `--line-2` with a `--line` edge = not played. Legend below, then the missing matches named in mono | Home, 2026-10-06 |
| Ranked list row | Rank in mono `--faint`, team number in mono plus name in `--muted`, a 60 px sparkline (`--faint`, last point dot), value in mono at the right. Our team: an `--accent-tint` row with an accent sparkline | Home, 2026-10-06 |
| Season chips + event cards (switcher) | Season pills (selected: filled `--ink`). Event cards: white, name 15 px / 650, dates `--muted`. Current: `--accent-tint` with a 2 px `--accent` border and a "Current · default" tag | Home, 2026-10-06 |
| Session banner | `--warn-tint` box, bold `--warn` lead, followed by a full-width secondary "Back to …" button | Home, 2026-10-06 |
| Sign-in frame | Desktop: a 44% `--rail` plate with the full lockup (~300 px), the form alone on `--bg` at 380 px, version at the foot. Phone: a `--rail` band with the lockup (120 px; 84 px when a notice shows), then the form | Login, 2026-10-06 |
| Password field | The text input with an eye button (40 px hit area, `--muted`) at the right. Showing: eye-off in `--accent-ink` | Login, 2026-10-06 |
| Error line | White, `--line` border with a 3 px `--warn` left edge, warning icon in `--warn`, text `--ink` 600. Never red: red means the red alliance | Login, 2026-10-06 |
| Warning notice | `--warn-tint` box with a light amber border and a `--warn` icon, text `--ink` (e.g. "Your sign-in expired") | Login, 2026-10-06 |
| Robot status tag | 24 px tag, 12.5 px / 650, with a shape: **Played** `--line-2` / `--ink-2` with a green dot · **Broke down** `--warn-tint` / `--warn` with a diamond · **Disabled** white with a 1 px `--warn` outline and a hollow square · **No show** white with a 1 px `--control-border` outline and a dash. None is red | Entries, 2026-10-07 |
| Filter chips | 34 px pills, `--control-border`, 13 px / 600 with a mono count. Selected: filled `--ink`, white text | Entries, 2026-10-07 |
| Data table | White card, `--line` border. Header 12 px / 650 `--muted` (sorted column in `--ink` with an arrow), 46 px rows with `--line-2` dividers, numbers in mono, numeric columns right-aligned. A row note (e.g. refused) sits on its own line under the row | Entries, 2026-10-07 |
| Waiting marker | A 14 px amber (`--warn`) ↑ beside the time; nothing for sent | Entries, 2026-10-07 |
| Entry card (phone) | White card: match (mono `--muted`), team (mono 17 px), name; points at the right (mono 22 px, "pts" under it, "—" in `--muted` when none); a second line of station, status, first name, time | Entries, 2026-10-07 |
| Empty state | White card, a 44 px `--line-2` icon square, title 17 px / 700, a `--muted` explanation, one primary action | Entries, 2026-10-07 |
| Current-user card ("Scouting now") | White card, `--line` border: a 40 px initials circle (`--line-2`), a 12 px / 600 `--muted` label over the name 15.5 px / 650 | Switch scouter, 2026-10-07 |
| Info note | The Note (white, 3 px `--ink` left edge) with an 18 px info icon and a bold lead ("Stays on this device:") | Switch scouter, 2026-10-07 |
| Line-up grid (typed) | Rows per match: match label in mono, six 44 px cells under alliance-tinted headers (RED 1 … BLUE 3, 11.5 px / 750), each cell the team number in mono 14.5 px over its name 11 px `--muted`. Empty: dashed `--control-border` on `--bg`. Off roster: 2 px `--warn` on `--warn-tint`, "Not on roster". Focused: 2 px `--accent` with a 3 px `--accent-tint` halo and a suggestion list | Manage, 2026-10-07 |
| Suggestion list | White, `--line` border, 10 px radius, soft shadow; rows of mono number + name, the highlighted row on `--accent-tint`; a "+ New …" row in `--accent-ink` | Manage, 2026-10-07 |
| Problem bar | A strip on `--bg` under a toolbar: ⚠ items in `--warn` 650, an action link in `--accent-ink`, a muted hint at the right | Manage, 2026-10-07 |
| Team card (roster) | 48 px white card: number in mono, name, × at the right. Not on the roster: dashed on `--bg` with + in `--accent-ink` | Manage, 2026-10-07 |
| Event card | White card: name 15 px / 650, position "#n" in mono `--muted`, then "Make default" (or the Default badge) and ↑ ↓ ✎ icon buttons. The default event: `--accent-tint` with a 2 px `--accent` border. "+ New event": dashed | Manage, 2026-10-07 |
| Match card (phone) | White card: match label in mono with a warn sub-line ("1 empty"), two rows of three 24 px alliance-tinted number pills (red, blue), › at the right | Manage, 2026-10-07 |
| Desktop-only gate | The empty-state card with a monitor icon, "This needs a computer", today's explanation and a secondary "Back to scouting" | Manage, 2026-10-07 |
| Role tag | 24 px tag: **Admin** filled `--rail` with white text · **Scout lead** white with a 1 px `--control-border` outline · **Scouter** `--line-2` / `--ink-2` | Users, 2026-10-07 |
| Account status tag | "Active": `--accent-tint` / `--accent-ink` · "Disabled since …": `--line-2` / `--muted` | Users, 2026-10-07 |
| Initials circle | 32 px circle on `--line-2`, 12 px / 700 initials in `--ink-2` (40 px in cards, `--accent` when it is the current or chosen person) | Users, 2026-10-07 |
| Row quick actions | Secondary 32 px buttons with an icon, at the row's right end, shown on hover or keyboard focus; the hovered row is on `--bg` | Users, 2026-10-07 |
| Dialog (desktop) | Centred, 16 px radius, white, `0 24px 60px -20px rgba(20,24,32,.45)` shadow over the sheet scrim; title 20 px / 750 with × at the right; actions right-aligned (secondary, then primary). The desktop twin of the bottom sheet | Users, 2026-10-07 |
| Described choice | Equal-width 56 px option buttons with a 15 px / 650 label and an 11.5 px `--muted` description; selected = 2 px `--accent` on `--accent-tint` | Users, 2026-10-07 |
| Handover box | `--accent-tint` with a light green border, a round `--accent` check and a bold first line; the secret in mono 22 px on a white field; the "shown once" line under it | Users, 2026-10-07 |
| **Destructive button** | **Filled `--ink`** with white text and an icon (e.g. ⊘). Used for the action that starts a destructive flow and for the confirm button in its dialog. Never red (red is the red alliance), never the accent | User detail, 2026-10-07 |
| Destructive confirmation | The desktop dialog: title as a question, the object's name in bold, the body, then **Cancel** (focused first) and the filled-ink confirm button naming the object ("Disable Yael Shapira"). Errors show inside. On a phone: the same content as a sheet | User detail, 2026-10-07 |
| Danger section | A white section card with a 3 px `--ink` left edge holding a destructive action and its explanation | User detail, 2026-10-07 |
| Saving state (described choice) | The picked option shows "Saving…" in `--accent-ink` in place of its description; the other options dim to 50 % and can't be picked; on success a green "Saved. …" line with a ✓ follows | User detail, 2026-10-07 |
| Live checks | A list under a field: an 18 px circle then a 13 px / 600 rule. Not yet checked: empty `--control-border` circle, `--muted` text. Met: filled `--accent` with a white ✓, `--accent-ink` text. Not met: `--warn` circle with ✕, `--warn` text | Change password, 2026-10-07 |
| Account menu | The sidebar's account corner opens a white menu above it (10 px radius, soft shadow): Switch scouter · Change password · a divider · Sign out, each with a 16 px icon; the hovered item on `--accent-tint`. The corner shows `--rail-raised` while open | Change password, 2026-10-07 |
| Phone top bar | `--rail`, 54 px: ☰ (44 px target), logo mark, page title 16 px / 650 white, and a sync pill on `--rail-raised` at the right ("● 3 waiting" amber · "● All sent" green · "● Offline" grey) | Entry 2026-10-06, confirmed with the phone shell 2026-10-07 |
| Phone bottom bar | `--rail`. Home · Scout · Entries. **The current page is the raised button**: a 58 px `--accent` square (18 px radius) with a `--rail` ring, its icon and a white label below. It moves with the page; on any other page nothing is raised. The others are flat tabs: icon + 11.5 px label in `--rail-muted` (amended 2026-10-08; before that, Scout was always raised). Entries carries an amber mono count badge when something is waiting. Hidden on the entry route | Phone shell, 2026-10-07 |
| Phone menu (drawer) | 252 px `--rail` panel from the left over the scrim; closes with ✕, a scrim tap or a swipe left (2026-10-08): brand row with ✕, a sync line on `--rail-raised`, nav groups as in the sidebar (46 px rows, current on `--rail-raised`), the account at the foot (initials, name, role; Switch scouter · Change password · Sign out; version and team) | Phone shell, 2026-10-07 |
| Builder top bar | Title 21 px / 750 with the season in mono `--muted`; under it a **version chip** (24 px tag: draft `--line-2`, published `--accent-tint` with a lock) with a chevron, the change line in `--muted`, then "● Unsaved changes" (`--warn`) or "✓ Saved hh:mm" (`--accent-ink`). Actions: 36 px secondary buttons **Match timer** and **More ▾**, a divider, then Save draft + Publish (primary). A held Publish gets a `--warn` line under the actions with a "Next incomplete →" link | Form builder, 2026-10-08 |
| More menu | The Account menu's surface (white, 10 px radius, soft shadow) at 300 px: icon + 13.5 px / 650 title + a 12 px `--muted` line per item; a divider before the destructive item; hovered item on `--accent-tint` | Form builder, 2026-10-08 |
| Version banner (locked) | The Note with a lock icon: bold lead naming the entry count, then what changes in place and what starts a new version | Form builder, 2026-10-08 |
| Field palette row | 26 px `--line-2` icon square, name 13.5 px / 650, a one-line `--muted` description (ellipsis), a `--faint` grip at the right | Form builder, 2026-10-08 |
| Live canvas item | White card (10 px radius) drawing the real entry control; a `--muted` grip outside its left edge; the key (mono 11.5 px `--muted`) and a points tag at its top right. Selected: 2 px `--accent` ring + 3 px `--accent-tint` halo. Incomplete: 4 px `--warn` left edge + a "⚠ Needs meaning" warn tag. The canvas column is 410 px on `--line-2`, under the Entry tabs with counts, "Phase n of 4" + pager dots, and a foot naming the previous / next phase | Form builder, 2026-10-08 |
| Settings group | 13.5 px / 750 title + `--muted` note; groups split by a `--line-2` rule. A complete group folds to one line: chevron, title, "✓ Complete" in `--accent-ink`, and a `--muted` summary. A blank required control: 2 px `--warn` edge + "Needed to publish" (11.5 px / 700 `--warn`) beside its label | Form builder, 2026-10-08 |
| Key line | A `--bg` strip under the pane head: "Key" + the key in mono 12.5 px / 600; a lock and "permanent" once saved, or "follows the label until the first save" before it | Form builder, 2026-10-08 |
| Scoring matrix | Phase columns (11.5 px / 700 `--muted`, right-aligned) × value rows; 32 px mono cells right-aligned, `--control-border`; a 0 cell is `--faint` on `--bg` with a `--line` edge; focused = the focused input | Form builder, 2026-10-08 |
| Mirroring preview | Two small field drawings with an arrow between: "A blue scout taps" (blue dots) → "Saved as (red's side)" (ink dots), captions 11.5 px / 650 `--muted`, then one hint line | Form builder, 2026-10-08 |
| Field drawing | The season image stand-in: `--line-2` field with a `--control-border` edge, alliance-tint end zones, a dashed `--faint` centre line, white goals with an `--ink-2` edge. Marks: dots in the scout's alliance colour with a white edge (numbered in white mono when they are spots), earlier marks `--faint`, paths 1.8 px round-joined lines (others at 45 %, the one being drawn dashed) | Form builder, 2026-10-08 |
| Map button | ≥ 76 px white row with a `--control-border` edge: a 112 px thumbnail of the field drawing, a 15 px / 650 count ("3 spots") over a `--muted` "Tap to open the map", › at the right. Empty: dashed edge, "Mark on the map" in `--accent-ink` | Form builder, 2026-10-08 |
| Map pop-up (phone) | Full screen over the app: white header (✕ 44 px target, title 17 px / 750, a `--muted` sub-line, the station tag), the field drawn upright **with the scout's own alliance end at the bottom** ("your alliance"), a 12.5 px hint, then a white bar: 44 px secondary tools (Undo · Clear path with an eraser icon · Finish / New path), a count, and the full-width 52 px Done | Form builder, 2026-10-08 |
| Map dialog (computer) | The Dialog at ~820 px with the field lying flat, **own alliance end on the left**; one 40 px row of the same tools, the count and Done at the right | Form builder, 2026-10-08 |
| Remove pill | Tapping a mark selects it (a 1.4 px `--ink` ring, or a white halo under a thicker path) and shows a small `--ink` pill with a pointer above it: "✕ Remove" / "✕ Remove path" in white 650 | Form builder, 2026-10-08 |
| Event-log buttons and tap chips | Equal 52 px filled `--ink` buttons, label 14 px / 650 with the tap count in mono under it; taps as 30 px `--line-2` chips: a pin (alliance colour) when the tap has a place, label, mono time, ✕; then "Undo last tap" and the count | Form builder, 2026-10-08 |
| Timer field | Ready: a small centred `--accent` pill "▶ Start" (drawn 40 px × ~130 px, tap area 48 px), a small "Unsure — no time" switch under it. Running: a 64 px `--accent-tint` face with an `--accent` edge (mono 30 px time, "● Running"); below it two 46 px pills **Pause** (`--accent-tint`, 2 px `--accent`) and **Clear** (secondary, ↺). Paused: grey `--bg` face, "Paused", a ✎ edit button; **Resume** (filled `--accent`) + **Clear**. Unsure: dashed face "No time recorded · unsure" | Form builder, 2026-10-08 |
| Season chips (labelled) | The switcher's season pills with a label: year in mono, then a 11.5 px / 500 `--muted` word ("active", "no forms yet"); the active season also carries a 7 px `--accent` dot (white with an accent ring on the selected chip). Selected: filled `--ink`, label in `--rail-ink`. Never coloured words | Forms list, 2026-10-08 |
| Form card | White card, 12 px radius: a 40 px dark icon square, the name 18 px / 750 over a `--muted` meaning line, the status tag and ⋯ at the right; a stat row (bordered boxes: label 11.5 px / 650 `--muted`, value mono 20 px); then the versions; then Open builder (primary) + Export. A missing form: dashed card on `--bg` with Create (primary) + Import | Forms list, 2026-10-08 |
| Version timeline | Rows joined by a 2 px `--line` rail: an 18 px dot (draft dashed, active filled `--accent` with a 4 px `--accent-tint` halo, older hollow), the title 14.5 px / 700 over a `--muted` dates line, then at the right the entries in mono and 32 px buttons (Continue / Open / View, Restore) | Forms list, 2026-10-08 |

## Open: decide during the page rounds

1. ~~**The outdoor high-contrast theme's values.**~~ **Decided 2026-10-07 (RB.1):** `[data-theme='outdoor']` in `theme.css` (black ink on white, darker accent, warn and alliances), proved by `contrast.test.ts`. The theme *switch* stays task 1.38.
2. ~~**A Hebrew font.**~~ **Decided 2026-10-07 (RB.1):** **Noto Sans Hebrew**, self-hosted through fontsource, is the fallback after Schibsted Grotesk (`--font-ui`).
3. ~~**Colours for robot status**~~ **Decided 2026-10-07 (Entries):** see "Robot status tag" above. Coverage was decided with Home.
4. **A colour-blind-safe chart palette** beyond grey plus accent, and the worst→best shading ramp.
5. ~~**The phone shell**~~ **Decided 2026-10-07:** see "Phone top bar", "Phone bottom bar" and "Phone menu" above.

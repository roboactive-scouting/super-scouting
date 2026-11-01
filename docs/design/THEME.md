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
| `--alliance-red-strong` | `#9A2F29` | A picked red station tile's fill (Scout); white text on it | 7.47 (white on it) |
| `--alliance-blue-strong` | `#2551AA` | A picked blue station tile's fill (Scout); white text on it | 7.40 (white on it) |

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
| Station tile | Alliance tint (`--alliance-*-tint`), label "RED 1" 11 px / 700 in the alliance colour, team number in JetBrains Mono 19 px, name 12 px. Picked (amended 2026-10-08): **filled with its alliance's strong colour** (`--alliance-red-strong` / `--alliance-blue-strong`), all text white, the "YOUR STATION" tag white with alliance-coloured text; was `--accent-tint` with an `--accent` ring. Done: `--line-2` grey with ✓ or 🔒 at the top right. "YOUR STATION" tag: 10.5 px / 800 white on the alliance colour (white with the strong colour's text when picked) | Scout, 2026-10-06 |
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
| Phone bottom bar | `--rail`. Home · Scout · Entries (Home · Scout · **Search** · Entries from Phase 1 H, team search 2026-10-23). **The current page is the raised button**: a 58 px `--accent` square (18 px radius) with a `--rail` ring, its icon and a white label below. It moves with the page; on any other page nothing is raised. The others are flat tabs: icon + 11.5 px label in `--rail-muted` (amended 2026-10-08; before that, Scout was always raised). Entries carries an amber mono count badge when something is waiting. Hidden on the entry route | Phone shell, 2026-10-07 |
| Phone menu (drawer) | 252 px `--rail` panel from the left over the scrim; closes with ✕, a scrim tap or a swipe left (2026-10-08): brand row with ✕, a sync line on `--rail-raised`, nav groups as in the sidebar (46 px rows, current on `--rail-raised`), the account at the foot (initials, name, role; Switch scouter · Change password · Sign out; version and team) | Phone shell, 2026-10-07 |
| Multi select | Equal 48 px option buttons with an 18 px check box; selected = 2 px `--accent` on `--accent-tint`, the box filled `--accent` with a white tick; "Pick any that apply" under them and an `--accent-ink` "Undo “…”" for the last toggle | Entry parts, 2026-10-09 |
| Rating (stars) | Five equal 56 px boxed buttons, each a 22 px star over an 11 px word (Poor · Weak · OK · Good · Great). Up to the pick: `--accent` star on `--accent-tint` with an `--accent` edge; the pick: a 2 px `--accent` ring and `--accent-ink` word. Unanswered: outlined in `--control-border` | Entry parts, 2026-10-09 |
| Rating (slider) | A 6 px `--line` track with an `--accent` fill and a 28 px white knob with an `--accent` edge; 1–5 under it in mono, the value in `--accent-ink` | Entry parts, 2026-10-09 |
| Computed value | A `--line-2` read-only row: calculator icon, the name 14.5 px / 600 over the formula in words (`--muted`), the value in mono 22 px at the right | Entry parts, 2026-10-09 |
| Section heading (entry) | 12 px / 750 uppercase `--muted` with 0.06em tracking, followed by a 1 px `--line` rule | Entry parts, 2026-10-09 |
| Required mark | "Required" 11.5 px / 650 `--muted` beside the field label; when missed, a `--warn` line under the control: "⚠ Required — pick one" | Entry parts, 2026-10-09 |
| Out-of-range field | The input gets a 2 px `--warn` edge on `--warn-tint`; one 13 px / 650 `--warn` line with ⚠ naming the limit. The value is kept | Entry parts, 2026-10-09 |
| Problems list | The bottom sheet (phone) or Dialog (computer) "n things to fix first": rows ≥ 56 px with a 26 px `--warn-tint` ⚠ square, the field 14.5 px / 650 over "phase · reason", and "Go to ›" in `--accent-ink`; then Keep editing | Entry parts, 2026-10-09 |
| Sticky match timer | `--rail-raised` bar. Phone (under the top bar): ~44 px running — phase tag 10.5 px on `--accent`, countdown mono 20 px (amber `#f2c36b` in a phase's last 10 s), "m:ss / 3:00" mono 12 px in `--rail-ink`, a 32 px ↺; a 4 px bar of one segment per phase sized by its length (done `#6f7a88`, current filling `--accent`, rest `#3a414c`). Ready: a 36 px `--accent` "▶ Start match" pill (48 px tap). Over: `--rail`, "MATCH OVER". Desktop: one slim bar across the top of the form card, countdown 18 px In code the mockup's literal timer colours (`#f2c36b` amber, `#3a414c` / `#6f7a88` bar) become tokens with outdoor values (outdoor check, 2026-10-09) | Entry parts, 2026-10-09 |
| Practice strip | Under the top bar on every screen: `--warn-tint` with a 2 px `--warn` bottom edge, a PRACTICE tag (white on `--warn`), "Nothing is saved", and a white "Exit practice" pill | Entry parts, 2026-10-09 |
| Desktop field row | On the desktop Entry page a field is one row: name and hint on the left, the control in a 440 px column on the right (counters right-aligned), rows split by `--line-2` | Entry parts, 2026-10-09 |
| SUPER tag | 22 px `--rail` tag, 11 px / 800 white "SUPER" with 0.06em tracking, at the right of a super entry's header | Super scouting, 2026-10-09 |
| Team status row | ≥ 56 px white row: team number mono 18 px, name 14.5 px / 600 over a 12 px `--muted` line ("seen in 4 matches here"), a 24 px status tag at the right — "To do" `--line-2` / `--ink-2`, "✓ Done 11:20" `--accent-tint` / `--accent-ink`; a done row dims its number | Super scouting, 2026-10-09 |
| Progress line | 12.5 px label with the count in mono at the right ("6 of 20"), over a 6 px `--line` bar filled `--accent` | Super scouting, 2026-10-09 |
| "Seen here" chips | 12 px `--muted` "Seen here in", then match labels as mono 11.5 px chips on `--line-2` | Super scouting, 2026-10-09 |
| Settings row | Groups under an 12 px / 700 uppercase `--muted` label; rows ≥ 56 px in one white card split by `--line-2`: a 32 px `--line-2` icon square, the name 14.5 px / 600 (with a 12 px `--muted` line), and at the right the value in `--muted` with ›, or a switch | Settings, 2026-10-09 |
| Theme tile | A 78 px picture of the app in that theme (rail bar, text lines, both alliance colours, the accent button) over a radio, the name 14 px / 650 and a 11.5 px `--muted` line; picked = 2 px `--accent` on `--accent-tint` | Settings, 2026-10-09 |
| Live example | A bordered `--bg` box with a 10.5 px / 800 `--muted` "PREVIEW" label, holding real entry controls (a counter, option buttons) drawn in the picked theme and size; at the top of the Theme and Text size choices | Settings, 2026-10-09 |
| Text size steps | The segmented control with four steps, each an "Aa" at its own size over the percent in mono 11 px | Settings, 2026-10-09 |
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
| Phase editor (Match timer) | Rows: grip · # · phase select with a colour square · length (mono, m:ss in `--muted`) · delete; dashed "+ Add a phase"; a 30 px proportional bar of the phases (neutral and accent tints, labelled); "Match ends at **180 s** (3:00)" | Form builder, 2026-10-08 |
| Code editor (Edit as JSON) | A `--control-border` box: a `--bg` gutter with `--faint` line numbers (the bad one in `--warn`), mono 12.5 / 21 px text with keys in `--accent-ink`; the bad line on `--warn-tint` with a 3 px `--warn` edge; the Error line under it naming line and column | Form builder, 2026-10-08 |
| Saved-exports picker | Radio rows (≥ 52 px): title 14 px / 650, a `--muted` "fields · saved by … when" line, and "deleted in n h" in mono at the right; selected = 2 px `--accent` on `--accent-tint`; then an "Or a file from your computer" link | Form builder, 2026-10-08 |
| Type to confirm | Under a destructive confirmation's body: "Type `delete match form` to confirm" (the phrase in mono on `--line-2`) and a 42 px input; the filled-ink button stays disabled until it matches | Form builder, 2026-10-08 |
| Sync status strip | White card: the state 15 px / 700 with a 7 px dot (Offline `--faint` · Online `--accent` · Sending a 14 px spinner, `--line` ring with an `--accent` top), a 12 px `--muted` line under it ("last sync 11:40 · sends by itself"), the primary **Sync now** (44 px) at the right, then a 44 px **⋯** button on a phone. Sending: the Progress line ("Sent · 2 of 5") replaces the sub-line and the button reads "Sending…", disabled | Sync, 2026-10-12 |
| Tabs in a card (with counts) | A white card of equal tabs, 44 px, 13.5 px / 650 `--ink-2` with the count in mono 12 px `--muted`; the current tab `--accent-tint` with a 3 px `--accent` underline; a 7 px `--warn` dot before a tab that needs attention | Sync, 2026-10-12 |
| Sync record card | Rows in one white card split by `--line-2`: match (mono 13 px `--muted`), team (mono 16 px) and name, the robot status tag (or SUPER) at the right; under it the station tag, "saved 11:47" (time in mono) and the origin badge; optional lines: "+ New match — sends with this entry" (12.5 px `--ink-2`), the Error line for a refused record. Sent rows dim the team and add "✓ 11:49" in `--accent-ink`; a row being sent sits on `--bg` with the spinner | Sync, 2026-10-12 |
| List group heading | A `--bg` band inside the card, 12 px / 700 `--muted`, the right side 600 ("this event · 4"); in a table it is a full-width row | Sync, 2026-10-12 |
| Origin badge | 20 px `--line-2` tag, 11.5 px / 650 `--ink-2` with a 12 px icon: a phone "This phone", a QR "QR · from Yael" | Sync, 2026-10-12 |
| "Shown by QR" mark | 12 px / 600 `--ink-2` with a QR icon and the time in mono ("shown by QR 11:44"); no fill, since it is not a receipt | Sync, 2026-10-12 |
| Conflicts link | `--warn-tint` row with a light amber border, a 30 px white icon square (merge icon in `--warn`), a bold count line over a 12 px explanation, and "Review ›" in `--warn` 650 at the right. Leads and admins only, only while conflicts are open | Sync, 2026-10-12 |
| Discarded notice | The Warning notice with a bold lead ("2 entries were removed from this phone."), the reason, a 12.5 px list of what went (match · team · scouter · time), then 32 px secondary **Dismiss** and **See the log** | Sync, 2026-10-12 |
| Received-from row | ≥ 52 px row: a 32 px initials circle, the name 14 px / 650 over "last scan 11:44" in `--muted`, the count in mono 18 px at the right, under a "Received by QR · 12 from 3 scouters" group heading | Sync, 2026-10-12 |
| Conflict card | White card: head (match or SUPER, station tag, team mono 17 px + name; a kind tag — "Edited on two phones" with a merge icon or "Scouted twice" with a copy icon, `--line-2` / `--ink-2` 11.5 px / 700 — and "n fields differ" 12 px / 650 `--warn`); the diff table; two 44 px buttons side by side (a divergence: Keep … primary + Restore … secondary; a duplicate: two secondary Keep …). Computer: two columns, who + buttons stacked on the left (300 px), the diff on the right | Conflicts, 2026-10-12 |
| Diff table | Field (34 %) · copy · copy. Column heads on `--bg`: first name 12.5 px / 700, client time in mono, and the "Counted now" tag. A differing row: `--warn-tint` with a 3 px `--warn` left edge, values `--ink` 650; a matching row: `--muted`. A last row "Show the n that match ⌄" / "Show only the differences ⌃" in `--accent-ink` 650 | Conflicts, 2026-10-12 |
| "Counted now" tag | 20 px `--accent-tint` tag, 11 px / 700 `--accent-ink`, on the copy the statistics use until a lead picks | Conflicts, 2026-10-12 |
| Settled line (Undo) | The success-banner look on one line: a round `--accent` check, "**Kept Dana's copy** · Q12 2096", and at the right "Undo" in `--accent-ink` 700 with a 20 px countdown ring (2 px `--accent`, the seconds in mono) | Conflicts, 2026-10-12 |
| Settled log | A 12 px / 700 uppercase `--muted` label, then a white card of rows: a `--accent-ink` ✓, the match · team in bold and what was kept, and "10:17 · Noa L." in mono `--muted` at the right | Conflicts, 2026-10-12 |
| QR plate | A full-screen page on `--rail` (a dialog with a `--rail` left panel on a computer): the code on a white card (radius 14 px, 10 px padding), black on white only; head 16 px / 700 white over a 12 px `--rail-ink` line; one 52 px primary action at the thumb with an 11.5 px `--rail-muted` line under it; a secondary button on dark is an outline in `--rail-muted` with white text | QR send, 2026-10-20 |
| Frame strip | One 6 px segment per frame, 3 px apart, radius 2: on dark, `--rail-raised` waiting, muted green already shown this pass, white on screen (on light: `--line`, light green, `--accent`); "Frame 4 of 11" in mono beside it | QR send, 2026-10-20 |
| Scanner screen | Full screen on `--rail`: head 16 px / 700 white with "Sound on" 12 px `--rail-ink` at the right; the camera (radius 14 px) with white 28 px aim corners; a 64 px ring (10 px stroke, `--accent` on `--rail-raised`, the count in mono 22 px over "of 11"); a 52 px outline-on-dark Done at the thumb. On a computer: camera left, a 140 px ring (`--accent` on `--line`) at the right | QR receive, 2026-10-20 |
| Frame cells | One numbered cell per frame in an even grid, 22 px tall (26 px on a computer), radius 3, mono 11 px: missing `--rail-raised` (`--line` on light), collected `--accent` with white numbers | QR receive, 2026-10-20 |
| Success screen | The whole screen turns `--accent`: a 96 px white circle with an `--accent` check, the line "Got it, Yael!" 30 px / 800 white, the count in mono 64 px, a 15 px `#d8efe5` detail line; the primary button turns white with `--accent-ink` text, a text-only white secondary under it | QR receive, 2026-10-20 |
| Read only chip | 22 px `--line-2` tag, 11.5 px / 700 `--ink-2` with a 13 px eye icon, in a header before the SUPER tag. Never a warning: reading is not an error | Read-only super entry, 2026-10-20 |
| Author card | White card: a 34 px `--line-2` initials circle, "Dana Mor’s entry" 14.5 px / 650 over a 12 px `--muted` line (started · last changed · seen in n matches); under the card a 12.5 px `--muted` line with a lock icon saying who can change it | Read-only super entry, 2026-10-20 |
| Done-by tag | The super picker's Done tag with who: "✓ You 11:02" or "✓ Dana 10:40" (`--accent-tint`, `--accent-ink` 650) | Read-only super entry, 2026-10-20 |
| Team header | The page's own sticky white `<header>` with a `--line` bottom edge: team number in mono (40 px desktop / 30 px phone), name 22 / 17 px 700 over a 12–13 px `--muted` line, the headline at the right (11.5 px `--muted` label over mono 32 / 26 px) and the rank badge ("#4 of 42", `--line-2`, 46 px tall on desktop, a 26 px "Rank #4 / 42" tag on a phone). Phone: a ‹ back button. Scrolled (phone): one 9 px-padded line (number mono 19 px · name 14.5 px · headline mono 17 px · rank tag) with a soft shadow | Team page, 2026-10-23 |
| Value shading | Worst → best as a lightness scale of the accent: `color-mix(in srgb, var(--accent) 6–52 %, var(--surface))`, text stays `--ink`, the number always printed; a 5 px-radius chip around a mono value. `lower_is_better` reverses it; `neutral` and min = max are flat `--line-2`; no data is a bare `--muted` "—" | Team page, 2026-10-23 |
| Stat row | Label 14 px / 550 `--ink-2` · the value in a Value shading chip · a 6 px `--line` bar with an `--accent` fill (`--faint` for neutral; `role="meter"`) · a 58–64 px sparkline (1.5 px `--accent`, end dot). Rows 40 px split by `--line-2`, grouped under 30 px `--bg` rows (11.5 px / 650 `--muted`) | Team page, 2026-10-23 |
| Match strip | One cell per match, oldest → newest: 7 px radius, `--line` edge, label mono 10 px `--muted` over points mono 14 px, filled with Value shading. Broke down: a 3 px `--warn` bottom edge; no show: dashed `--control-border`, "—". A white band under the tabs, only on the Matches tab | Team page, 2026-10-23 |
| Note quote | Meta line 12 px `--muted` (match mono `--ink-2`, field label 650 `--ink-2`, "· scouter", time mono at the right), then the text 14 px / 1.45 in a white box with a 3 px `--ink` left edge and 10 px right corners; `dir="auto"` | Team page, 2026-10-23 |
| Entry header (read only) | White, `--line` bottom edge: ‹ back + the Read only chip; match label mono `--muted`, team number mono 28 / 38 px + name 17 / 21 px 700; tags (robot status, station, form kind: grey "Match entry" or the dark SUPER); the score at the right in mono 30 / 38 px over "scouted points" ("—" over "not counted" when excluded); then a 26 px initials circle, "Scouted by **name**", DD/MM/YYYY HH:MM in mono and "form vN" | Entry preview, 2026-10-23 |
| Score band | White card: "Where the 47 points came from" 13 px / 650 with "avg 38.4" mono `--muted` at the right; a 14 px bar split by phase with 2 px gaps in three accent shades (`--accent-ink`, `--accent`, the accent at 45 % into the surface); a 12 px legend with the points in mono | Entry preview, 2026-10-23 |
| Answer rows with points | The confirmation's rows (label `--ink-2`, value 650 at the right, numbers mono) plus a 34 px points cell in mono 12 px `--accent-ink` ("+8", `--faint` "0"); each phase heading 12 px / 750 uppercase `--muted` with its subtotal in mono at the right | Entry preview, 2026-10-23 |
| Kind switch | The locked Segmented control with three segments "Both 17 · Match 14 · Super 3" (counts mono 12 px `--muted`); 340 px at the right of the chip row on a computer, full width on a phone | Entry search, 2026-10-23 |
| Super row in a list | Match cell "—", the dark SUPER tag in the status cell, no points (phone card: "whole event" in `--muted`) | Entry search, 2026-10-23 |
| Table row as a link | The Data table row plus a faint › at the end; hover / focus: the row `--accent-tint` with a 3 px `--accent` left edge and the › in `--accent`. The phone card twin: a faint › at the right, pressed = tint + edge | Entry search, 2026-10-23 |
| Rank badge (side) | 24 px `--line-2` tag, "#7" in mono 12.5 px / 600 `--ink-2`; the top 3 on `--accent-tint` / `--accent-ink` with a 15 px outline medal icon (no metal colours); no rank: 12 px `--muted` words ("not ranked yet", "not at this event") | Team search, 2026-10-23 |
| Link row (opens a page) | ≥ 60 px row whose whole area is the link: content, then a 34 px round `--accent-tint` › in `--accent-ink` (white circle on an already tinted row). Pressed / hovered / focused: the row `--accent-tint` with a 3 px `--accent` left edge, the › filled `--accent` with a white arrow; on a computer the key text underlines and "Team page ›" shows at the end in `--accent-ink` | Team search, 2026-10-23 |
| Other-event button | 36 px, dashed `--control-border` on `--bg`, ⇄ icon + 13 px / 600 `--ink-2` "Other event"; disabled offline at 45 % | Team search, 2026-10-23 |
| Show-all line | A `--bg` line closing a filtered list: "22 more 2026 teams at other events" 13 px `--muted`, "Show all ›" 650 `--accent-ink` at the right | Team search, 2026-10-23 |
| Event picker (radio rows) | The bottom sheet (Dialog on a computer): title naming the team, a one-line ask, ≥ 58 px radio rows (event name 14.5 px / 650 over "6 entries · Mar 2026" `--muted`), picked = 2 px `--accent` on `--accent-tint`; Cancel + Continue (primary) | Team search, 2026-10-23 |
| Progression chart | `--line-2` grid, mono 10 px `--muted` axes (match numbers), the series 2.2 px `--accent` with white 3 px dots, broke down a `--warn` diamond, a no-show a gap bridged by a dotted `--faint` line with "—", the average a dashed `--faint` line; the metric picker is a 34 px select at the top; legend 11.5 px `--muted` under it | Team page, 2026-10-23 |
| Category switch (two views of one list) | A `--line-2` track with a `--line` edge, 10 px radius, 4 px inset; each segment ≥ 236 px, its name 14 px / 650 over a 12 px `--muted` line naming what it holds ("Total · Auto · Teleop · Endgame · Consistency"); the current one white with a 1 px `--accent` ring. Phone: two equal 44 px segments, names only | Ranking, 2026-10-28 |
| Sort control (the sort in words) | A 40 px white button, `--control-border`, a sort icon, then the whole sort as a sentence ("**Availability**, best first · then **Breakdowns**, fewest first"; "· then" in `--muted`) and a ⌄. "Sorted by" 13 px `--muted` before it on a computer, as a small label inside it on a phone. Open: a 2 px `--accent` ring | Ranking, 2026-10-28 |
| Sort builder | A 520 px popover (10 px radius, `--line` edge, the dialog shadow) under the Sort control: a title, a one-line rule, then one 52 px row per figure (grip · "By" / "then" · Numbered sort badge + the figure 650 · a two-way direction switch — Best/Worst first, Fewest/Most first for counts — on `--line-2` with the chosen side white with an `--accent` ring · ×), then "Add a tie-breaker" with 34 px `+ Figure` pills, and a `--muted` footnote: "Still tied after every figure: by rank. Rank is always the place by Total." Only the open category's figures are offered; Consistency never. A sheet on a phone | Ranking, 2026-10-28 |
| Numbered sort badge | A 16 px `--accent` square, 4 px radius, the order (1, 2, …) mono 10.5 px / 600 in `--on-accent`, after a header that is in the sort; other sortable headers carry a faint ⇕; a header that never sorts (Consistency) carries nothing | Ranking, 2026-10-28 |
| By-phase bar | One 10 px bar per team, a segment per scoring phase with 2 px gaps: Auto `--ink-2`, Teleop `--faint`, Endgame `--muted`, each as wide as its points against the event's highest Total (in the study panel, against the team's own Total); a legend of 8 px squares in the group header. No data: "No counted matches yet" in `--muted` | Ranking, 2026-10-28 |
| Status marks (availability in a list) | The availability % (mono 13 px, `--ink-2`; bold `--ink` under 100 %) with, before it, one Robot status shape per problem match — ◆ broke down (`--warn`), hollow square disabled (`--warn` edge), – no show (`--ink-2`) — in that order; a clean team shows the % alone | Ranking, 2026-10-28 |
| Status spread bar | One row of blocks per team, 20 px tall, 4 px radius, each as wide as its count and printing its shape and count (mono 11.5 px): Played `--line-2` with a `--line` edge and the green dot, Broke down `--warn-tint` / `--warn`, Disabled white with a `--warn` edge, No show white with a `--control-border` edge. Played and Broke down sit left of a 2 px `--ink-2` line headed "On the field · Played + Broke down", Disabled and No show right of it under "Missed". It counts the team's scouted matches | Ranking, 2026-10-28 |
| Team study panel / summary sheet | Computer: a white panel beside the list (kicker "Team study", the team 22 px mono + name, "Rank n of N · n matches counted", **Open team page →**, ×), the selected row `--accent-tint` with a 3 px `--accent` edge. Phone: the same content in the bottom sheet, a 48 px close and a 48 px **Open team page →** at the bottom. Content: "Where the points come from" (the figure 26 px mono, a 14 px By-phase bar, Phase · Avg · Share · Place, the best place as an `--accent-tint` "1st · best" tag), Consistency (± figure, a range strip 0–120 with the Total ± SD band and a 2 px `--ink` mean tick, "Typical match: 59–104 points"), "How dependable" (the % 26 px, the Status spread bar, a 2 × 2 tally of the four statuses, "A breakdown counts as available…") | Ranking, 2026-10-28 |
| Delete bill | The face of a cascade delete (and of a blocked one): a dialog (940 px; 860 blocked) or phone sheet that opens on an `--ink` band, 26 × 32 px padding. Kicker 13 px / 650 uppercase `--rail-ink` with a ⚠ ("Delete Season 2025 · hard delete · cannot be undone") and "Counted on the server just now" at the right in `--rail-muted`; the biggest count in mono 64 px / 600 with its noun 22 px beside it and one sentence under it; at the right, the counts as rows split by `--rail-line` (mono 17 px, noun 650, a 12.5 px `--rail-ink` line under), two columns when they are many. Below on white: the title as a question 20 px / 750, one line, numbered steps (24 px ringed numbers) in `--line` cards, then the footer note and Cancel + the Destructive button. Replaces the Destructive confirmation for deletes | Delete, 2026-10-28 |
| Are-you-sure pop-up | A single record with nothing to type: a centred white pop-up (16 px radius, the dialog shadow) over the scrim, also on a phone — "Are you sure?" 19 px / 750, the object as a `--line` card (match · team mono 16 px, the station tag, team, scouter, time; points at the right), one line on what happens and that there is no restore, then Cancel (focused) and the filled-ink "Delete entry" side by side, 52 px | Delete, 2026-10-28 |
| Blocked tag and ways forward | A white 26 px tag on the bill with a slashed circle and "Blocked"; below, the reason as the title ("Version 1 can't be deleted"), one line, then one `--line` card per way forward (title 650, a `--muted` line, one button; the safe way focused). No delete button, nothing to type. On a phone the ways are full-width 52 px buttons, the fix first as primary | Delete, 2026-10-28 |
| Station tiles | Six 44 px tiles in a 3 × 2 grid, Red 1–3 in `--alliance-red-tint` / `--alliance-red`, Blue 1–3 in the blue pair, 12.5 px / 650 with a mono 11 px state ("saved") under the word — the entries that hold a match | Delete, 2026-10-28 |
| Backup command box | `--bg` box, `--control-border`, a 40 px header ("Terminal · two lines: the tables, then the rows (SETUP.md › Backup)", 12.5 px / 600 `--muted`) with **Copy both** at the right, then the two SETUP.md lines in mono 11–11.5 px, wrapping on a phone. Never the bare `supabase db dump` | Delete, 2026-10-28 |

## Open: decide during the page rounds

1. ~~**The outdoor high-contrast theme's values.**~~ **Decided 2026-10-07 (RB.1):** `[data-theme='outdoor']` in `theme.css` (black ink on white, darker accent, warn and alliances), proved by `contrast.test.ts`. The theme *switch* stays task 1.38.
2. ~~**A Hebrew font.**~~ **Decided 2026-10-07 (RB.1):** **Noto Sans Hebrew**, self-hosted through fontsource, is the fallback after Schibsted Grotesk (`--font-ui`).
3. ~~**Colours for robot status**~~ **Decided 2026-10-07 (Entries):** see "Robot status tag" above. Coverage was decided with Home.
4. **A colour-blind-safe chart palette** beyond grey plus accent. *(The worst→best shading ramp was decided 2026-10-23 with the Team page: see "Value shading" above.)*
5. ~~**The phone shell**~~ **Decided 2026-10-07:** see "Phone top bar", "Phone bottom bar" and "Phone menu" above.

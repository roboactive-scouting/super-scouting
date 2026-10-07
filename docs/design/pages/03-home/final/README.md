# Home page (`/`) — closed 2026-10-06

**The code must look like `home-desktop.png` and `home-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 03-home final` re-renders them. Spec: SPEC-FINAL v1.7 §17.9 (Home row), living spec v0.55.

Chosen: **variant B, refined twice ("B3")**, with the user's phone order.

## Desktop (top to bottom)

1. "This device is working on" plus the event name. On the right: **Switch competition** (secondary) and **Scout a match** (primary).
2. Four tiles:
   - **Your station** (pill, "Change it on Scout")
   - **Waiting to send** (count, last sync time)
   - **Your last entry** (match · team, how long ago, Open)
   - **Our team** (dark card: 2096, rank #N of M, average, places moved)
3. **Go to** tiles: Entries, Switch scouter, then Manage and Users, which are ADMIN-tagged with a dark icon. There's **no Scout tile**, because Scout is the primary button.
4. **Schedule coverage** (left) and **Top teams** (right).
5. Version footer.

## Phone (top to bottom)

1. The event name, **Scout a match** (full width) and **Switch competition** (full width, secondary).
2. **Your station** (small tile) beside **Your last entry** (larger tile with "Open ›"). Under them, a small line: "● 3 entries waiting to send · last sync 09:08", or "Everything is sent".
3. **Our team** card.
4. **Schedule coverage** (12 per row).
5. **Top teams**.
6. **Go to** tiles (2 columns; admin tiles for admins only). On a phone the admin **Manage** tile reads **"Matches · Create matches and line-ups"** and opens the matches-only phone view of Manage (amended 2026-10-07 with the Manage round; see `07-manage/final/`). The phone drawer's Admin group names it the same way. **Users is not offered on a phone** (no Go-to tile, no drawer item): it needs a computer, so a phone tile would only lead to "This needs a computer" (user, 2026-10-07).
7. Version.

## States

- **Switch competition** opens a bottom sheet (dialog on desktop): season chips, then that season's event cards; the current one is marked "Current · default".
  - Choosing another event sets the session override.
  - Home then shows the warning banner "Looking at … for this session" with **Back to …**, and Scout is withheld (unchanged rule).
- **Offline:** competitions other than the default are disabled in the sheet, with today's message. Sync shows as waiting.
- **No competition:** today's message, with "Set up a competition" for admins.
- **A scouter (not admin)** sees no Manage or Users tiles.

## What's built when

| Part | When |
|---|---|
| Event, Scout, Switch competition sheet, override banner, station, waiting to send, last entry, Go-to tiles, schedule coverage | **Now** (with the redesign build) |
| Our-team rank card | **After ranking** (living spec §11.2 #4). Hidden until then; desktop then shows three tiles in that row |
| Top teams with trend line | **After the stats engine and ranking**. Hidden until then; coverage takes the full width |

## Features decided (2026-10-06)

| Feature | Decision |
|---|---|
| Station on Home | Yes |
| Waiting to send, with last sync | Yes |
| Last entry with Open | Yes |
| Go-to tiles for the app's places (admin ones admin-only) | Yes |
| Schedule coverage naming the matches missing a robot | Yes |
| Competition switching in a sheet | Yes |
| Our-team rank card | Wanted, after ranking (spec §11.2 #4) |
| Top teams with trend line | Wanted, after ranking (spec §11.2 #4) |
| Entries today / robots scouted (all devices) | No |
| Big action tiles (variant C) / Send now button | No |
| Recent entries list with sent / waiting (variant D) | No |

# Round 28 — Delete (Phase 1 J): the brief each variant subagent received

Written from `docs/design/VARIANT-BRIEF.md`, with the premise slot used since round 27's second draw. Sources: SPEC-FINAL §3.9, §17.8; plan tasks 1.60 and 1.61. Every subagent got this text plus its own premise and letter.

---

You are designing one part of a scouting app for an FRC robotics team (team 2096, RoboActive): the **delete confirmation**, the one pattern used for every delete in the app. Design it the way you think works best. Other designers are working on the same brief separately, each from a different premise; you will not see their work, and yours should stand on its own.

## The part

When something is deleted, a confirmation opens over the page it was started from:

- An **admin** deletes a season, an event or a form on a laptop, usually at home between events.
- A **lead or admin** deletes a scouting entry (a wrong team, a duplicate) or a match, often on a phone at a loud venue, between matches.

The confirmation must make the damage impossible to miss, and it must not slow down a safe single delete.

## Your premise

<PREMISE>

Let the premise decide what leads the confirmation and how it is structured, on the phone and on the desktop. Every requirement below still holds.

## It must show and do

- **One pattern everywhere.** The same confirmation is used for every kind of delete: season, event, form, form version, match and entry. It changes only with what the rules below require.
- **It names the object** being deleted, exactly (for example "Season 2025", "Q12 · 2096 RoboActive").
- **It states what is lost as exact counts**, for example "this deletes 3 events, 246 matches and 1,912 entries". The counts come from the server, so a cascade delete needs a connection.
- **The destructive verb is on the primary button**, naming the object ("Delete season 2025"), never "OK" or "Yes". **Cancel is the safe default and is focused first.**
- **The destructive button is filled `--ink` with white text, never red.** In this app, red means the red alliance only.
- **Type-to-confirm only for multi-record irreversibles:** delete a season, an event, a form or a form version. The admin types the object's name, and the delete button stays disabled until the typed text matches exactly, including case.
- **A plain confirm for a single record**, such as one entry or a match with no entries. There is nothing to type.
- **Back up first.** Every hard (cascade) delete tells the admin to run `supabase db dump` before going ahead. The admin runs it in a terminal; the app cannot run it for them. Show the command so it can be copied.
- **Hard versus soft:**
  - Seasons, events and forms are **hard cascade deletes**: admin-only, irreversible, and the rows are physically removed. Deleting a season also deletes its events, their matches and entries, its forms with every version, and its metrics, dashboards and presets. Deleting a form deletes every entry bound to it.
  - Deleting an entry is a **soft delete** by a lead or admin. The entry stops counting everywhere (statistics, lists, ranking) once it syncs. The row is kept in the database, but there is no restore in this version.
- **Blocked, not confirmed:** some deletes would orphan collected data, so they are refused with an explanation and a way forward. There is **no confirm control and nothing to type**, and no text overrides the refusal.
  - A **form version** with entries bound to it: delete the whole form instead (which takes its entries with it), or keep the version.
  - A **match** that has entries: correct the match number instead, or delete its entries first.
  - The **active season** or the **default event**: "Switch the active season first." / "Switch the default event first."
- The confirmation works on a computer and on a phone. Touch targets are at least 48 px on a phone.
- Status, danger and the alliances are never shown by colour alone: a word or a shape goes with them.

## Draw these states

1. **Desktop (1440 wide):** an admin deletes **Season 2025** from the Manage page's Competitions tab. Show the type-to-confirm with "202" typed so far, so the button is still disabled. Show the counts and the backup step.
2. **Desktop (1440 wide):** an admin tries to delete **version 1 of "Match form 2026"**, which has entries bound to it. The delete is blocked.
3. **Phone 1:** a lead deletes **one entry**, Q12 · 2096 RoboActive, from that entry's preview page. A plain confirm.
4. **Phone 2:** a lead tries to delete match **Q41**, which has entries. The delete is blocked.

Draw the page each confirmation opens over just enough to show where it came from. That page is not what is being designed.

## Mock data

- **Season 2025** (last year; not the active season, which is 2026):
  - 3 events: ISR District #1, ISR District #4, ISR District Championship.
  - 246 matches.
  - 1,912 entries: 1,804 match entries and 108 super entries.
  - 2 forms with 7 versions in all.
  - 4 dashboards, 2 weight presets.
- **Match form 2026, version 1:** published 02/03/2026 and replaced by v2 on 09/03/2026. It has 312 entries bound to it.
- **Entry:** Q12 · team 2096 RoboActive · red 2 · scouted by Yael Shapira at 11:02 · 47 points. The lead is Noa Levi. One entry is deleted.
- **Match:** Q41 at ISR District Event #3. It has 6 entries (one per robot), the last saved at 13:18.
- The admin is Noa Levi. The device is online. Three entries are waiting to send.

## Theme and shell (fixed)

- **Colours, type and shape:** link `docs/design/theme.css` (from your page: `../../../theme.css`) and use only its tokens. Read the "Palette", "Type", "Shape and space" and "Layout" sections of `docs/design/THEME.md`, and skip "Locked components". Use no colour of your own.
- **Shared files:** link `docs/design/pages/shell.css` (`../../shell.css`) after the theme, and load `docs/design/pages/shell.js` (`../../shell.js`) at the end of the body. Don't change shell.css or shell.js.
- **Desktop shell:** `<div class="desk"><div data-desk-shell="manage" data-nav="stats" data-crumb="Manage"> …the page behind and your confirmation… </div></div>`. This gives the dark sidebar and the top bar. Use `data-desk-shell="manage"` for state 1 and state 2 (the form builder sits under Manage).
- **Phone shell:** `<div class="phone"><div data-phone-shell data-title="Entry" data-bbar="none" data-time="13:20"> …your content… </div></div>`. This gives the status bar, the dark top bar and the dark bottom bar; `data-bbar="none"` draws the bar with no tab raised (neither page is on it). For the match, use `data-title="Manage"`.
- Your own CSS uses class names with your letter as a prefix (for example `a-`), so they don't collide with the shell's.

## Make the image

- Your files are the page `docs/design/pages/28-delete/src/<letter>-tall.html` and anything it loads, kept in `docs/design/pages/28-delete/src/<letter>/`. Don't read or change any other page's folder or another letter's files, except the shared files named above.
- The page draws a **2000 × 1660** canvas: `<div class="canvas">` with a `<div class="canvas-head"><b>Delete — <LETTER> · <your name for the design></b><span>one line on the idea</span></div>`, then two `<div class="frames">` rows, each frame in a `<figure class="frame">` with a short `<figcaption>`:
  - Row 1: desktop state 1 and Phone 1.
  - Row 2: desktop state 2 and Phone 2.
  - Each desktop frame is `.desk` (1440 × 900 at `zoom: 0.8`). Set `.phone { zoom: 0.8 }` in your CSS.
- Render it with `bash docs/design/pages/render.sh 28-delete <letter>-tall`, run from the repo root `C:\dev\frc-scouting`. The PNG lands in `docs/design/pages/28-delete/out/<letter>-tall.png`. Open it with the Read tool and check it: nothing cut off, nothing overlapping, text readable. Fix it and render again until it is clean.
- Tag every feature that is not in "It must show and do" with a black NEW tag (`<span class="new">NEW</span>` from shell.css).
- Write files with LF line endings (use the Write tool, not Python).
- Don't commit, switch branches or touch anything outside your own files.

## Reply with

1. The image path.
2. One line naming the design idea.
3. Each NEW feature, one line each.
4. Nothing else.

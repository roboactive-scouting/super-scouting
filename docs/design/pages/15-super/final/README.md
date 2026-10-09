# Super scouting (`/super`) — closed 2026-10-09

**The code must look like these images:**
- phone: `super-phone.png` — the Scout card, the team picker, the form, an existing entry reopened, and the confirmation
- desktop: `super-desktop.png` — the picker on the left, the form on the right

The `.html` files are the source, and `bash docs/design/pages/render.sh 15-super final` re-renders them. Shared CSS and JS are in `../src/`. The page also uses `../../14-entry-parts/src/` (fields, desktop rows) and `../../02-scout/src/` (station tiles). Spec: SPEC-FINAL v1.24 §8.1; living spec v0.75. Task 1.36.

Chosen: **variant A ("Team list")** with **variant C's "Watching" match tiles** on top (user, 2026-10-09: "do what you offered").

## The rule (SPEC-FINAL §8.1)

- A super entry is **one per team for the whole event**: the active season's `super` form, a team from the event roster, and **no match, no alliance, no robot status, no match timer**.
- Opening a team that already has a super entry **on this device** opens that entry for editing; it does not start a second one.

## The way in

A **Super scouting** card at the foot of Scout: a dark icon square with an eye, "One entry per team for the whole event", and ›. It is not a nav row.

## The picker

1. "Super scouting" and "Israel District #1 · one entry per team for the whole event".
2. **Watching Q41** (mono, with a Q prefix), "next after your last Scout match", and **Change**. Under it, that match's six teams as the Scout station tiles (red left, blue right).
   - A team already super-scouted shows "Super done" and a ✓ on a grey tile.
   - Tapping a tile opens that team.
   - The match only chooses which teams to show; **the entry stores no match**.
   - With no line-up on this device, a note says so and the list below is the way in.
3. **Progress:** "Super-scouted on this device · 6 of 20", with a thin accent bar.
4. **Search** (number or name), then the chips **To do · Done · All** with counts. To do is preselected.
5. **The list:** rows ≥ 56 px — team number in mono, name, "seen in 4 matches here", and a status tag at the right ("To do" grey, or "✓ Done 11:20" green).
   - To do is ordered by matches seen on this device, most first.
   - Done rows dim the number and reopen the entry.

## The form

- **Header:**
  - "‹ Super scouting" and a dark **SUPER** tag
  - the team (number in mono, then the name)
  - "Israel District #1 · the whole event · draft saved 11:43"
  - **"Seen here in Q12 · Q19 · Q27 · Q33"**: the matches this device scouted the team in, as mono chips
- **Reopened:** an accent-tint line "✎ Editing your entry from 11:20 — your changes update it".
- **The phases:** only the phases the super form has fields in, as the Entry page's phase tabs ("Phase 2 of 3"). The fields are the locked entry parts (`14-entry-parts`), and on a computer they use the desktop field rows.
- **Review entry**, then the confirmation sheet (the dialog on a computer):
  - "Submit the super entry?"
  - "**1690 Orbit** · Israel District #1 · the whole event. No match is recorded."
  - the answers by phase
  - Keep editing · Submit entry

## Features decided (2026-10-09)

| Feature | Decision |
|---|---|
| Team list (A) | Now |
| "Watching Q41" with the six station tiles (from C) | Now — "cheap" (user): it reuses Scout's tiles and the device's line-up |
| "Seen here in Q12 · Q19…" on the form | Now |
| To do / Done / All chips with counts, and the progress line | Now |
| To-do teams ordered by matches seen here | Now |
| The Super scouting card on Scout | Now |
| Coverage grid (B), ‹ › stepping (D) | Not chosen |

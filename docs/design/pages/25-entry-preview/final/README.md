# 25 · Entry preview — final

- desktop: `entry-preview-desktop.png`, a played match entry, seen by a lead
- phone: `entry-preview-phone.png`: a match entry (top), the same scrolled to the end, a no-show seen by a scouter, and a super entry

The `.html` files are the source, and `bash docs/design/pages/render.sh 25-entry-preview final` re-renders them. Shared CSS and JS are in `../src/`: `ep.css` and `ep.js` hold the pieces, and `final.js` holds the screens. The page also loads `24-team/src/team.css` and `team.js`, which provide the status tags, the phone frame and the bottom bar. Spec: SPEC-FINAL v1.41 §13.4; living spec v0.93. Task 1.52.

Chosen: **variant B, "Score breakdown"**, plus D's **Team page** and **Edit** buttons (user, 2026-10-23).

## Behaviour

- **Route:** `/entries/:id`, a full page, never a drawer. Rows of Entries, entry search and the team page's match table open it. **‹ Entries** returns to where the user came from. On a computer the sidebar marks Entries, and the crumb reads "Entries / Q37 · 1690 Orbit".
- **Header** (white, `--line` bottom edge):
  - The first line has ‹ back and, at the right, the grey **Read only** chip (page 22's). On a computer the chip sits with the tags instead.
  - The match label in mono `--muted` ("Q37"; "Whole event" for a super entry), the team number in mono 28 / 38 px and the name.
  - Tags: robot status (locked), the alliance station, the form kind ("Match entry" grey; **SUPER** dark for a super entry).
  - At the right, the **scouted points** in mono 30 / 38 px over "scouted points". A no-show or disabled entry shows "—" over "not counted". A super entry has no score and shows nothing there.
  - The who-and-when line: a 26 px initials circle, "Scouted by **Omer Katz**", the time as **DD/MM/YYYY HH:MM** (24-hour, local) in mono, and "form v3" (the entry's form version).
- **Score band** (match entries with a score only): "Where the 47 points came from", with the team's average at the right ("avg 38.4"). Under it is a 14 px bar split by phase in three accent shades (Auto `--accent-ink`, Teleop `--accent`, Endgame the accent at 45 %). A legend with the points per phase follows.
- **The answers:**
  - One card per group of phases, with a 12 px uppercase `--muted` phase heading and its **subtotal** at the right ("14 pts", mono).
  - Rows: the field label in `--ink-2`, the value at the right in 650 (numbers in mono), then the row's **points** in mono 12 px `--accent-ink` ("+8"). A scored field that earned nothing shows a `--faint` "0", and an unscored field has no points cell.
  - A long-text answer sits under its label, wrapping, with `dir="auto"`, so Hebrew runs right to left.
  - A map field reads "6 spots" over "⤢ Tap to view" in `--accent-ink`, and opens the map view only (UF.24).
  - On a computer: the band and the buttons share the first row; the scored phases are on the left and Post-match on the right.
- **No-show / disabled:** no band and **no field rows**. In their place is a Note: "**The robot did not show up.** A no-show entry records no field values, and the statistics leave it out — it is never counted as zero." (The disabled entry has the same note with its own lead.)
- **Super entry:** the SUPER tag, no score and no band. The answers are by phase, without points.
- **Buttons** (two equal 40 px secondary buttons, at the end of the page on a phone and beside the band on a computer):
  - **Team page** goes to `/teams/:teamId`.
  - **Edit** opens the entry in its form (`/entry/:matchId/:teamId`, or `/super` for a super entry). It shows **only to someone allowed to edit** (§7.6):
    - the scouter's own match entry, within its 5 minutes
    - the scouter's own super entry, at any time
    - a lead or admin, always
  - Anyone else gets Team page alone, full width.

## Feature decisions

| Feature | Decision |
|---|---|
| B's layout: header, who and when, answers by phase | Now |
| Score band: where the points came from, with the team average (B, NEW) | Now |
| Phase subtotals and points on each scored row (B, NEW) | Now |
| Form version in the who-and-when line (B, NEW) | Now |
| Team page button (D) | Now |
| Edit button, only for who may edit (D, NEW) | Now |
| Pager to the team's previous and next entries (D, NEW) | Not taken |
| The other five robots of the match (D, NEW) | Not taken |
| Details card (A) | No: the header carries the details |
| Phase tabs with read-only cards (C) | No |

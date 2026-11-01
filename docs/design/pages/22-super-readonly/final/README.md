# 22 · Another scouter's super entry, read only — final

- desktop: `super-readonly-desktop.png`, the picker at the left and the read-only entry at the right (Noa is a scouter)
- phone: `super-readonly-phone.png`: the picker with who did each Done row, Dana's entry read only, the same scrolled

The `.html` files are the source, and `bash docs/design/pages/render.sh 22-super-readonly final` re-renders them. Shared CSS and JS are in `../src/`; the page builds on `15-super` (header, picker) and draws the answers as the confirmation does (`ConfirmEntry`, UF.24). Spec: SPEC-FINAL v1.35 §7.6, §8.1; living spec v0.87. Task 1.47, side task 2.

Chosen: **variant B, "A quiet page that says whose it is"**, plus A's **names on the picker's Done rows** (user, 2026-10-20).

## Behaviour

- **Who sees it:** a scouter who opens a team whose super entry another scouter wrote. The author, leads and admins get the editable form, as today.
- **The picker:** each Done tag says who and when: "✓ **You** 11:02" for the signed-in scouter's own entry, "✓ **Dana** 10:40" for another's (the first name of the entry's `scouter_id`; the time it was first saved). Everything else on the picker is unchanged. The "Super-scouted on this device · 6 of 20" count already includes other scouters' entries the device holds; the names make that visible.
- **The header** is the super form's: "‹ Super scouting", the team, "Israel District #1 · the whole event", "Seen here in Q12 · …". At the right, before the **SUPER** tag, a grey **Read only** chip with an eye icon.
- **Whose entry:** a white card with the author's initials (34 px circle), "**Dana Mor’s entry**" and "Started 10:40 · last changed 11:12 · seen in 5 matches" (the matches the author scouted this team in, from the entries the device holds; left out when none). Under it, in `--muted` with a lock icon: "Only Dana, a lead or an admin can change it."
- **No warning.** Reading is not an error, so today's Warning notice ("… is locked — ask a lead to change it") is **replaced** by the chip and the line above.
- **The answers:** one white card, a `--muted` 12 px heading per phase (only phases with fields), then the confirmation's rows: name at the left in `--ink-2`, value at the right in `--ink` 600. A long text answer sits under its name, left-aligned, wrapping. A **map field** is one row: what it holds ("5 spots") over "⤢ Tap to view" in `--accent-ink`; the whole row opens the map **view only** (UF.24). An empty answer shows "—".
- **Nothing edits:** no field controls, no phase tabs, no Review entry, no bottom bar. On a computer the right-hand card holds the same.

## Feature decisions

| Feature | Decision |
|---|---|
| Quiet read-only page: Read only chip, the author's card, "Only Dana, a lead or an admin can change it." (B) | Now |
| Names on the picker's Done rows: "You" or the first name, and the time (A) | Now |
| Initials on the picker's Done rows (B) | No: names instead (user) |
| The lock line as a Warning notice (A) | No: replaced by B's header |
| Read-only answers paged by phase tabs (C) | No |
| A peek sheet over the picker (D) | No |

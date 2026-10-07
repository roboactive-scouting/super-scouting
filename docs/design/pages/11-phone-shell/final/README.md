# Phone shell (every page below 1024 px) — closed 2026-10-07, amended 2026-10-08

**The code must look like `shell-phone.png`.** The `.html` file next to it is the source, and `bash docs/design/pages/render.sh 11-phone-shell final` re-renders it. Spec: SPEC-FINAL v1.15 §17.9 (navigation); living spec v0.63.

Chosen: **variant D, "Dark bars, Scout in the middle"**, with a **narrow menu** (user: "don't make it open too much").

## Top bar (`--rail`)

From the left:
- ☰ (44 px target)
- the logo mark
- the page title (16 px / 650, white)
- the sync pill at the right on `--rail-raised`: "● 3 waiting" (amber dot), "● All sent" (green), "● Offline" (grey)

It replaces the provisional phone top bar.

## Bottom bar (`--rail`)

- **Home**, **Scout** and **Entries** sit in that order (Scout in the middle). A tab that isn't the current page is flat: an icon plus an 11.5 px label in `--rail-muted`.
- **Entries** carries the waiting-to-send count, flat or raised, as a small amber badge (mono). There is no badge when nothing is waiting.
- **The current page is the raised button** *(amended 2026-10-08, UI fix round)*: a raised 58 px `--accent` (green) square with a `--rail` ring, its icon, and a white label below. **It moves with the page:** Home raised on Home (image 1), Scout on Scout (image 7), Entries on Entries (image 3, the badge stays on it). On any other page nothing is raised or green (image 6). The user wanted the green mark and the bigger icon to show where you are. Before this, Scout was always the raised green button, so it read as the current page everywhere.
- **Hidden on the Entry page** (unchanged rule): the entry's own bottom action bar takes the space.
- **Later:** with Team search and Ranking, the bar becomes Home · Teams · **Scout** · Ranking · Entries: two tabs either side of the raised Scout (image 5). **[RAISED BY ME]** This amends the "at most four, Entries returns to the drawer" rule: four tabs plus the raised Scout, and Entries stays in the bar.

## Menu (☰): a narrow dark drawer, 252 px

From the left edge, over a scrim, full height under the status bar. It closes with ✕, a tap on the scrim, or **a swipe left** that the drawer follows under the finger *(added 2026-10-08)*. Top to bottom:
1. Logo mark, "RobActive Scout" and "Team 2096", then ✕.
2. **Sync line** on `--rail-raised`: "● 3 waiting to send", then "last sync 09:08" under it.
3. **Competition:** Home · Scout · Entries (the current one on `--rail-raised`).
4. **Admin** (admins only): **Matches** (opens Manage's phone matches view). No Users on a phone.
5. At the foot, **the account:** initials, name and role, then **Switch scouter · Change password · Sign out**, and the version and team in `--rail-muted`.

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Dark top and bottom bars | Now |
| Raised Scout button in the middle | Now |
| Waiting count badge on Entries | Now |
| Sync line in the menu | Now |
| Version and team at the menu's foot | Now |
| Narrow menu (252 px) | Now |
| Account buttons at the top of the menu (B) | No |
| "More" tab instead of ☰ (C) | No |

# Phone shell (every page below 1024 px) — closed 2026-10-07

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

- **Home** and **Entries** are tabs: an icon plus an 11.5 px label in `--rail-muted`. The current tab is white, with a `--rail-raised` pill behind the icon.
- **Entries** carries the waiting-to-send count as a small amber badge (mono). There is no badge when nothing is waiting.
- **Scout** is a raised 58 px `--accent` button in the middle, with a `--rail` ring and its label below. It's the one primary job, always under the thumb.
- **Hidden on the Entry page** (unchanged rule): the entry's own bottom action bar takes the space.
- **Later:** with Team search and Ranking, the bar becomes Home · Teams · **Scout** · Ranking · Entries: two tabs either side of the raised Scout (image 5). **[RAISED BY ME]** This amends the "at most four, Entries returns to the drawer" rule: four tabs plus the raised Scout, and Entries stays in the bar.

## Menu (☰): a narrow dark drawer, 252 px

From the left edge, over a scrim, full height under the status bar. Top to bottom:
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

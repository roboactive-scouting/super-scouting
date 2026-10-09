# Settings (`/settings`) — closed 2026-10-09

**The code must look like these images:**
- phone: `settings-phone.png` — the rows, the Theme sheet, the Text size sheet, the app in Outdoor, and the held Wipe
- desktop: `settings-desktop.png` — the rows with the Text size dialog open

The `.html` files are the source, and `bash docs/design/pages/render.sh 16-settings final` re-renders them. Shared CSS and JS are in `../src/`. Spec: SPEC-FINAL v1.25 §8.6, §17.4, §17.9; living spec v0.76. Task 1.38; Wipe is task 1.49.

Chosen: **variant C ("Settings rows")** with **live examples** in the Theme and Text size choices (user, 2026-10-09).

## Where it lives

- A new nav group, **This device**, holding **Settings** (gear icon). It is in the sidebar on a computer and in the phone menu (drawer) on a phone, for every role.
- It is not in the bottom bar.

## The page

- "Settings", then "For this device only. Nothing here changes other phones."
- Then three groups, each with a small uppercase `--muted` label and rows in one white card (the Settings row component):
  - **Look:**
    - **Theme** · Light ›
    - **Text size** · 115% ›
  - **During a match:**
    - **Keep the screen on** ("while an entry is open"), a switch
    - **Vibrate on taps** ("a short buzz on each tap"), a switch. On a phone that cannot vibrate (iOS), the switch is disabled and the line says "this phone can’t vibrate".
  - **This device:**
    - who is signed in, the competition and the version
    - **Wipe this device** ›, with "held: 3 entries waiting to send" while anything waits
- A switch saves at once; there is no Save button.

## The choices (sheets on a phone, dialogs on a computer)

- **Theme:**
  - a **live example** at the top: a real counter and option buttons drawn in the picked theme
  - then two picture tiles, **Light** ("The everyday look") and **Outdoor** ("Black on white, stronger colours, for sunlight"). Each tile is a small picture of the app in that theme with a radio, and the picked one is ringed.
  - **Done**
  - Picking a tile switches the example and the whole app at once.
- **Text size:**
  - the same **live example** at the picked size
  - then the four steps **100% · 115% · 130% · 150%** as a segmented control, each an "Aa" drawn at that size
  - **Done**
  - "On top of your phone’s own text size."
- **Wipe this device:**
  - the destructive confirmation (§16.1 single pattern) with **Keep this device** first
  - **while entries wait to send, the wipe is held**: "3 entries are still waiting to send. Wipe is held until they are sent, so nothing is lost." The wipe button is disabled.
  - with nothing waiting (not drawn), the same sheet asks for the **lead's code** (§9.9) and **typing to confirm** (§17's multi-record rule), the Type to confirm component, before the filled-ink button enables. Task 1.49 builds it; task 1.38 shows the row and the held state.

## Outdoor theme

- The values are the app's `[data-theme='outdoor']` (decided in RB.1, `apps/client/src/styles/theme.css`), now also in `docs/design/theme.css` for mockups.
- Black on white, a darker accent and warning, darker alliance colours, and a black rail.
- Every closed page was rendered in Outdoor on 2026-10-09 (task 1.38's re-check, design side): nothing breaks. One finding: the match timer's literal colours become tokens with outdoor values (THEME.md "Sticky match timer").

## Features decided (2026-10-09)

| Feature | Decision |
|---|---|
| Settings rows with their values, choices in sheets / dialogs (C) | Now |
| Live example in the Theme and Text size choices | Now (user) |
| Theme picture tiles | Now |
| "This device" facts (signed in, competition, version) | Now |
| Wipe held while entries wait to send | Now |
| ☀ Outdoor button in the phone top bar (D) | Not chosen |
| Section cards (A), always-on preview (B) | Not chosen |

# Entry parts (Phase 1 E, tasks 1.33–1.37) — closed 2026-10-09

The small parts the Entry page (`../../01-entry/final/`) needs for Phase 1 E. They are built from its locked components, so this round had one design per part rather than four variants; only the star rating got alternatives.

**The code must look like these images:**
- phone:
  - `entry-parts-fields-phone.png`: the remaining field types (1.33)
  - `entry-parts-timer-phone.png`: the sticky match timer (1.34). **Smaller than drawn**, see below.
  - `entry-parts-rules-phone.png`: the range block and required fields (1.36)
  - `entry-parts-drafts-phone.png`: draft recovery and practice mode (1.37)
- desktop:
  - `entry-parts-desktop.png`: the same parts on the desktop Entry page, with the timer and a problem in the side panel
  - `entry-parts-desktop-review.png`: the problems dialog

The `.html` files are the source, and `bash docs/design/pages/render.sh 14-entry-parts final <name>` re-renders one. **Do not re-render `entry-parts-timer-phone`**: the user asked for the timer smaller without a new image. The smaller sizes are in `../src/parts.css` and in THEME.md "Sticky match timer", and they win over that image. Spec: SPEC-FINAL v1.23 §8.2–§8.5, §15.1; living spec v0.74.

## Field types (1.33)

- **Number:** the locked number input, 48 px, with the unit at the right. The expected range shows under it as a hint ("Between 3 and 60").
- **Multi select:**
  - equal 48 px buttons with a check box, and several can be on (selected: 2 px `--accent` on `--accent-tint`)
  - "Pick any that apply" under them
  - **Undo "Far"** takes back the last option toggled, not all of them (§8.2)
- **Rating, stars style (version D, picked 2026-10-09):**
  - five equal 56 px boxed buttons, each a star with a word under it: Poor · Weak · OK · Good · Great
  - the stars up to the pick are filled (`--accent` star on `--accent-tint`), and the pick itself gets a 2 px `--accent` ring
  - not answered: all outlined
- **Rating, slider style:** a track with an accent fill, a 28 px knob, and 1–5 under it with the value in `--accent-ink`.
- **Short text:** the 48 px text input.
- **Computed:** a grey (`--line-2`) read-only row: calculator icon, name, formula in words, and the value in mono at the right.
- **Section:** a 12 px uppercase `--muted` heading followed by a rule.
- **Required:** a quiet 11.5 px `--muted` "Required" beside the label until it is missed.

## Sticky match timer (1.34)

- **Phone:** a `--rail-raised` bar pinned under the top bar on the entry screen. It stays while the page scrolls.
  - **Ready:** one green **▶ Start match** pill and "3:00 match".
  - **Running:** the phase tag (`--accent`, "TELEOP"), the time left in the phase in mono, then "0:48 / 3:00" and ↺ reset. Under it a 4 px bar with one segment per phase, sized by the phase lengths: done segments grey, the current one filling green.
  - **Last 10 s of a phase:** the time turns amber.
  - **Reset:** an "Match timer reset · Undo" toast.
  - **Over:** "MATCH OVER" on `--rail`, "3:00", and "keep entering".
  - **Smaller than the image (user, 2026-10-09):** the running bar is about 44 px tall (padding 5 / 6 px, a 32 px row). The countdown is 20 px, the phase tag 10.5 px and the progress bar 4 px. Start match is drawn 36 px with a 48 px tap area, and reset is 32 px.
- **Desktop:** one slim bar across the top of the form card: phase, countdown, the phase bar filling the middle, the total and reset. It uses the same smaller sizes; the countdown is 18 px.
- It is guidance only: it never opens, locks or submits anything (§8.4). With no phases in the form, it is not shown.

## Range block and required fields (1.36)

- **As you type:** a number outside its expected range gets a 2 px `--warn` edge on `--warn-tint`, and one line in `--warn` ("⚠ Most is 60 seconds — check this number"). The value is kept.
- **Review entry stays pressable.** If something blocks it, a sheet titled "2 things to fix first" opens instead of the confirmation (the centred dialog on a computer).
  - It lists each problem with its phase and the reason ("Teleop · 140 is over the most, 60"; "Endgame · required, not answered"), each with **Go to ›**.
  - At the foot: **Keep editing**.
- **Go to** opens that phase and marks the field. A missed required field says "⚠ Required — pick one".
- **Desktop:** the "This entry" panel marks a phase with a problem: an amber ring and "1 to fix".
- **Never red** (red is the red alliance). This replaces task 1.36's "danger" notice.
- No show and Disabled skip all checks, as today (§8.2).

## Draft recovery and practice (1.37)

- **Draft recovery:**
  - the Note (3 px `--ink` edge) at the top of Scout: "You have an unfinished entry: Q39 · 1690 Orbit, Red 1 — last change 11:42, on this device."
  - **Resume** opens it where it was
  - **Discard** deletes it, with an Undo toast
- **Practice a match:**
  - a dashed card at the foot of Scout, with an amber flask icon: "Try the real form. Nothing is saved or sent."
- **In practice:**
  - an amber strip under the top bar on every screen: a PRACTICE tag, "Nothing is saved", and **Exit practice**
  - the header says "Practice · not saved"
  - Review entry becomes **Finish practice**
- **Finishing:** a sheet "Practice finished · Nothing was saved or sent." with **Practice another match** and **Exit practice**.

## Desktop layout of fields

- On the desktop Entry page, each field is one row: the name and hint on the left, and the control on the right at 440 px.
- Counters stay at the right edge.
- So stars and option buttons never stretch across the whole card.

## Features decided (2026-10-09)

| Feature | Decision |
|---|---|
| The field types as drawn | Now |
| Rating stars: version D (boxed stars with words) | Now. Versions A (bare stars), B (numbers and words), C (star bar) not chosen |
| Sticky match timer, smaller than drawn | Now |
| Reset with Undo on the match timer | Now |
| Range block in amber, as you type plus a problems list on Review with Go to | Now |
| Discard for an unfinished draft (with Undo) | Now |
| "Practice a match" card on Scout as the way into practice | Now |
| Practice strip, Finish practice, the practice-finished sheet | Now |
| Desktop: label-left / control-right field rows, timer bar on the form card, problems in the side panel | Now |

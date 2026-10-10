# Dispatch — Task 1.34: the sticky match timer, the Timer field and the Event-log field

Where this fits: Phase 1 E, second of three tasks. 1.33 (committed) made `FieldInput` draw every
simple type; this task adds the sticky match timer on the entry screen, the `timer` field and
the `event_log` field (with its optional "where?" map). 1.35 then adds the position and
cycle-path map fields, reusing the map pop-up you build here.

**Read first:**
- `SCR/contract.md` — the contract every implementer follows (binding).
- `SCR/task-1.34-brief.md` — your requirements, with the exact values to use verbatim.
- `SCR/task-1.33-report.md` — what 1.33 built (`FieldInput` props, input components, `useUndoable`).
- Design:
  - `docs/design/pages/14-entry-parts/final/` README §"Sticky match timer" and
    `entry-parts-timer-phone.png`, `entry-parts-desktop.png`. **The timer is smaller than its
    image**: use the README's sizes and THEME.md "Sticky match timer" (running bar ~44 px,
    padding 5/6 px, 32 px row; countdown mono 20 px phone / 18 px desktop; phase tag 10.5 px;
    progress bar 4 px; Start match drawn 36 px with a 48 px tap area; reset 32 px).
  - `docs/design/pages/12-form-builder/final/` README §"The Timer field", §"The map: one
    pattern for every map field", §"Event log where?"; `timer-phone.png`, `maps-phone.png`,
    `form-builder-desktop-try.png`. THEME.md rows: Timer field, Event-log buttons and tap chips,
    Map pop-up (phone), Map dialog (computer), Remove pill, Field drawing, Map button.
  - `docs/design/pages/01-entry/final/` — the Entry page (top bar, phase tabs).
- Spec: `docs/spec/SPEC-FINAL.md` §5.2, §5.5, §5.6, §8.2, §8.4.

**Decisions already made:**
- **Timer colours are tokens with outdoor values.** Never copy the mockup's literal
  `#f2c36b` (last-10-s amber), `#3a414c` (bar rest) or `#6f7a88` (bar done). Add tokens (e.g.
  `--timer-warn`, `--timer-bar-rest`, `--timer-bar-done`) to `apps/client/src/styles/theme.css`
  in **both** `light` and `outdoor`, register them with Tailwind the way the existing tokens
  are, and check contrast on `--rail-raised` (text 4.5:1; bar segments 3:1 against the bar) in
  both themes. Log the values and the contrast ratios.
- **`matchClock`** is the single source of `t = 0` (brief's API). It must be per entry: reset
  it when an entry opens/closes so a previous entry's origin never leaks. If a module singleton
  is kept (as the brief writes it), reset on entry mount/unmount and log it; if you need React
  state for the sticky bar to re-render, add a tiny subscribe API rather than polling in every
  component. Document exactly what `t = 0` is: Start match pressed (timed) or the first event-log
  tap of the entry (un-timed). Timer *reset* (↺) is undoable with an "Match timer reset · Undo"
  toast.
- **The timer never opens, locks or submits anything** (§8.4): prove it with the brief's
  EntryPage test (every input still enabled past the match end, phase tabs unchanged, nothing
  submitted). With no phases in `timer_config`, it is not rendered.
- **Timer field (`TimerInput`)**: one small centred green ▶ Start (drawn 40 px × ~130 px, tap
  area 48 px); running: the time face with **Pause** and **Clear** below; paused: grey face,
  "Paused", **✎** to correct the time (a number input), **Resume** and **Clear**; "Unsure — no
  time" switch: dashed face, the field submits no value (`null`). Clear is undoable back to the
  accumulated value (`useUndoable`). Decide and log what value shape it stores (seconds, number).
  The stopwatch must keep counting correctly if the component re-renders or the tab sleeps
  (compute from timestamps, never by summing interval ticks).
- **Event log**: equal 52 px filled `--ink` buttons with the tap count in mono under the label;
  taps as 30 px chips (pin in the alliance colour when the tap has a place, label, mono time, ✕),
  "Undo last tap" and the count. A tap stores `{type, t}` with `t` from `matchClock.tapTime`;
  the array stays sorted ascending by `t`; ✕ deletes only that tap.
- **"Where?"** (`config.ask_position` true; `mirror_axis` is then present — already accepted by
  `packages/shared/src/forms/config.ts` / `validate.ts`): after the tap, open the map titled
  "<button label> · where?", sub-line "<field label> · tap at m:ss · optional"; this field's
  earlier taps drawn grey; tapping again moves the new spot; **Skip · no place** stores
  `{type, t}` with **no x/y keys at all**; **Save tap** stores `{type, t, x, y}` with x/y
  normalized 0–1 and alliance-normalized (red raw; blue mirrored on `mirror_axis`).
- **The map pop-up is shared** — build it once now as a reusable component (e.g.
  `features/entry/map/MapSheet.tsx` or similar; you choose the name and log it) that 1.35's
  position and cycle-path fields will reuse: full screen on a phone (header ✕ / title /
  sub-line / station tag; field drawn upright **with the scout's own alliance end at the
  bottom**, labelled "your alliance"; a hint line; a white bar of tools + full-width 52 px
  Done), a ~820 px Dialog on a computer (field lying flat, **own alliance end on the left**;
  one row of tools, count, Done at the right; Esc / ✕ close). Use `components/ui/responsive-dialog`
  / `dialog` / `sheet` / `useModalFocus` rather than a hand-rolled modal. Phone vs computer here
  is a real viewport decision (a full-screen sheet vs a dialog), which is allowed — UF.18's
  no-window-width rule is for what `FieldInput` draws inline.
  **The rotation is display-only**: one pure function maps a tap on the drawn (rotated) image to
  image coordinates, then `normalizeForAlliance` maps to stored coordinates — stored data never
  depends on the rotation or the device. Test both directions.
  The image is the season's game image through `apps/client/src/season/FieldImage.tsx`
  (find how the entry flow knows the season and its `field_image` path). **A missing image is
  `FieldImage`'s alert, unchanged, and no coordinate may be recorded** — in that case "where?"
  offers only Skip.
- **Mirroring:** put `normalizeForAlliance` / `denormalizeForAlliance` in
  `packages/shared/src/forms/mirror.ts` **now** with 1.35's `mirror.test.ts` from
  `SCR/task-1.35-brief.md` (the brief's exact tests), because "where?" needs it; log that 1.35's
  shared file arrived one task early.
- Keep the map pop-up out of the initial bundle if it costs real KB (lazy import), and keep
  `pnpm bundle:check` ≤ 212 KB.
- Builder: add `timer` and `event_log` to `DRAWN_TYPES` in `features/builder/FieldPreview.tsx`
  so the canvas and Try it draw them (Try it's "Match clock running" switch, if present, should
  drive `matchClock` or be left as-is — check and log). Do not remove the placeholder yet (1.35).

**Prove these negatives with a test each:**
- the timer never opens, locks or submits anything (brief's EntryPage case);
- "Skip · no place" stores `{type, t}` with no `x`/`y` keys;
- a blue scout's "where?" tap is stored mirrored, and the drawing turns, not the data (same
  physical tap → same stored point whatever the display rotation);
- a missing season image fails loudly and records no coordinate;
- deleting a tap removes only that tap; un-timed: the first tap is `t = 0`;
- Clear on the Timer field is undoable back to the accumulated value.

**Screenshots (§12)**, 375 and 1440 px, `light` and `outdoor`: the entry screen with the sticky
timer ready / running / last-10-s / over (phone) and the desktop slim bar; the Timer field
ready / running / paused / unsure; the event log with chips (one with a pin); the "where?" map
full screen on a phone and as a dialog on a computer, for a red and a blue scout. Compare with
the images named above.

**Report file:** `SCR/task-1.34-report.md`.

The test floor: 164 files / 2269 tests at baseline, plus whatever 1.33 added (see its report).
On the slow wrapper the only acceptable failures are the 17 hard-coded-timeout tests in
BuilderUndo.test.tsx, BuilderPage.test.tsx, UsersPage.test.tsx, ManageRoute.test.tsx.

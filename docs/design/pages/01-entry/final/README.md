# Entry page (`/entry/:matchId/:teamId`) — closed 2026-10-06

**The code must look like `entry-desktop.png` and `entry-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 01-entry final` re-renders them. Colours, type and shape come from `docs/design/theme.css`; the components are locked in `docs/design/THEME.md`.

Chosen: **variant B, "Phase tabs"** (`../out/b.png`).

## Behaviour

- **One phase at a time** under four tabs: Auto · Teleop · Endgame · Notes. They are built from the form's phases, and a phase with no fields gets no tab.
- **You always know which phase you're in:**
  - the current tab is filled with an accent underline
  - finished phases show a ✓
  - the pane opens with the phase name, "Phase *n* of *N*" and pager dots
- **Phone: swipe left or right on the phase area to change phase.** Swiping left goes to the next phase and swiping right to the previous one. The tab highlight follows the swipe. The foot of the pane names the previous and next phase ("‹ Auto · swipe to change phase · Endgame ›"). Tapping a tab also works. With reduced motion, the phase changes without the slide.
- **Robot status:** a 4-way segmented control above the tabs (Played · Broke down · Disabled · No show).
  - Broke down shows the breakdown-time field (seconds from match start).
  - No show and Disabled hide the tabs and show the "status only, never zeros" note.
- **Counters:** label and hint on the left, compact − / value / + on the right, with 50 px buttons.
- **Toggles** are a switch, single-selects are option buttons, and long text is a textarea.
- **"Draft saved on this device · hh:mm"** sits under the title. The app already saves drafts; this line is new.
- **Review entry** is pinned at the bottom on the phone and sits in the summary panel on desktop. It is disabled until a status is chosen, as today.
- **Confirm is a bottom sheet** on the phone and a dialog on desktop:
  - it says "You can still edit it for 10 minutes after submitting" (the existing self-edit window)
  - every field is listed by phase
  - Keep editing / Submit entry, with the error shown in the sheet as today
- **Desktop: a "This entry" summary panel** on the right. It shows the status and, per phase, how many fields are filled (✓ done, ring for the current phase). Clicking a phase opens its tab, and Review entry sits at the bottom of the panel.
- The locked, conflict, not-on-device and no-form states keep today's messages, laid out in this theme.

## Features decided (2026-10-06)

| Feature | Decision |
|---|---|
| "Draft saved on this device" line | **Yes** |
| Phase tabs (one phase at a time) | **Yes** |
| Swipe between phases on the phone, with a clear current phase | **Yes** (user's addition) |
| Desktop live summary panel | **Yes**. It shows fields filled per phase rather than game-specific totals, because forms change each season |
| "You can still edit for 10 minutes" on confirm | **Yes** |
| Step-by-step flow with Back / Next | No |
| Tap-the-tile counters | No |
| Phase chips that jump through one scroll | No |
| Match line-up (all 6 teams) in the header | No |
| "Scored so far" total bar | No |
| Summary tiles on confirm | No |

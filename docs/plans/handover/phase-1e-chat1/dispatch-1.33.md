# Dispatch — Task 1.33: the entry renderer, every simple field type

Where this fits: Phase 1 E, first of three tasks (1.33 → 1.34 → 1.35) making the scouter's entry
form draw every field type. `FieldInput` (`apps/client/src/features/entry/FieldInput.tsx`)
draws only counter, toggle, single_select and long_text today. The form builder's canvas and
Try it also render through `FieldInput` (`features/builder/FieldPreview.tsx`, `LivePreview.tsx`).

**Read first:**
- `C:/Users/eldad/AppData/Local/Temp/claude/C--dev-frc-scouting/3304102f-cd89-40af-8cff-e75da53d8525/scratchpad/contract.md` — the contract every implementer follows (binding).
- `C:/Users/eldad/AppData/Local/Temp/claude/C--dev-frc-scouting/3304102f-cd89-40af-8cff-e75da53d8525/scratchpad/task-1.33-brief.md` — your requirements, with the exact values to use verbatim.
- Design: `docs/design/pages/14-entry-parts/final/` (README; `entry-parts-fields-phone.png`,
  `entry-parts-desktop.png`) and `docs/design/pages/01-entry/final/` (the Entry page the fields
  live in). THEME.md "Locked components" rows for Desktop field row and the field types.
- Spec: `docs/spec/SPEC-FINAL.md` §5.2–§5.4, §5.7, §8.2.

**Decisions already made (do them; log the ones that depart from the plan's text):**
- **Rating stars = version D:** five equal 56 px boxed buttons, each a star with a word under
  it: Poor · Weak · OK · Good · Great; filled up to the pick (`--accent` star on
  `--accent-tint`), the pick itself with a 2 px `--accent` ring; unanswered all outlined.
  Still a radio group (the brief's test uses `getAllByRole('radio')`). Slider style per README.
- **Multi-select:** equal 48 px buttons with a check box (native checkboxes, the
  `OptionButtons` pattern), "Pick any that apply" under them, and an in-field **Undo "<label>"**
  that takes back only the last option toggled (via `useUndoable`). Put the shared primitive in
  `components/ui/` (e.g. `multi-option-buttons.tsx`), and `features/entry/inputs/MultiSelectInput.tsx`
  wires it; log that `components/entry/MultiChoiceGroup.tsx` became this.
- **Desktop field row:** on the desktop Entry page each field is one row — name and hint left,
  control in a 440 px column right, counters right-aligned. Do it with container queries (UF.18),
  never window-width classes, so the builder's 410 px canvas still draws the phone layout.
- `FieldInput` gains an optional `siblingValues?: Record<string, unknown>` prop for computed
  fields (evaluate with `evaluateExpr` from `@frc/shared`'s `forms/expression.ts`); wire it from
  `EntryPage` (the current entry values) and from the builder's Try it, so a computed field
  recomputes as the scouter types. Formatting per the global constraints (2 dp for computed
  floats, integers without decimals).
- Number field: the unit at the right, expected range as a hint under it ("Between 3 and 60").
  Do **not** build the amber out-of-range block — that is task 1.36.
- "Required": a quiet 11.5 px `--muted` "Required" beside the label (just the marker; the
  missed-required behaviour is 1.36).
- Builder placeholder: `FieldPreview.tsx` has `DRAWN_TYPES` and a placeholder card for undrawn
  types. Add this task's types to `DRAWN_TYPES` (the placeholder itself is removed in 1.35, once
  every type draws). Update any builder test or harness comment that assumed computed / number
  etc. draw as the placeholder.
- The timer, event_log, position and cycle_path types are **not** yours (1.34, 1.35).

**Prove these negatives with a test each:**
- a counter is never a text input (no `textbox`/`spinbutton` for a counter field);
- multi-select Undo takes back only the last toggle (toggle A, toggle B, Undo → `[A]`, not `[]`);
- a section holds no value and draws no control;
- a computed field is read-only (no input).

**Screenshots (§12):** extend `apps/client/e2e/entry.spec.ts` (or a new `entry-fields.spec.ts`)
with a form fixture holding every type you draw, filled with realistic values, shot at 375 and
1440 px in `light` and `outdoor`. Compare with `entry-parts-fields-phone.png` and
`entry-parts-desktop.png`. Also re-shoot the builder canvas/Try it if an existing builder shot
changes.

**Report file:** `C:/Users/eldad/AppData/Local/Temp/claude/C--dev-frc-scouting/3304102f-cd89-40af-8cff-e75da53d8525/scratchpad/task-1.33-report.md`.

The test floor: the baseline `pnpm test` before any change was 164 files / 2269 tests (on the slow wrapper: 2252 pass; 17 fail only by timeouts hard-coded in BuilderUndo.test.tsx, BuilderPage.test.tsx, UsersPage.test.tsx, ManageRoute.test.tsx — those 17 may keep timing out; any other failure is real). No suite may go red.

Note from Phase 1 D: the builder's Try-it starting values and saved-data helpers were moved into
`features/entry` (look for them — e.g. `entryValues.ts`) so the entry runtime can adopt them;
use them rather than writing new ones, and give every new type a correct starting value there.

# Form builder (`/admin/forms/:formId`) — closed 2026-10-08

**The code must look like these images:**
- desktop:
  - `form-builder-desktop.png`: an event-log field selected, with the "where?" switch
  - `-new-field.png`: a new field missing its meaning, so Publish is held
  - `-position.png`: a field position with its blue-mirror preview
  - `-cycle.png`: a cycle path, with the More menu open
  - `-locked.png`: an ordinal select on the locked version, with points per option
  - `-try.png` and `-try-cycle.png`: Try it, with the map dialog open
- phone:
  - `form-builder-phone.png`: the desktop-only gate
  - `maps-phone.png`: **the scouter's map fields**, the brief for tasks 1.34–1.35
  - `timer-phone.png`: **the Timer field**, the brief for task 1.34

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 12-form-builder final` re-renders them. The shared CSS and JS live in `../src/` (`builder.*`, `complex.*`, `phones.*`, `final.js`). Spec: SPEC-FINAL v1.20 §5.2, §5.3, §5.5, §5.9, §8.2, §17.9; living spec v0.68.

Chosen: **variant D, "Live canvas"**: the form is drawn with the scouter's real controls. Round 2 added phase paging and the slimmer top bar; round 3 added the map pop-ups.

Tasks: 1.29 (shell, canvas), 1.30 (settings pane), 1.31 (Try it, JSON, import/export), 1.32 (Match timer). The map fields on the scouter's phone are 1.34 (event log) and 1.35 (position, cycle path).

## Layout (desktop, ≥ 1024 px)

1. **Top bar:**
   - "Match form 2026", with the **version chip** under it:
     - "Draft v4 · not published"
     - or "v3 · Published · Locked" with a lock
     - the chevron opens the version list: restore a published version (`restoreFormVersion`)
   - then the change line: "made from v3 · 2 fields added", plus "● Unsaved changes" in `--warn` or "✓ Saved 11:48".
   - Actions at the right:
     - **Match timer**
     - **More ▾** (Edit as JSON · Export · Import · divider · Delete form)
     - a divider
     - **Save draft** and **Publish v4** on a draft, or **Save changes** on a published version (in-place edits)
   - **Publish held:** Publish is disabled. A `--warn` line under the actions says "⚠ 1 field needs its meaning before v4 can be published · **Next incomplete →**". The link jumps the canvas and the settings to the next incomplete field.
2. **Locked banner** (the Note: white, 3 px `--ink` left edge, lock icon): "**v3 is locked: 214 entries were scouted with it.** Labels, help, ranges, meaning and scoring change in place. Adding or removing a field, or changing a type, starts draft v4."
3. **Three panes:**
   - **Fields palette** (240 px):
     - all 14 types, each with an icon, its name and a one-line description
     - a drag grip on each, and no Photo
   - **Form canvas** (flex):
     - Edit · Try it toggle
     - **the scouter's phase tabs**: Auto · Teleop · Endgame · Notes, with field counts and a ⚠ on a phase holding an incomplete field
     - "Teleop · Phase 2 of 4" with pager dots
     - a 410 px column of fields drawn with the real entry controls
     - a foot reading "‹ Auto · swipe sideways, or ← → · Endgame ›"
   - **Settings pane** (410 px), for the selected field.
   - **Changing phase:** click a tab, swipe sideways on a trackpad, or press ← / →. Dropping a field type on a tab puts it in that phase.
4. **A canvas item** is a white card with a grip outside its left edge. At its top right are the key in mono and the point value ("4/ea pts").
   - **Selected:** 2 px `--accent` ring plus a 3 px `--accent-tint` halo.
   - **Incomplete:** a 4 px `--warn` left edge and a "⚠ Needs meaning" tag, with `sr-only` "incomplete". **Never a red dot**: red is the red alliance.
5. **Map fields in the canvas** (position, cycle path) are the same **map button** the scouter sees: a thumbnail, a title and ›. In Try it, the button opens the map dialog.

## Settings pane

- **Head:** type icon, the type name in `--muted`, the label at 16 px / 750, and a ⋯ menu (Remove field, which deprecates it in the next version).
- **Key line** (on `--bg`):
  - A field not yet saved: "Key `tele_pieces_dropped` follows the label until the first save, then it is permanent."
  - A saved field: "🔒 Key `end_climb` · permanent, never changes".
- **Groups, in order:** Field · Configuration · Meaning · Scoring · Show when.
  - A complete group folds to one line with "✓ Complete" and a summary, e.g. "count · Teleop · higher is better · Scoring".
- **Meaning:**
  - "4 required" and a "⚠ 3 missing" tag
  - the Note "**This cannot be added later.** Nobody goes back and describes 80 fields."
  - Description, Unit and Category
  - Phase and Direction as segmented controls
  - Expected range: "A value outside it is blocked when the scouter enters it."
  - A blank required control has a 2 px `--warn` edge and "Needed to publish".
- **Configuration**, by type:
  - **Counter:** min · max · step · default.
  - **Selects:**
    - an option list with grips
    - **Ordered**: "the list order is the rank, worst → best", with WORST and BEST labels
    - "Adding an option starts draft v4"
  - **Event log:**
    - a Buttons list with grips (label + mono value + ✕ · "+ Add a button")
    - the switch **Ask where on the field** after each tap
    - a Note on what a tap saves
  - **Field position:**
    - "Each entry holds": **One point** · **A list of points**
    - **Mirror for the blue alliance**: None · Left ↔ right · Top ↔ bottom · Both
    - the **mirroring preview**: "A blue scout taps" → "Saved as (red's side)", with "Red is saved as tapped; blue is mirrored…"
    - the game image path
  - **Cycle path:** "Points per cycle, at most" as a − 6 + stepper, the mirror control and preview, and "A rough sketch, not a trajectory".
- **Scoring:**
  - **A matrix** of phases (Auto · Teleop · Endgame) × values. A counter has one row ("Each piece"); a select has one row per option. A 0 cell is greyed.
  - "in place · no new version".
  - A type that isn't scored says why in a Note instead of hiding it, e.g. "Event logs are not scored. Their taps give counts and cycle times…".
- **Show when:** one dashed "Show this field only when…" button. One condition, never a list.

## Try it

- The canvas hides grips and keys, and the fields work.
- The settings pane becomes **"What this entry would save"**:
  - the Note "**Nothing is saved or sent.**"
  - a "Match clock running" switch
  - **Saved data**: the entry's JSON as it would sync
  - **What the analysis gets**: per-button taps, time to first, cycle times, and cycle-path counts
- Map fields open the **map dialog**, described next.

## The map: one pattern for every map field

It is used by field position, event log "where?" and cycle path. On a phone it opens full screen; on a computer it opens as a dialog. Saved coordinates never change with the drawing: they stay normalized `{x, y}`, with blue mirrored as configured (§5.6).

- **In the form, a map field is one button:**
  - a thumbnail of what's marked, the count ("3 spots", "2 paths") and ›
  - empty: a dashed border with "**Mark on the map**" in `--accent-ink` and "Not marked yet"
- **Phone: a full-screen map.**
  - Header: ✕, the title, "Q39 · 1690 · Auto" and the station tag.
  - The field is drawn **upright, with the scout's own alliance end at the bottom**, labelled "your alliance". A blue scout sees blue at the bottom.
  - A one-line hint, then a white bar with the controls and a full-width **Done**.
- **Computer: a dialog.** The locked Dialog, about 820 px wide. The field lies flat, **with the scout's own alliance end on the left**. Same controls in one row; **Done** at the right; Esc or ✕ closes it.
- **Adding:**
  - tap or click the map
  - spots get numbered dots in the scout's alliance colour
- **Removing (compact):**
  - tap a spot or a path to select it: a ring, or a white halo with a thicker line
  - a small dark **✕ Remove** (or **✕ Remove path**) pill appears just above it
  - tapping the map elsewhere keeps the mark
  - **Undo** takes back the last change
  - on a computer, the Delete key removes the selected mark
- **Cycle path:**
  - only the routes are drawn: no numbers, no scoring
  - the path being drawn is dashed with bigger dots, and the others fade
  - while drawing: "● Drawing path 3 · 3 of 6 points", then **Undo** · **Clear path** (eraser icon; wipes the path being drawn so it can be started again) · **Finish**
  - otherwise: **+ New path** and "3 paths"
- **Event log "where?"** (when the field's switch is on):
  - after the tap, the map opens as "High goal · where?", with "Shots · tap at 1:12 · optional"
  - this field's earlier taps show grey
  - tapping again moves the new spot
  - **Skip · no place** keeps the tap with its time only ("time is saved either way"); **Save tap** saves it
  - in the form, a tap chip carries a pin when it has a place

## The Timer field

Shown in the canvas and on the scouter's phone (`timer-phone.png`, task 1.34).

- **Ready:** a small green **▶ Start** pill in the middle of the field's space: drawn 40 px tall and about 130 px wide in `--accent`; its tap area stays 48 px (§17.7). A small "Unsure — no time" switch sits under it.
- **Running:** the time on a 64 px `--accent-tint` face with a green edge, mono 30 px, with "● Running". Below it, Start **splits into two buttons**: **❚❚ Pause** (`--accent-tint`, 2 px `--accent` edge) and **↺ Clear** (secondary), 46 px pills.
- **Paused:** the face turns grey with "Paused" and a ✎ button, so a late stop can be corrected (§5.2: editable after stop). The buttons become **▶ Resume** (filled `--accent`) and **↺ Clear**.
- **Unsure:** with the switch on, a dashed "No time recorded · unsure" face, and the field submits no value.

## Phone

The builder needs a computer. Below 1024 px it shows the locked "This needs a computer" panel. The scouter's map fields (`maps-phone.png`) belong to the entry form, not the builder.

## Features decided

| Feature | Decision |
|---|---|
| Variant D: live canvas drawn with the real controls (2026-10-08) | Now |
| Phase paging in the canvas, like the Entry page (tabs, "Phase n of 4", dots, swipe / ← →) | Now |
| Top bar: Match timer + More (Edit as JSON · Export · Import · Delete form); Preview is the canvas's Try it | Now |
| The key follows the label until the field's first save, then it is permanent [RAISED BY ME] | Now (replaces "never editable once the field exists") |
| The locked banner names how many entries use the version | Now |
| Next incomplete → in the Publish-held line | Now |
| Try it shows the saved data and what the analysis gets | Now |
| **Ask where on the field** for an event-log field: optional per field; the scouter can skip | Now |
| Map fields open a full-screen map on a phone and a dialog on a computer; tap a mark → ✕ Remove; Undo | Now |
| Cycle path: routes only; Clear path restarts the path being drawn | Now |
| Timer field: Start in the middle; running splits into Pause / Clear; Resume and ✎ when paused; green, not black | Now |
| The map is turned so the scout's own alliance end is at the bottom (phone) or on the left (computer) | Now |
| Copy to Auto (duplicate a field into the other phase, variant B) | Not offered after the variant pick |
| Phase pre-filled from the tab a field is dropped on (variant C) | Dropping on a tab puts the field in that phase, as above |
| Collapse all sections (variant A) | Dropped with variant A: the canvas pages by phase |

**Decided 2026-10-08:** adding, removing or reordering a select option is structural (on a locked version it starts draft v4, as the images show); renaming an option's label is in place.

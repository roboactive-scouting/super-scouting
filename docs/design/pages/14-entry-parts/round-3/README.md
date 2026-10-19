# Entry parts, round 3: map fields on Review entry (proposal, 2026-10-20)

One design, not variants (user decision 2026-10-20): the confirmation shows complex fields properly. Not closed yet.

- `review-maps-phone.png`: (1) the confirmation sheet at Autonomous, with the starting position and auto path mini maps; (2) scrolled to Teleop, with the event log; (3) the read-only full-screen map opened from the event log's mini map.
- `review-maps-desktop.png`: the confirmation Dialog (520 px, as today) with the same content.

Data: Q39 · 2630 Thunderbolts, Red 1, fields from the dev test form. The map is the app's own season image (`apps/client/public/seasons/2026/field.webp`, loaded by relative path). Shared parts are in `../src/review.css` and `../src/review.js`.

**Rendering.** `render.sh` only reads `src/` or `final/`, so these were rendered with the same Chrome flags called directly from this folder: 2000 × 940 for `phone`, 1440 × 900 for `desktop`, 2× scale.

## Decisions

- **Mini map size.** Phone: 56 px wide and upright (138 px tall), with your alliance end at the bottom. Computer: 168 px wide and flat (68 px tall), with your end on the left. It looks like the form's map button thumbnail: the season image, a 6 px radius, a `--line` edge, 8 px dots in the alliance colour with a white edge, and 2 px routes.
- **Routes get a white casing** (4 px, under the line), because a red route on the image's red barrier was unreadable at 56 px. The full map uses the same casing.
- **Map row.** The name sits on the left, with a caption under it in `--ink` 600 and **⤢ Tap to view** (Click on a computer) in `--accent-ink`. The mini map is at the right, and the whole row is the tap target. There is no icon on the map itself: at 56 px it would hide marks.
- **Caption wording.** "1 point", "2 routes · 9 points", "5 events · 4 on the map". **Open:** the form's map button says "1 spot" / "2 paths". Pick one vocabulary for both.
- **Event log.** Under the caption, one 24 px line per event: a pin in the alliance colour when the event has a place (a hollow `--faint` pin and "no place" when it was skipped), the name, and the time in mono, right-aligned so the times line up. The mini map shows the spots, without numbers.
- **Read-only map.** This is the locked map pop-up (the Map dialog on a computer) with every tool removed: no Undo, Clear path, Finish, New path, Remove pill or tapping to add.
  - The header keeps ✕ and the station tag, and adds a **View only** tag (`--line-2`, eye icon).
  - Event-log spots are numbered in event order. The bar lists the events as the event-log tap chips (number, name, mono time, no ✕). An event with no place gets a dashed "–" badge and "no place".
  - One full-width secondary **Close** replaces Done, because there is nothing to save.
  - Position and cycle path open the same way: just the marks, the caption as the count, and Close.
- **Empty map field.** A field with nothing marked stays a plain row with "—", as today, with no mini map. Shooting position is drawn this way.
- **Data choice.** Defended (1:05) was drawn without a place, to show that case. The other four events have spots.
- Everything else on the sheet is unchanged: the title, the match line with its tag, the 10-minute line, Status, phase headings, value rows, and Keep editing / Submit entry.

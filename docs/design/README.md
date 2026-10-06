# Design — how the redesign is done

The visual identity is being redesigned from scratch, page by page (living spec §19.2, "Second redesign"). **Any chat or person continuing this work follows this file.**

## Sources of truth

| File | What it holds |
|---|---|
| `THEME.md` + `theme.css` | The chosen theme (**D1 "Pit Wall", light only**): palette, type, shape, layout, **locked components**, open questions. Every mockup links `theme.css` and defines no colours of its own. |
| `pages/<nn>-<page>/final/` | A **closed** page: `*-desktop.png` and `*-phone.png` (the reference the code must match), their `.html` sources, and a `README.md` with the behaviour and the feature decisions. |
| `concepts/` | The four original theme concepts. They are history; D1 was chosen. |
| `docs/spec/frc-scouting-app-spec.md`, `SPEC-FINAL.md` | Requirements. A page round that changes a rule updates the spec too. |

## The page round

Pages go **one at a time**. At this stage that means only the pages that exist today; planned pages come later. Each round:

1. **Four variants** of the page in the D1 theme, reusing every locked component in `THEME.md`. Each image shows **desktop and phone**. Variants are not limited to today's features: design what looks and works best, and tag every feature the app doesn't have yet with a black **NEW** tag.
2. **The user decides** on the variant and on each NEW feature, one of three ways:
   - **now**: it goes into the page's final design
   - **not now, but wanted**: add it to the living spec where it belongs, or wherever it fits best if the spec has no place for it
   - **not at all**: dropped
3. End the round with **one line of recommendation, no explanation**.
4. **Closing a page:**
   - render `final/<page>-desktop.png` and `final/<page>-phone.png`; the phone image shows every important state side by side
   - write `final/README.md` with the behaviour and the feature-decision table
   - add each newly picked component treatment to "Locked components" in `THEME.md`
   - update the spec if a rule changed
   - **delete the unchosen variant pages and images.** Keep only `final/` and the shared CSS and JS in `src/` that the finals load.
5. **When the page is coded, it must look the same as its final images.** Compare screenshots at 1440 px and 375 px against them.

## Page order (most important first)

| # | Page | Route | Status |
|---|---|---|---|
| 1 | Entry | `/entry/:matchId/:teamId` | **Closed** 2026-10-06, variant B |
| 2 | Scout (robot picker) | `/scout` | **Closed** 2026-10-06, variant E |
| 3 | Home | `/` | **Closed** 2026-10-06, variant B3 |
| 4 | Login | `/login` | **Closed** 2026-10-06, variant A |
| 5 | Entries | `/entries` | **Closed** 2026-10-07, variant A (simplified) |
| 6 | Switch scouter | `/switch-scouter` | **Closed** 2026-10-07, variant A (+ C's note) |
| 7 | Manage | `/admin/manage` | **Closed** 2026-10-07, variant D + matches on a phone |
| 8 | Users | `/admin/users` | **Closed** 2026-10-07, variant C + B's dialog |
| 9 | User detail | `/admin/users/:id` | **Closed** 2026-10-07, variant A |
| 10 | Change password | `/change-password` | **Closed** 2026-10-07, variant C |

`/context` is only a redirect to `/`. Update this table when a page closes.

**All ten current pages are closed (2026-10-07), and so is the phone shell** (`pages/11-phone-shell/final/`: top bar, bottom bar, menu). **Planned pages, designed after these ten:** the **entry preview** (SPEC-FINAL §13.4; Entries rows open it, user 2026-10-07), Search, Ranking and the other pages in `IMPLEMENTATION-PLAN.md`.

## Making the images

Mockups are hand-written HTML: `pages/shell.css` + `pages/shell.js` (the D1 desktop sidebar and phone top bar) plus each page's own CSS and JS. Render with headless Chrome:

```bash
bash docs/design/pages/render.sh 02-scout final
```

A file whose name contains `desktop` renders at 1440 × 900, one containing `phone` at 2000 × 940 (several phones side by side), one containing `tall` at 2000 × 1660 (two desktop views stacked, for desktop-only pages), anything else at 2000 × 900, all at 2× scale.

Pitfalls:
- Generic class names (`.next`, `.n`, `.me`) have collided between a layout and a component before; use specific names.
- On Windows, write files with LF line endings.

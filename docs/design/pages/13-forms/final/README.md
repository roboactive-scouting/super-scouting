# Forms list (`/admin/forms`) — closed 2026-10-08

**The code must look like these images:**
- desktop: `forms-desktop.png` (a season with a form and its versions), `forms-desktop-new-season.png` (a season with no forms)
- phone: `forms-phone.png` (the desktop-only gate)

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 13-forms final` re-renders them. The shared CSS and JS live in `../src/` (`forms.*`, `final.js`) and `../../12-form-builder/src/builder.*`. Spec: SPEC-FINAL v1.21 §5.9, §17.9; living spec v0.69. Task: 1.29.

Chosen: **variant A ("Two cards") with variant C's version timeline**, so that any version can be opened in the builder.

## Layout (desktop only)

1. **Sidebar:** a **Forms** item in the Admin group, for admins only. It is not in the phone menu.
2. **"Forms"**, with the line "The scouting forms for each season. Open one to edit it in the form builder."
3. **Season chips:**
   - each chip is the year in mono with a plain `--muted` label ("active", "no forms yet")
   - the active season also gets a small green dot
   - the selected chip is filled `--ink` (its label in `--rail-ink`)
   - the active season is preselected
   - no coloured words
4. **No published match form:** the warning banner "**No match form is published for 2027.** Scouts can't open an entry until one is."
5. **Two cards side by side, Match form and Super form:**
   - **The head:** a dark icon square, the name, and a one-line meaning ("One entry per robot per match" / "One entry per alliance per match, by a super scout"), then the status tag ("🔒 v3 · Published · Locked") and ⋯ (Delete form).
   - **The stat row:** Fields · Entries · Versions · Last edited (date · who).
   - **Versions:** a timeline, newest first. The draft has a dashed dot and the active version a filled green dot. Each row gives its dates, its field count and its **entries**.
   - **The actions:** **Open builder** (primary), Export, and "Open builder opens the draft if there is one".
   - **A missing form** is a dashed card with Create and **Import a .json file**. For the match form it also says: "Every entry needs a match form… export it from 2026, then import the file."

## What each button opens

All of them open the same builder; they differ in which version opens and what you can change.

| Button | Opens | What you can do |
|---|---|---|
| **Continue** (draft row) | The draft, which scouts don't see | Anything; Publish makes it the active version |
| **Open** (active row) | The version scouts use now | In-place edits only (labels, help, meaning, scoring, ranges); a structural edit starts a new draft |
| **View** (older rows) | An older published version | Read-only, with **Restore** beside it: Restore makes it active again, with no new version |
| **Open builder** | The draft if there is one, otherwise the active version | As Continue or Open |

## Phone

Forms needs a computer. Opened by its address, a phone shows the locked "This needs a computer" panel.

## Features decided (2026-10-08)

| Feature | Decision |
|---|---|
| Two cards per season (A) | Now |
| Version timeline on the card, with entries per version (C) | Now. **Needs a count of entries per form version** |
| Open any version: Continue / Open / View, plus Restore | Now. **The builder route takes a version** (`/admin/forms/:formId?version=n`) |
| Entries per form and last edited · who | Now. **"Who" needs `form_versions.updated_by`** (the schema has no editor column) |
| Season chips with a plain label and a dot for the active season | Now |
| "Draft in progress · Continue" line (A) | Not needed: the timeline's Continue covers it |
| Table with versions (B) | Not chosen |
| "Ready to scout" checklist (D) | Not chosen |

# Discarded records (`/sync/discarded`) — closed 2026-10-12

**The code must look like these images:**
- phone: `discarded-phone.png` — the log, and the empty state
- desktop: `discarded-desktop.png` — the log as a table

The `.html` files are the source, and `bash docs/design/pages/render.sh 19-discarded final` re-renders them. Shared CSS and JS are in `../src/` (it also loads `05-entries`, `17-sync` and `18-conflicts` CSS for the tags, the note and the empty state). Spec: SPEC-FINAL v1.29 §9.7, §17.9; living spec v0.81. Task 1.42.

Chosen: **one proposal, no variants** (a read-only list), approved by the user 2026-10-12 **without "Show what was entered"**.

## Where it lives

- Not in the nav. Opened from Sync: the Problems tab's discarded notice (**See the log**) and **More → Discarded records**. The sidebar keeps **Sync** current; the crumb is "This device / Sync / Discarded records".

## The page

1. "‹ Sync" back link, "Discarded records", then "Entries removed from this phone because an admin deleted what they belonged to. Kept here for as long as the app is installed."
2. The Info note: "An admin deleted the competition, season or form it belonged to." It stays general because the server's `parent-deleted` does not say which parent went.
3. **Grouped by when the records were removed**, newest first: a group heading "Removed Sun 12 Oct, 08:02" with the competition they belonged to at the right ("District #2 · Haifa").
4. Each record, read only, with no actions: match (none for a super entry), station tag, team number and name, the robot status tag (or SUPER), "Match entry" / "Super entry" · the scouter, and "saved Fri 10 Oct, 14:20". Phone: cards. Computer: the data table (Match · Team · Status · Scouter · Saved).
5. **Empty:** "Nothing has been discarded — An entry is only removed when an admin deletes the competition, season or form it belonged to. If that happens, it is listed here." and **Back to Sync**.

## Features decided (2026-10-12)

| Feature | Decision |
|---|---|
| Grouped by removal time, with the competition | Now |
| Show what was entered (the record's values, read only) | Not at all (user) |

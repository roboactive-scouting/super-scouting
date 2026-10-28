# 28 · Delete — final

- desktop: `delete-desktop.png` (Season 2025: the bill, the two-line backup, "202" typed, the button off) and `delete-desktop-blocked.png` (version 1 of Match form 2026, blocked, two ways forward)
- phone: `delete-phone.png`: one entry ("Are you sure?") · Q41 has entries (correct it, or delete it with them) · Q41 with its entries (backup, "Q4" typed)
- where the dialogs open (added 2026-10-28, no variant round): `delete-triggers-desktop.png` and `delete-triggers-phone.png` (the entry preview, page 25) and `delete-triggers-forms-desktop.png` (the forms list, page 13). They load those pages' own sources plus `../src/triggers.js`, which adds the buttons. The phone frames keep page 25's bottom bar as it was drawn (Home · Scout · Search · Entries); with task 1.58 it reads Home · Scout · Search · Ranking.

The `.html` files are the source, and `bash docs/design/pages/render.sh 28-delete final` re-renders them. They load `../src/a/a.css` and `../src/final.css`. Spec: SPEC-FINAL v1.47 §3.9, §17.8; living spec v0.99. Tasks 1.60 (server) and 1.61 (client).

Chosen: **variant A, "The bill comes first"** (2026-10-28), with the user's changes:

- the one-square-per-entry field is removed;
- a delete with nothing to type is a plain **"Are you sure?"** pop-up, not the bill;
- a match with entries can be deleted **together with its entries**.

The brief is `../BRIEF.md`.

## Behaviour

There is one `DeleteDialog`, and it has three faces. The kind of delete decides which one opens.

| Kind | Face | Typed | Backup step |
|---|---|---|---|
| Season, event, form | **Bill + type** | the name ("2025", the event's name, the form's name) | yes |
| Form version with no entries | **Bill + type** | "v1" | yes |
| Form version with entries | **Blocked** (Keep version 1 · Delete the whole form…) | — | — |
| Match with entries | **Choice** (Correct the match number · Delete Q41 and its 6 entries… · Close), then **Bill + type** for the cascade | "Q41" | yes |
| Match with no entries | **Are you sure?** | — | — |
| One entry (lead or admin, soft delete) | **Are you sure?** | — | — |
| The active season / the default event | **Blocked**: "Switch the active season first." / "Switch the default event first." | — | — |

- **Bill + type:**
  - **The bill.** A dark `--ink` band leads with what goes:
    - the kicker "Delete Season 2025 · hard delete · cannot be undone", with "Counted on the server just now" at the right;
    - the biggest count, with a one-line sentence under it;
    - beside it, every count, with the names under them where they help.
  - **Below the bill:**
    - a title as a question: "Delete Season 2025?";
    - one line: "The rows are removed from the database for good. Only a backup you take now can bring them back.";
    - **Step 1, Back up first:** the two lines from `docs/ops/SETUP.md` › Backup, with one **Copy both**;
    - **Step 2, Type the name:** an exact match, case included, with "No match yet" in the field until it matches.
  - **The footer:** "Admins only · Online, so the delete runs on the server at once", then **Cancel** (focused first) and the filled-ink **Delete season 2025**, which stays disabled until the name matches.
- **Are you sure?** A small centred pop-up with no bill, used for a single record:
  - the question as the title;
  - the object as a card (Q12 · 2096, the station tag, the team, the scouter, the time, the points);
  - one line on what happens: "This deletes 1 entry. It stops counting in statistics, lists and ranking once it syncs. There is no restore.";
  - **Cancel** (focused) and **Delete entry**, side by side.
- **Blocked:** the bill's band with a white **Blocked** tag (a slashed circle) and the count that blocks it. Then "Version 1 can't be deleted", one line, and the **ways forward** as cards, each with one button. There is no delete button, nothing to type, and no text overrides it.
- **Match with entries:**
  - The band says "6 entries are saved to Q41" and shows the **six station tiles** (Red 1–3, Blue 1–3, each with "saved" in its alliance tint).
  - Then **Correct the match number** (primary), **Delete Q41 and its 6 entries…** and **Close** (focused).
  - The cascade opens its own bill: "6 entries go, with Q41". It needs the backup, then Q41 typed.
- **The backup command** comes from `docs/ops/SETUP.md`, never a bare `supabase db dump`, which saves no rows:
  ```
  pnpm --filter @frc/db exec supabase db dump -f ~/frc-backups/prod-schema-$(date +%Y-%m-%d).backup.sql
  pnpm --filter @frc/db exec supabase db dump --data-only --use-copy -f ~/frc-backups/prod-data-$(date +%Y-%m-%d).backup.sql
  ```
- **Layout:**
  - On a computer, every face is a centred dialog (940 px; 860 px when blocked).
  - On a phone, the bill and the choice are bottom sheets, and **Are you sure?** is a centred pop-up.
- **Online only:** the counts and every hard delete come from the server. The soft delete of an entry goes through the outbox like any other change.

## Where each delete opens

- **Entry, on the entry preview:**
  - A lead or admin gets a filled-ink **Delete** (trash icon) after **Team page** and **Edit**. On a computer it is the third equal button beside the score band; on a phone it is a full-width row under the other two.
  - It opens **Are you sure?**.
  - A scouter never sees it, even on their own entry: deleting an entry is lead/admin only (§3.9).
- **Form version, on the forms list:**
  - Each older version row (the ones with View and Restore) ends with a 36 px filled-ink trash button, `aria-label` "Delete version v2".
  - The draft and the active version have none.
  - It opens the bill + type for a version with no entries, or **Blocked** for one with entries.
- **Already in place:**
  - Season and event: the Manage page (RB.20).
  - Match: Manage's 🗑 (page 07).
  - Whole form: the builder's More menu (page 12).

## Feature decisions

| Feature | Decision |
|---|---|
| The bill first: the damage as the biggest number, then itemised (A) | Now |
| "Counted on the server just now" (A, NEW) | Now |
| Six station tiles on a match with entries (A, NEW) | Now |
| A plain "Are you sure?" pop-up where nothing is typed (user) | Now |
| Delete a match together with its entries, typed and backed up (user) | Now |
| The two-line backup with Copy both (D's catch: the bare command saves no rows) | Now |
| Delete on the entry preview (lead/admin) and on older version rows (user, 2026-10-28) | Now |
| One square per entry (A, NEW) | No (user) |
| "Delete its 6 entries first" as a way forward | No: soft-deleted entries still hold the match, so it never worked |
| Level markers and the ladder legend (B) | No |
| The checks line and "See the 312 entries" (C) | No |
| The backup tick that unlocks the typing, and dated file names that name the object (D) | No |

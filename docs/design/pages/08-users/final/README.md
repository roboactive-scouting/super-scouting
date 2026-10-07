# Users page (`/admin/users`) — closed 2026-10-07

**The code must look like these images:**
- desktop: `users-desktop.png` (the list), `users-desktop-add.png` (the "Add a user" dialog), `users-desktop-created.png` (the password handover)
- phone: `users-phone.png` (the desktop-only gate)

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 08-users final` re-renders them. Spec: SPEC-FINAL v1.12 §17.9 (Users row, Home row); living spec v0.60.

Chosen: **variant C, "One table, everything in it"**, with **variant B's "Add a user" dialog**.

## The list (desktop only, as today)

1. "Users" and today's line: "Open an account to change its role, reset its password or disable it." **Add a user** (primary) at the right.
2. **Search** (name or username), then **filter chips** with counts: **All · Scouters · Leads · Admins · Disabled**. The selected chip is filled `--ink`.
   - **Disabled** replaces today's "Show disabled accounts" checkbox.
   - The other chips list active accounts only.
3. **The table:**

   | Column | Content |
   |---|---|
   | Full name | Initials circle and name |
   | Username | Mono |
   | Role | Role tag: Admin (dark), Scout lead (outlined), Scouter (grey) |
   | Status | "Active" (green) or "Disabled since DD/MM/YYYY" (grey) |
   | Entries this season | A mono count; 0 in `--warn` |
   | Quick actions | **Reset password** and **Disable**, shown on hover or focus (always visible to keyboard focus) |

4. **A row opens the account page** (page 9), as today.
5. Today's states stay: the loading skeleton, the unreachable / failed panels with "Try again", and the "Showing the first N accounts" note.

## Add a user (dialog)

- **Full name**, then **Username**, suggested from the name ("gal.l"), editable, with today's rules on error.
- **Role:** three choices, each with one line:
  - Scouter: "Enters match data"
  - Scout lead: "Fixes any entry, pick list"
  - Admin: "Everything, incl. users"
  - Scouter is preselected.
- **Initial password:** shown in clear, with **Generate** (three short words and two digits, at least 8 characters). Today's hint.
- **Ask them to change it at next sign-in** (on by default).
- **Cancel · Add user** ("Adding…" while busy). An error shows as the Login error line, naming the field.
- **After adding, the dialog becomes the handover:**
  - "Created {name} · {username}", then "Their password" in large mono
  - today's line: "Hand it over now. It is shown once and kept nowhere; they choose their own at next sign-in."
  - **Add another** (back to an empty form) or **Done**
  - the password is dropped when the dialog closes

## Phone

Users needs a computer: below 1024 px the page shows today's "This needs a computer" panel. **Phones don't offer Users at all**: there's no Home Go-to tile and no drawer item (user, 2026-10-07).

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Search | Now |
| Filter chips All / Scouters / Leads / Admins / Disabled, with counts | Now (replaces the "Show disabled" checkbox) |
| Entries this season per person | Now. **Needs a new server count** (per scouter, active season) |
| Reset password and Disable on the row | Now. **Disable keeps a confirmation**: the same one as on the account page (page 9) |
| "Add a user" as a dialog, with role descriptions, a suggested username and Generate | Now |
| Add as a row inside the table (C) | No (the dialog replaces it) |
| Grouped by role as cards (B) | No |
| "Add several" (D) | No |
| Users tile on Home's phone view | Removed (phones can't open Users) |

# User detail page (`/admin/users/:id`) — closed 2026-10-07

**The code must look like these images:**
- desktop: `user-desktop.png` (an account), `user-desktop-disable.png` (the confirmation), `user-desktop-disabled.png` (a disabled account)
- `user-role-steps.png`: what happens when you change a role
- phone: `user-phone.png`

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 09-user final` re-renders them. Spec: SPEC-FINAL v1.13 §17.9 (User detail row); living spec v0.61.

Chosen: **variant A, "One column of sections"**, with the role as **described choices** and **Generate** on the password reset. Destructive style: **filled ink** (now locked in `THEME.md`).

## Layout (desktop only: a 680 px column)

1. **All users** (back link).
2. **Who it is:** initials circle, the full name (26 px / 750), then "username · created DD/MM/YYYY". On your own account, a **This is you** tag.
3. **Role:** three described choices (Scouter · Scout lead · Admin), as in the "Add a user" dialog. The hint reads "Saves as soon as you pick. It applies from their next request." On your own account it reads "This is your own account. Another role takes away your access to this page."
4. **Rename:** username (mono) and full name side by side, **Save name**, and today's offline-device hint. "Saved." after saving.
5. **Reset password:** today's explanation; a new password field with **Generate** and **Reset password**; "Ask them to change it at next sign-in" (on). After resetting, today's one-time handover shows in the section (the locked Handover box) with **Done**.
6. **Disable account:** a section with a 3 px `--ink` left edge, today's explanation, and a **filled ink** "Disable account" button.

## Changing a role (`user-role-steps.png`)

There is **no Save button**. Picking a role saves it at once; promoting to Admin works the same way.
1. **Before:** the current role is selected.
2. **Saving:** the picked choice is selected with "Saving…" in place of its description. The other choices are dimmed and can't be picked until the answer comes.
3. **Saved:** the new role stays selected, with a green line: "Saved. {Name} is now {a lead}. It applies from their next request."
4. **Refused:** the server's own sentence shows as the error line, and the selection goes back to the role it had (for example, the last enabled admin can't stop being an admin).
5. **Your own account:** the warning hint is shown before you pick. After saving, your own access follows the new role at once (today's behaviour).

## Disable

**Disable account** opens a confirmation dialog: the locked desktop dialog, with the title "Disable this account?", the person's name, and today's body ("Disabling keeps everything they scouted, with their name on it. It is not a delete."). On your own account it adds "This is your own account. You will be signed out on your next request." **Cancel** has focus first; the confirm button is **filled ink**, "Disable {name}". Errors show inside the dialog.

## A disabled account

The header shows a "Disabled" tag. Under it, one box (`--line-2`, 3 px `--warn` edge) reads "This account is disabled since DD/MM/YYYY. Everything they scouted is kept, with their name on it." with **Enable account** (primary). No other sections, as today.

## States

Today's loading skeleton, the unreachable / failed panels with "Try again", and "No user at this address" with **All users**. Phone: today's desktop-only panel. Phones don't link here.

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Role as three described choices (saves on pick) | Now |
| Generate on the password reset | Now |
| Destructive style: filled ink | Locked |
| Profile facts (entries this season, last entry) (B) | No |
| "See their entries" (B, D) | No |
| Each action in a dialog (C) | No |
| Activity panel (D) | No |

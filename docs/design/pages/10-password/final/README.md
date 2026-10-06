# Change password page (`/change-password`) — closed 2026-10-07

**The code must look like these images:**
- desktop: `password-desktop.png` (the page), `password-desktop-entry.png` (the account corner menu that opens it)
- phone: `password-phone.png` (forced, offline, mismatch, changing)

The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 10-password final` re-renders them. Spec: SPEC-FINAL v1.14 §17.9 (Change password row); living spec v0.62.

Chosen: **variant C, "Login's frame with live checks"**.

## Layout

Login's closed frame (`04-login/final/`). Desktop: the lockup on the dark plate beside the form, with the version at the foot. Phone: the dark band with the small lockup, then the form.

1. **Title:**
   - forced (an admin set a temporary password): "Choose a new password", then today's line "An admin set a temporary password for this account. Choose your own to carry on."
   - by choice: "Change your password"
2. **Current password**, **New password**, **Confirm new password**: every field has the show/hide eye.
3. **Live checks** under New password, ticking as you type:
   - **At least 8 characters**
   - **Both new passwords match**

   Each is an empty circle until there is something to check, a green ✓ when met, and an amber ✕ when not. They replace the "At least 8 characters." hint. The server still checks, and its sentence shows as the error line.
4. **Change password** (primary; "Changing password…" with a spinner while busy).
5. **Back to scouting** (by choice only; the forced change has no way back).

## States

| State | What shows |
|---|---|
| Offline | The Note at the top: "No connection. Changing your password needs the server — try again when this device is online." The button is dimmed and does nothing until the connection returns |
| A rule not met | The amber ✕ on that check; pressing the button also shows today's error line |
| Wrong current password / server refusal | The Login error line with today's text |
| Session expired | Goes to sign-in, as today |
| Done | Goes to Home, as today |

## How you get here

- **Forced:** straight after sign-in, as today.
- **By choice:** the **account corner** at the foot of the desktop sidebar opens an account menu: **Switch scouter · Change password · Sign out** (`password-desktop-entry.png`). On a phone, the same three items go in the drawer's account section, which is designed with the phone shell (THEME.md open question 5). This replaces today's footer link.

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| Show / hide on every password field | Now |
| Live checks (length, match) | Now |
| Offline said first, button held | Now |
| Account menu in the sidebar's account corner (Switch scouter, Change password, Sign out) | Now |
| Changing by choice as an in-app page (B) / as a dialog (D) | No |
| "You stay signed in on this device…" line (B) | No |

# Switch scouter page (`/switch-scouter`) — closed 2026-10-07

**The code must look like `switch-desktop.png` and `switch-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 06-switch final` re-renders them. Spec: SPEC-FINAL v1.10 §17.9 (Switch scouter row), living spec v0.58.

Chosen: **variant A, "Form, refined"**, plus the "stays on this device" note from variant C.

## Layout (desktop: a 460 px column in the content area; phone: the same, full width)

1. "Switch scouter" and today's line: "Entries already on this device keep the scouter who made them."
2. **Scouting now** card: the current scouter's initials and full name (white card, `--line` border).
3. **Who's scouting next?**: the locked 56 px select. Options read "Full name · username" (direction-neutral, as today). The current scouter is marked "· signed in now".
4. **Password for {name}**: appears once someone is chosen, focused, with the show / hide eye from Login.
5. **Stays on this device** note (the locked Note with an info icon), shown once someone is chosen:
   - with waiting entries: "{Current}'s N entries waiting to send, which still send as {Current}'s, and station {Station}."
   - nothing waiting: "Station {Station}."
   - no station chosen: the station part is left out
   - neither: no note
6. **Switch scouter** (primary, "Switching…" while busy), then **Cancel** (back to Home).

## States

| State | What shows |
|---|---|
| Nobody chosen | Select placeholder "Choose who is scouting"; pressing the button says "Choose who is scouting." |
| Wrong password (online or offline) | The Login error line; the password field is cleared and keeps focus |
| Offline | Works as today: the cached hash is checked on the device. The top bar says Offline |
| No accounts on this device | Today's Note: "This device has not loaded the team's accounts yet…", and Cancel |
| Success | Goes to Scout, as today |

The note's wording never uses a pronoun for the previous scouter, only their name.

## Features decided (2026-10-07)

| Feature | Decision |
|---|---|
| "Scouting now" card | Yes |
| Show / hide password | Yes (same as Login) |
| "Stays on this device" note (waiting count + station) | Yes |
| Search a name; "scouted on this device today" first; password inside the row (B) | No |
| Name tiles with a separate password step (C) | No |
| Switch as a dialog or sheet from anywhere, no separate page (D) | No: it stays a page |

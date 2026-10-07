# Login page (`/login`) — closed 2026-10-06

**The code must look like `login-desktop.png` and `login-phone.png`.** The `.html` files next to them are the source, and `bash docs/design/pages/render.sh 04-login final` re-renders them. Spec: SPEC-FINAL v1.8 §17.9 (Sign-in row), living spec v0.56.

Chosen: **variant A, "Split plate"**: today's layout in the D1 theme.

## Desktop

- **Left 44%:** the `--rail` plate with the full lockup (`docs/brand/logo.png`, about 300 px wide), centred. No tagline, no copy.
- **Right:** the form alone on `--bg`, 380 px wide, centred: "Sign in" (28 px / 750), Username, Password with the eye button, the "Forgot it? Ask an admin to reset it." hint, then the full-width 52 px **Sign in** button.
- The version string centred at the foot.

## Phone (top to bottom)

1. A `--rail` band with the lockup (120 px). When a notice shows, the band shrinks (lockup 84 px) so the button stays on the first screen.
2. "Sign in", then any notice, then the fields, the hint, any error line and the button.
3. The version string at the foot.

## States

| State | What shows |
|---|---|
| Offline | The Note (white, 3 px `--ink` left edge, no-wifi icon): "No connection. Signing in will use the credentials cached on this device." |
| Wrong credentials / any error | The **error line** under the fields (white, 3 px `--warn` left edge, warning icon, text 600). Today's messages unchanged. Announced (`role="alert"`) |
| Session expired | A `--warn-tint` notice with a clock icon and today's text; the username is filled in and the password field has focus |
| Signing in | The button dims and shows a spinner with "Signing in…" |
| Password shown | The eye turns into eye-off in `--accent-ink`, and the password is shown as text |

A signed-in user who must change their password still goes to `/change-password` (unchanged). **Change password is page 10.** It has its own round, though it shares this frame in the code (`AuthFrame`).

## Features decided (2026-10-06)

| Feature | Decision |
|---|---|
| Show / hide password (eye button) | **Now** |
| Version string on the sign-in screen | **Now** |
| Caps Lock warning (variant B) | No (not picked) |
| Connection line "Online · server reachable" / "Offline · N accounts on this device" (B) | No (not picked) |
| "Who's scouting?" picker of people who signed in on this device (C) | No (not picked) |
| "This device: competition · station" before sign-in (D) | No (not picked) |

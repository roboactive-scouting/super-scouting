# UI fix notes — round 1

**Status (2026-10-08):** all fixed in UF.1–UF.10 and shipped to `develop` (`72731c8`). See
`docs/plans/UI-FIX-PLAN.md` "Result" and "Open for the user".

Notes from real-device testing of `develop` (`version 9b102cd`). Collected page by page;
nothing is fixed until the list is complete. Fixed on `fix/ui-pages`, one commit per page.
Source of truth for each fix: the page's `final/` images and README.

## 01 Entry

**Phone**

1. **Swipe between phases is not smooth and only works inside the form.** Swiping on the
   empty area below the form (e.g. in Teleop) does nothing. Expected: swipe anywhere on
   the page moves between phases, and the transition is smoother.
2. **Breakdown time starts at `0` and the 0 can't be removed.** Typing gives `020`.
   Expected: the field can be cleared (empty, not `0`), so typing `20` gives `20`.
3. **Review entry sheet doesn't close on swipe-down.** Expected: dragging the sheet down
   dismisses it, like a native bottom sheet.
4. **Submitted entry stays "waiting" while online.** After submitting match 80, the top
   bar shows `waiting 2` in brown (one earlier entry already waiting) and nothing syncs,
   even with internet. Expected: online → Syncing → All sent. *Possible bug, not only UI —
   investigate the sync queue before fixing.* On every app open the pill shows green
   Syncing, then goes back to brown Waiting. Dev DB check (2026-10-08): the computer's
   entry (match 50) arrived; match 80 never reached the server. Entries on the phone shows
   both rows with the brown up arrow and **no** "Not synced:" line, so the ops are not
   parked — either the server answers "unexpected server error" (transient, retried
   forever; the cause is only in the Vercel runtime log, which this machine's CLI can't
   read) or the push/pull call itself fails (401 with no token, network, CORS).
   Reproduce through the API with a seed user before fixing.
   No expired or offline banner shows on the phone, only the "cached" one, so
   `syncNow` returns `offline` and not `unauthenticated`. Lead suspect: the **whole push
   request is refused** (for example a 400 because one queued op fails the push schema,
   perhaps the older waiting entry made by an earlier build). If so, a single bad op
   blocks the entire queue forever, which is a robustness bug as well as this report.
   **Sign out and sign in on the phone did NOT help (2026-10-08)**, so this is not the
   Manage token problem. A fresh token still can't send these ops: the cause is in the
   ops themselves or in how the server handles them. Next step in the fix: rebuild the
   same ops (a bare match create for Q80 plus an entry, possibly Broke down with a
   breakdown time) through the API as a seed user against the preview server, and read
   the response.
   **ROOT CAUSE FOUND (2026-10-08), reproduced against the preview server:**
   `pnpm db:clean` (packages/db/src/seed/clean.ts) hard-deletes every non-seed row in the
   dev DB: stray users (including "test"), matches and entries. Hard deletes never reach
   a device, because pull carries no tombstones, so the phone still caches the old,
   now-deleted match rows (and the "test" account). Scouting match 80 reused the cached
   match id, so no bare-match op was queued. On the server the entry insert hits the FK on
   `match_id` and throws. `syncPush` turns any thrown error into
   `invalid / "unexpected server error"`, which the client treats as **transient**: never
   parked, never shown, retried forever. Repro: a push of an entry with a random
   `match_id` as seed_scouter returned 200
   `{"status":"rejected","reason":"invalid","detail":"unexpected server error"}`.
   **This is not dev-only.** An admin deleting a match in Manage (a hard delete,
   `store.ts:694`) while another device has it cached produces exactly the same stuck,
   silent queue at a venue.
   Fix scope:
   (a) server: a missing parent (an FK violation on `match_id` / `team_id` / `event_id`)
       becomes `parent-deleted`, never the transient error;
   (b) client: on `parent-deleted` for an entry whose match is gone, re-queue the bare
       match create (event, type, number from the cached row) ahead of the entry and
       retry, so the scout's work lands without anyone doing anything; otherwise
       show the "Not synced:" reason;
   (c) a device must learn about deleted matches (and users): deletion tombstones in
       pull, or a pruning pass;
   (d) tests for all three. The phone's 3 stuck entries are the live acceptance test.
   User: **fix it in this round.** Spec done (v0.66 / SPEC-FINAL v1.18 §9.3, §9.3.1,
   §9.7). Deleted users (here, only the dev clean script) stay out of scope, because the
   product never deletes a user, only disables one.

**Computer**

Looks good — no notes.

## 02 Scout

**Phone**

1. ~~No arrows on the match number~~ — not a bug: the final has no stepper by design
   (my test list was wrong). Typing works.
2. **"Team not here?" hides under the Start entry bar** — only visible when scrolled all
   the way down. Fix the bottom clearance, and make the link bigger / more visible.
3. **Match number is empty after submitting** instead of moving to the next match.
   *Contradicts the closed design ("no next match suggestion", final README line 13).*
   User (2026-10-08): it's small, so **do it this round**. After submitting a **new** entry,
   Scout opens with the same match type and the number + 1, still editable. After an
   edit of an older entry the number stays empty. Small change: `SavedNotice` carries
   the match type and number (`EntryRoute.tsx` ~line 202) and `SelectRobotPage` seeds
   its state from it. Spec done (v0.65 / SPEC-FINAL v1.17 §8.1); still update the Scout
   final README line 13 + its feature table in the fix commit.

**Computer**

4. **Start entry is not fixed.** After "Team not here?" opens the team list, you have to
   scroll all the way down to reach Start entry. Expected: Start entry stays fixed at
   the bottom like on the phone.

## 03 Home

**Phone**

1. **"Working from data already on this device…" banner isn't flush with the page** —
   the background shows on its left. Fix the alignment/width.
   *Sync clue (see Entry note 4):* this banner means the last sync did not complete, so
   the phone's sync fails as a whole (push throws, or the pull fails) — not just one op.
2. **Switch competition sheet has no ✕**, and it should close on swipe-down. **Applies to
   every bottom sheet in the app** (same as Entry note 3): add the ✕ where the final
   shows one, and drag-down-to-dismiss on all of them.
3. **NEW — tapping the station on Home opens the station picker** (the same sheet Scout
   uses), not only on Scout. Spec done (v0.65 / SPEC-FINAL v1.17 §17.9).

**Computer**

Looks good — the Switch competition sheet has its ✕ and closes. No notes.

## 04 Login

**Computer** — looks good, no notes.
**Phone** — not tested yet (signing out would risk the 2 unsent entries). Test after the
sync fix.

## 05 Entries

1. ~~Tapping a row doesn't open the entry~~ — expected for now: rows open the **entry
   preview** page (SPEC-FINAL §13.4, task 1.52), which isn't built yet; the final README
   says "Until it exists, rows don't open." My test list was wrong. Check in the fix
   that rows don't *look* tappable (no pointer / press state) until then.
2. **Phone: the scouter's full name is cut off.** Show the full name (wrap or a second
   line), not truncated.

## 06 Switch scouter

Phone and computer fine. The user "test" shows on the phone but not on the computer —
**not a bug**: the list is the accounts cached on *this device* (SPEC-FINAL §17.9, §7.5),
i.e. accounts that have signed in there before. Consider a one-line hint under the list
("Only accounts that have signed in on this device") — ask before adding.

## 07 Manage

**Computer**

1. **Removing a team from the roster fails.** The team disappears, comes straight back,
   and a "sign in again" message shows. (Add not tested: every team is already on the
   roster.)
2. **Creating an event → "sign in again".**
3. **Creating a season → "sign in again".**
   *Diagnosis so far (1–3):* "sign in again" is the server's 401 body, shown as-is by
   `panelErrorLine`. A freshly minted seed_admin token works on the preview server
   (listSeasons, getActiveContext and pull are all 200), so the server is fine and the
   **device's session is sending no token or a dead one.** `rpc.ts` skips
   `session.expire()` when `bearer` is null, so a session with no token gets a 401 on
   every call but never shows the expired banner. Suspect: the login fell back to an
   **offline sign-in** (8 s `LOGIN_TIMEOUT_MS` vs a Vercel cold start plus bcrypt), so the
   session holds no token. Confirm on the device before fixing.
   **Confirmed (2026-10-08):** after sign out and sign in, removing and adding roster teams
   and creating a season and an event all work. The session was holding no working token.
   **User requirement: this must never need a manual sign-out.** The fix must remove the
   cause: (a) find why the session lost its token, whether a silent offline fallback on a
   slow (cold-start) login or something else; (b) a tokenless or dead session must
   recover by itself (reconnect / token exchange), or at least be marked expired so the
   "Sign in again" strip shows, never fail silently call after call; (c) a test for it.
4. **Matches tab: no filter.** Desktop lists every match with no way to filter, unlike
   the phone. Add the phone's filter to the desktop Matches tab.

**Phone**

5. **The match edit sheet (right arrow on a match) is broken:**
   - wider than the screen (scrolls sideways);
   - opens scrolled to the bottom instead of the top;
   - focuses the first team's field straight away (keyboard up). Expected: open clean,
     with nothing focused; the user picks what to edit.
   - **swipe down closes it** (user asked explicitly; same rule as every sheet, Home note 2).

## 08 Users

Computer looks good. **The user "test" isn't in the list**, although the phone's Switch
scouter shows "test" as a cached account. Dev DB check (2026-10-08): the server has only
`seed_scouter`, `seed_lead` and `seed_admin`, and the app has no way to delete a user.
So the Users page is right, and the open question is **where the phone's cached "test"
came from**. It may be linked to the phone's sync problem (Entry note 4): if the waiting
entries' author is a user the server doesn't know, the push can never succeed.

## 09 User detail

Works. **But "sign in again" came back** after the earlier sign-out and sign-in, so the
Manage session problem (Manage notes 1–3) **recurs**: it isn't a one-off cold-start
login. Something drops or kills the token during normal use. Needs a repro in the fix
round (load a token for the preview into the browser pane through the API and watch
which call first returns 401 and what changed the token just before).
**Trigger (user):** it appeared when opening a specific user's detail page from Users.
With a fresh seed_admin token, `listUsers`, `getActiveContext` and
`countEntriesByScouter` all return 200 on the preview server, so the token was already
bad before the page loaded. Any 401 with a bearer calls `session.expire()` and drops the
token, so check what the session held and when it changed.

## 10 Change password

Computer — works, no notes.

## 11 Side menu and bottom bar

Computer — all working, no notes.

**Phone**

1. **Swipe closes the drawer.** The user said "swipe right". The drawer comes in from the
   **left** edge, so the close is a swipe **left**, back toward its edge (user: y). Also give it a drag that follows the finger, as with the sheets.
2. **Bottom bar: the green (`--accent`) highlight always sits on Scout**, even on Home
   or Entries. Expected: **only the current page is green** (Home, Scout or Entries), and
   on any other page none of them is. **User refined it: the current page gets the
   raised 58 px green button (the one Scout has now), and that button moves with the
   page.** Home raised on Home, Entries raised on Entries (badge stays), Scout raised on
   Scout, nothing raised elsewhere. **Design updated 2026-10-08:** shell final README,
   images 1/3/5/6/7 and THEME.md "Locked components". Other pages' final images still
   show the old always-raised Scout; the shell final wins.

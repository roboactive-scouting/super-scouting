# Offline check — run before every event

The real offline path, verified by hand on a **real phone with the network actually off**
(SPEC-FINAL 18.4, 20.4). Nothing here is simulated: no browser "offline" checkbox, no
desktop emulator. **Any step that fails is a release blocker.** Record every run in the
[Results log](#results-log) at the bottom.

Every expected result quotes what the app shows today (the phone layout, under 1024 px).
When a screen's words change, change them here in the same pull request.

## Where the test entries go

Ten test entries on production would count in the real rankings. So the check runs in two
parts, and only the first one writes data:

1. **The full procedure below, on the develop preview**, whose entries land in the **dev**
   database: `https://frc-scouting-client-git-develop-roboactive.vercel.app`. It proves
   the build only when develop runs the same commit as production: before you start,
   compare the `version …` line at the foot of Home on the develop URL and on
   `https://frc-scouting-client.vercel.app`. Two different commits are still the same
   build when `git diff <production commit> <develop commit> -- apps/client packages/shared`
   prints nothing. Otherwise promote first, or write "develop ≠ production" in the log and
   run again after the promotion.
2. **A five-minute device check on production, in Practice mode**, which saves and sends
   nothing (SPEC-FINAL 8.5): install from `https://frc-scouting-client.vercel.app`, sign
   in with your own account, let it load the event, turn on airplane mode, force-quit and
   cold-start it, then Scout → **Practice a match** → fill the form → **Finish practice**.
   Expect the PRACTICE strip with "Nothing is saved" throughout, and a "Practice finished"
   dialog saying "Nothing was saved or sent." Turn airplane mode off.

Afterwards, on the computer: `pnpm db:clean` removes the dev test entries and any match
the check created, so the next run has matches 16–20 free again. It refuses production.

## Before you start

- A phone from the supported baseline (Android Chrome from the last two years, or iOS
  Safari 16+), charged, on wifi, the app **not** yet installed from the URL under test.
- A second phone or tablet with the app installed, signed in and the same event loaded,
  to receive by QR (step 12). Its camera must work.
- A computer for step 14.
- On dev, sign in as a seed account (`seed_scouter`; the dev-only password is in
  `docs/ops/BUILD-CONTEXT.md` §3). The active event is **Seed District Event**, and
  matches **16–20** are left unscouted for exactly this: steps 5–7 use matches 16 and 17
  (12 robots, 10 entries).
- For step 15, a USB cable and a computer for remote dev tools (Android: Chrome →
  `chrome://inspect`; iPhone: Safari → Develop menu), or a screen recording.

## The procedure

1. **Install the app** from the URL under test: Android Chrome ⋮ → **Install app** (or
   **Add to Home screen**); iPhone Safari Share → **Add to Home Screen**.
   → The icon is the yellow trefoil on black, and it is named **Scouting**.
2. **Open it online, sign in, and let it load.**
   → Home reads "This device is working on" over the event's name (on dev: **Seed
   District Event**). The pill at the top right reads **All sent**. No "Working from data
   already on this device" strip is left once it has loaded.
3. **Turn on airplane mode. Force-quit the app. Cold-start it** from the icon, and time it.
   → Home is usable in **under 3 seconds**, and the strip under the top bar reads:
   "Working from data already on this device. Your entries are safe here and will sync
   when a connection returns." The pill reads **Offline**.
4. **Open the entry screen**: Scout → match **16** → a robot → **Start entry**.
   → The form shows every field of every phase, and the match timer bar is pinned under
   the top bar with **▶ Start match** and the match length (it stays in view as you
   scroll). A form without a timer has no bar.
5. **Enter 10 entries for 10 different robots** (matches 16 and 17), using every field
   type the form has at least once (on dev: counters, a toggle, single selects, long
   text). Each ends **Review entry** → "Confirm this entry" → **Submit entry**.
   → After each submit: "Entry saved on this device · Q16 · <team>". After the tenth, the
   pill reads **Offline · 10**.
6. **Mid-entry** (one of the ten, before Review entry), **force-quit and reopen**, then
   open Scout.
   → At the top: "You have an unfinished entry: Q17 · <team>, <Red/Blue> alliance — last
   change HH:MM, on this device." with **Discard** and **Resume**. **Resume** opens it
   with every value as it was. Finish and submit it.
7. **Make one of the ten a no-show**: Robot status → **No show**.
   → The phases and their fields disappear. "Confirm this entry" lists **Robot status ·
   No show** and nothing else. Submit it.
8. **Try to reach the form builder.**
   → The phone's menu has no **Forms** entry, for any role. On Android, also open
   `<URL>/admin/forms` in a Chrome tab: "This needs a computer" — "Open the forms page on
   a screen at least 1024 pixels wide. …" and **Back to scouting**. Never a half-working
   builder.
9. **Try to switch the competition**: Home → **Switch competition**.
   → The sheet says "Only the default competition is available offline. Your data is safe
   on this device." Every season and event but the default is greyed out and does nothing.
   **Close**.
10. **Open the ranking** (Ranking in the bottom bar).
    → A notice: "Computed from the data on this device" over "Last synced HH:MM · 10
    entries waiting to send". The table is there, computed on the phone with no network.
11. **Open Sync** (tap the pill).
    → The strip reads **Offline**, "last sync HH:MM · sends by itself" (another day:
    "last sync DD/MM/YYYY HH:MM"). **Waiting** shows **10**, each card naming its match
    (Q16, Q17) and team, "saved HH:MM" and **This phone**.
12. **Send the ten by QR to the second device.** On the test phone (still offline): Sync →
    ⋯ → **Send by QR**; on the second device: Sync → ⋯ → **Receive by QR**, and point its
    camera at the test phone.
    → The test phone says "Nothing is marked sent. These records wait for the cloud as
    before." The receiver turns green: "Got it, <your name>!", the count **10**, "records ·
    10 entries", with **Scan the next phone** and **Done — back to Sync**. Its Sync page
    shows a "Received by QR" block, "10 from 1 scouter". **Back on the test phone, Sync
    still shows Waiting 10**, each card now with "shown by QR HH:MM".
13. **Turn airplane mode off.**
    → Within a few seconds of the wifi icon returning, the pill reads **All sent**, the
    "Working from data already on this device" strip is gone, and Sync reads **Online**,
    "last sync" with the current time, **Waiting 0** and the ten under **Sent**.
14. **On a computer**, open the same URL, sign in, and open **Entries** and **Ranking**.
    → The ten entries are listed once each (the copies the second device received are
    the same records, never duplicates), with your name; open three and the answers match
    what you entered. On Ranking, each of the nine played robots has one more in **Matches**
    than before the check, and the no-show robot has one more in **No-shows** and none
    more in Matches.
15. **Measure the two SPEC-FINAL 18.1 targets.**
    - **Tap under 100 ms.** With remote dev tools on the phone (Performance, record), tap a
      counter on the entry screen. The interaction from tap to the new number painted
      must be **under 100 ms**. It is a local state update, so anything slower is a
      re-render bug, not a network one.
    - **Sync within 2 s of connectivity.** Turn airplane mode on, submit an eleventh entry
      (match 17's last robot; the pill reads **Offline · 1**), then turn airplane mode off.
      Time from the wifi icon appearing in the phone's status bar to the pill reading
      **All sent** (a stopwatch, or count frames in a screen recording). It must be
      **within 2 seconds**: coming back online starts a sync at once.

    Write both numbers in the log. A regression here is invisible until it is infuriating.

    *Known, not a step:* an entry submitted while the phone is **already online** is not
    pushed at once. It goes on the next automatic refresh (every 45 seconds), when the
    connection returns, or on **Sync now**, so it can take up to 45 seconds to reach the
    server. Raised with the 1.63 build (`docs/plans/DEVIATIONS.md`).

## Results log

Copy the block below for each run, newest first. Fill every row; a step not run is a fail.

### Run — DD/MM/YYYY

| | |
|---|---|
| Date | |
| Who ran it | |
| Device (model, OS, browser) | |
| Deployment (URL, and the `version …` line on Home) | |
| Same commit as production? | |
| Production Practice-mode check | pass / fail |
| 1 Install | pass / fail |
| 2 Online, loaded | pass / fail |
| 3 Cold start offline (seconds) | pass / fail · s |
| 4 Entry screen | pass / fail |
| 5 Ten entries | pass / fail |
| 6 Draft recovery | pass / fail |
| 7 No-show | pass / fail |
| 8 Form builder | pass / fail |
| 9 Switch competition | pass / fail |
| 10 Ranking on the device | pass / fail |
| 11 Sync page | pass / fail |
| 12 QR to a second device | pass / fail |
| 13 Back online | pass / fail |
| 14 Computer | pass / fail |
| 15a Tap (ms, target under 100) | |
| 15b Sync (s, target within 2) | |
| `pnpm db:clean` afterwards | done / not needed |
| Notes | |

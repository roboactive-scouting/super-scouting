# Runbook — what to do when something breaks at an event

One page. A checklist, not a manual. Updated after every event.

**The one thing to remember:** entries live on the device that made them until the
server acknowledges them. Sync failing is an inconvenience. Wiping a device that
still holds unacknowledged entries is a loss.

## Site will not load

1. Open the Vercel dashboard for the affected project (client or server).
2. Deployments → the last deployment that was green → **Promote to Production**.
3. Confirm: `https://frc-scouting-server.vercel.app/health`, opened in any browser, returns
   `{"status":"ok","database":"ok",...}` and a `commit`.
4. If `/health` says `database: error`, the Supabase project is paused or unreachable.
   Open the Supabase dashboard; a paused project resumes on first access.
5. Scouters keep scouting throughout. Nothing they have entered is lost.

## Sync is failing

1. **Keep scouting.** The data is safe on the device.
2. Walk outside the arena and open the sync page; press **Sync now**.
3. Still failing → hop the data to the collector tablet by QR (Sync → ⋯ → **Send by QR**),
   and let the runner carry that tablet outside.
4. Never clear a device's data to "fix" sync. The wipe holds while anything is
   unacknowledged, and that hold is correct.

## QR collector

The arena has no internet; one **collector tablet** gathers everyone's records by QR, and
a runner carries it outside to sync.

- **Who sends:** each scouter, from their phone: Sync → ⋯ → **Send by QR**. The code loops
  by itself; hold the phone still about 20 cm from the tablet's camera. With more than 200
  records the phone shows **Next batch** — tap it once the tablet says "Got it". Sending
  marks nothing sent: the phone keeps every record until it syncs itself ("shown by QR
  11:44" on Sync is a display, not a receipt).
- **Who receives:** the collector tablet only: Sync → ⋯ → **Receive by QR**. The screen
  turns green with the scouter's name and the count; **Scan the next phone**. A damaged
  code starts again by itself and saves nothing. A batch is saved only when complete, and
  scanning the same phone twice changes nothing.
- **When the runner goes out:** every few matches, and whenever Sync's "Received by QR"
  block is large. Outside, open Sync and press **Sync now**. Each received copy leaves the
  tablet's outbox the moment the cloud acknowledges it — never before.
- **Escape hatch:** Sync → ⋯ → **Discard received QR data** removes the received copies,
  and only once every one of them has reached the cloud; otherwise it refuses whole and
  says how many are still waiting.
- **The wipe:** Settings → **Wipe this device**, with the lead's code and typing to
  confirm. While any record on the device has not reached the cloud it is held: the only
  ways on are **Send by QR first**, or **Wipe anyway…**, which asks again for the lead's
  code and for the number of records that will be lost, typed. Offline, it warns that the
  phone cannot sign in again until it has a connection. Sync first; never wipe to "fix"
  sync.

## A device shows no matches

A device that has loaded the competition once opens straight to it, with or without a
connection. These screens appear only on a device that has not loaded it yet.

- **"No competition is set up yet"** — the server answered: no active event is set.
  Not a connection problem. An admin sets the season and event; the device picks it up
  within a minute, or at once when it reconnects.
- **"Loading the competition onto this device"** — the first load is under way. Wait.
- **"This device has not loaded the competition yet" + "Cannot reach the server. Check
  that this is the right address for the app, then try again."** — the device is online
  but the server did not answer. Check the address first: only the production URL and the
  `develop` preview URL are allowed; a per-deployment preview URL is refused by CORS.
  Then check `/health` (Site will not load, above).
- **"This device has not loaded the competition yet" + "An internet connection is
  required once, …"** — the device says it is offline. Get it onto a network once.
- The same "Cannot reach the server" line at **sign-in** means the same thing: the
  address, or the server, is wrong. It appears only on a device with no cached accounts.

## A tablet is dead or misbehaving

1. Take a spare device, install the app, log in, and let it pull the event.
2. Whatever the dead device already sent to the collector tablet by QR is safe there:
   the collector's next sync delivers it with its original author and timestamps.
   Anything it never sent is on the dead device only.
3. If the dead device comes back to life, open Sync: let it sync, or **Send by QR** to the
   collector. A second upload of the same record is an idempotent no-op, never a
   duplicate. Do not wipe it while its Sync page shows anything waiting.

## Conflicts are piling up

1. A **lead or an admin** opens **Conflicts** in the menu, or the "N conflicts to review"
   link on Sync (shown while the current event has open conflicts).
2. Resolution needs a connection; offline the queue is readable but not resolvable.
3. "Edited on two phones": **Keep** the current copy or **Restore** the other one.
   "Scouted twice": **Keep** one of the two.
4. Clear the queue before the end of the day. An unresolved duplicate does not corrupt
   statistics — the latest entry wins — but it hides a scouting mix-up worth knowing about.

## Pre-event checklist

- [ ] Run the **two-file production backup** from `SETUP.md` → *Backup: `supabase db dump`*
      — the schema dump **and** the `--data-only` dump. `supabase db dump` with no flags
      writes the schema and none of the rows, so one file is not a backup. Save both
      off-platform. **Not optional.**
- [ ] The latest CI run on `main` is green, **Smoke suite** included: the deployed
      server reached the dev database through login, the active context, a form version,
      an entry submitted and read back, and one ranking.
- [ ] 48 hours before: open `https://frc-scouting-client.vercel.app` and confirm it
      loads, and `https://frc-scouting-server.vercel.app/health` reads `"database":"ok"`.
      This also wakes the database; the daily keep-alive job (05:17 UTC) should already
      have kept it awake.
- [ ] Run `OFFLINE-CHECK.md` on a real phone with the network actually off: the full
      procedure on the develop preview, then the Practice-mode check on production. Record
      it there and summarise it in the Results log below. Afterwards `pnpm db:clean`.
- [ ] The admin has set the event as the default competition (Admin → Manage), and its
      roster and schedule are in.
- [ ] Confirm every scouting device has loaded the event while on wifi: Home reads "This
      device is working on" over the event's name, with no "has not loaded" screen.
- [ ] Confirm every device shows the same `version …` line, at the foot of Home or in
      the phone menu.

## Daily at an event

- [ ] Every device syncs at least once. Before it is put away, its pill reads **All
      sent** (not "N waiting" or "Offline · N") — the app is designed for a one-day offline
      window, not a weekend one.
- [ ] The conflict queue is empty, or the open items are known.
- [ ] The collector tablet has been carried outside at least once per two match cycles.

## Results log

| Date | Event | Who ran the offline check | Result |
|---|---|---|---|
| 2026-09-23 | Phase 1A rehearsal — no competition | eldad | **Pass**, on a physical iPhone against the `develop` preview. Installed the PWA, loaded once online, airplane mode, cold start, entered match data, force-quit and reopened still offline with everything intact, then reconnected and watched it sync. Separately and by accident, the same device held unsynced entries for several hours while `POST /sync/push` was returning 500, and pushed every one of them once the server was fixed — nothing was lost. That is a stronger durability result than the scripted test. |

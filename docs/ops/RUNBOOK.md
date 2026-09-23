# Runbook — what to do when something breaks at an event

One page. A checklist, not a manual. Updated after every event.

**The one thing to remember:** entries live on the device that made them until the
server acknowledges them. Sync failing is an inconvenience. Wiping a device that
still holds unacknowledged entries is a loss.

## Site will not load

1. Open the Vercel dashboard for the affected project (client or server).
2. Deployments → the last deployment that was green → **Promote to Production**.
3. Confirm: `curl -s https://<server-host>/health` returns `{"status":"ok","database":"ok",...}`.
4. If `/health` says `database: error`, the Supabase project is paused or unreachable.
   Open the Supabase dashboard; a paused project resumes on first access.
5. Scouters keep scouting throughout. Nothing they have entered is lost.

## Sync is failing

1. **Keep scouting.** The data is safe on the device.
2. Walk outside the arena and open the sync page; press **Sync now**.
3. Still failing → hop the data to the collector tablet by QR (Sync → Send by QR),
   and let the runner carry that tablet outside.
4. Never clear a device's data to "fix" sync. The wipe refuses while anything is
   unacknowledged, and that refusal is correct.

## A tablet is dead or misbehaving

1. Take a spare device, install the app, log in, and let it pull the event.
2. Recover the dead device's entries by QR from the collector tablet
   (Sync → Receive by QR). The originals keep their author and their timestamps.
3. If the dead device comes back to life, let it sync normally — a second upload of
   the same record is an idempotent no-op, never a duplicate.

## Conflicts are piling up

1. A **lead or an admin** opens Sync → Conflicts.
2. Resolution needs a connection; offline the queue is readable but not resolvable.
3. A divergence: keep the current copy, or restore the other one. A duplicate: keep one.
4. Clear the queue before the end of the day. An unresolved duplicate does not corrupt
   statistics — the latest entry wins — but it hides a scouting mix-up worth knowing about.

## Pre-event checklist

- [ ] Run the **two-file production backup** from `SETUP.md` → *Backup: `supabase db dump`*
      — the schema dump **and** the `--data-only` dump. `supabase db dump` with no flags
      writes the schema and none of the rows, so one file is not a backup. Save both
      off-platform. **Not optional.**
- [ ] 48 hours before: open the app and confirm it loads (this also wakes the database).
- [ ] Verify the offline path on a real phone with the network actually off.
      (Task 1.63 turns this line into a numbered procedure in `OFFLINE-CHECK.md`.)
- [ ] Confirm every scouting device has hydrated the event while on wifi.
- [ ] Confirm every device shows the same version string on the context page.

## Daily at an event

- [ ] Every device syncs at least once. Check the unsynced count on each before it is
      put away — the app is designed for a one-day offline window, not a weekend one.
- [ ] The conflict queue is empty, or the open items are known.
- [ ] The collector tablet has been carried outside at least once per two match cycles.

## Results log

| Date | Event | Who ran the offline check | Result |
|---|---|---|---|
| 2026-09-23 | Phase 1A rehearsal — no competition | eldad | **Pass**, on a physical iPhone against the `develop` preview. Installed the PWA, loaded once online, airplane mode, cold start, entered match data, force-quit and reopened still offline with everything intact, then reconnected and watched it sync. Separately and by accident, the same device held unsynced entries for several hours while `POST /sync/push` was returning 500, and pushed every one of them once the server was fixed — nothing was lost. That is a stronger durability result than the scripted test. |

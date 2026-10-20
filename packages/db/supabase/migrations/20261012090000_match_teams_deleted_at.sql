-- Migration — a cleared match slot reaches devices (spec §7.5 item 1; task 1.40).
--
-- setMatchTeams replaces a match's six slots, so a slot the admin leaves empty used to be
-- hard-deleted. The delta pull only returns rows whose updated_at moved, so a device that
-- already held the slot kept showing the old team in it for good. A cleared slot is now a
-- tombstone instead (deleted_at = now(); the set_updated_at trigger moves updated_at, so the
-- next delta pull carries it), exactly as event_teams does for the roster. Filling the same
-- (match, alliance, station) again revives that row: the unique constraint allows one row
-- per slot, live or not.
--
-- Matches themselves keep their own mechanism (match_deletions, 20261008090000): a match has
-- no deleted_at (SPEC-FINAL 9.3), and a deleted match's slots still go with it by cascade.
-- Every server reader of match_teams ignores tombstoned rows.

alter table public.match_teams add column deleted_at timestamptz;

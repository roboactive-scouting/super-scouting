-- Migration — what a conflict's resolution kept (SPEC-FINAL §3.6 v1.28, §9.5; task 1.41).
--
-- resolveConflict sets resolved_at and resolved_by, which say WHEN and BY WHOM a conflict
-- was settled but not WHAT was kept. The Conflicts page's "Settled today" log names the
-- kept copy, so the command's choice is stored as given: {"keep": "live" | "superseded"}
-- for a divergence, {"keep_row_id": "<uuid>"} for a duplicate. Null while the conflict is
-- open, and null on any row resolved before this column existed.
--
-- No index and no default: the review queue reads the event's rows by (event_id) and
-- resolved_at, both already indexed, and the value is only ever displayed. The table's
-- set_updated_at trigger moves updated_at on the resolving update, so the delta pull
-- carries the resolution to every device.

alter table public.sync_conflicts add column resolution jsonb;

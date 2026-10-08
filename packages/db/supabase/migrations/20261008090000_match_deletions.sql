-- Migration — hard-deleted matches reach devices (SPEC-FINAL 9.3, amended v1.18; task UF.1).
--
-- A match has no deleted_at: an admin's match delete (and an event or season cascade) is a
-- hard delete, so the delta pull never carried it, and a device went on offering a match the
-- server no longer had. Every entry recorded against it then failed to push. This table is the
-- tombstone the pull reads instead: one row per deleted match id, written by a trigger so no
-- code path can delete a match without leaving it.
--
-- No foreign keys on purpose: the match is gone, and an event delete cascades to its matches
-- (the trigger fires for those too) and to the event itself.

create table public.match_deletions (
  match_id    uuid primary key,
  event_id    uuid not null,
  deleted_at  timestamptz not null default now()
);
create index match_deletions_delta_idx on public.match_deletions (event_id, deleted_at);

create or replace function public.record_match_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.match_deletions (match_id, event_id, deleted_at)
  values (old.id, old.event_id, now())
  on conflict (match_id) do update
    set event_id = excluded.event_id, deleted_at = excluded.deleted_at;
  return null;
end $$;

-- A match created again under the same id (the client rebuilds a deleted match from its cached
-- row, SPEC-FINAL 9.7) is live again: its tombstone goes, or the next delta pull would drop it.
create or replace function public.clear_match_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.match_deletions where match_id = new.id;
  return null;
end $$;

create trigger record_match_deletion after delete on public.matches
  for each row execute function public.record_match_deletion();
create trigger clear_match_deletion after insert on public.matches
  for each row execute function public.clear_match_deletion();

-- Trigger functions only; nothing calls them through the Data API.
revoke execute on function public.record_match_deletion() from public, anon, authenticated;
revoke execute on function public.clear_match_deletion() from public, anon, authenticated;

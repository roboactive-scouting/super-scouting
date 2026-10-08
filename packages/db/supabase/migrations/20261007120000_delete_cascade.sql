-- Migration — hard cascade delete of a season or an event (SPEC-FINAL 3.9; task RB.20).
--
-- SPEC-FINAL 3.9: hard cascade deletes. Entries go first because
-- scouting_entries.match_id is ON DELETE RESTRICT (checked immediately): a plain
-- `delete from events` can fail when Postgres reaches a match before its entries.
-- One function call is one transaction, so a delete either removes everything or nothing.
-- Every other child (matches, match_teams, event_teams, pick lists, the bracket, forms,
-- their versions and fields, metrics, dashboards, presets) goes by its own ON DELETE CASCADE,
-- and app_settings' active ids are ON DELETE SET NULL. The use case refuses the active
-- season and event before it gets here.

create or replace function public.delete_event_cascade(p_event_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.scouting_entries where event_id = p_event_id;
  delete from public.events where id = p_event_id;
end $$;

create or replace function public.delete_season_cascade(p_season_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.scouting_entries where event_id in (select id from public.events where season_id = p_season_id);
  delete from public.seasons where id = p_season_id;
end $$;

-- Only the server (service role) calls these. Authorization lives in the use-case layer
-- (no RLS, SPEC-FINAL 7.4), so nothing else may reach them through the Data API.
revoke execute on function public.delete_event_cascade(uuid) from public, anon, authenticated;
revoke execute on function public.delete_season_cascade(uuid) from public, anon, authenticated;
grant execute on function public.delete_event_cascade(uuid) to service_role;
grant execute on function public.delete_season_cascade(uuid) to service_role;

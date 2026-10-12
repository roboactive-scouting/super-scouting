-- Migration — deleted form rows reach devices (spec §7.5 item 5; task 1.40).
--
-- forms, form_versions, form_fields and scoring_rules carry no deleted_at: a field removed
-- from a draft (saveDraftFields), a deleted version (deleteFormVersion), a dropped scoring
-- rule (setScoringRules) and a deleted form (deleteForm) are hard deletes the delta pull
-- cannot see, so a device went on scoring with a rule the admin had removed. This table is
-- the tombstone the pull reads instead, one row per deleted id, written by a trigger so no
-- code path can delete one of these rows without leaving it — the match_deletions pattern
-- (UF.1, 20261008090000).
--
-- season_id is what the pull scopes by, looked up when the row goes: a form's own column, a
-- version's or rule's form, a field's version's form. IN AN ON DELETE CASCADE THE PARENT IS
-- ALREADY GONE when a child's trigger fires, so a cascaded child's season_id comes back
-- null, and a row with a null season_id is never delivered. That is safe only because the
-- parent's own tombstone covers it: a device that drops a deleted form drops that form's
-- versions, fields and rules itself, and one that drops a deleted version drops its fields
-- (task 1.42). A row deleted on its own (a field, a rule, a version) always finds its parent.
--
-- No foreign keys on purpose: the row is gone, and a season delete cascades to its forms.

create table public.form_deletions (
  entity      text not null
                check (entity in ('forms','form_versions','form_fields','scoring_rules')),
  row_id      uuid not null,
  season_id   uuid,
  deleted_at  timestamptz not null default now(),
  primary key (entity, row_id)
);
create index form_deletions_delta_idx on public.form_deletions (season_id, deleted_at);

create or replace function public.record_form_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_old    jsonb := to_jsonb(old);
  v_season uuid;
begin
  v_season := case tg_table_name
    when 'forms' then (v_old ->> 'season_id')::uuid
    when 'form_versions' then
      (select f.season_id from public.forms f where f.id = (v_old ->> 'form_id')::uuid)
    when 'scoring_rules' then
      (select f.season_id from public.forms f where f.id = (v_old ->> 'form_id')::uuid)
    when 'form_fields' then
      (select f.season_id
         from public.form_versions v
         join public.forms f on f.id = v.form_id
        where v.id = (v_old ->> 'form_version_id')::uuid)
  end;
  insert into public.form_deletions (entity, row_id, season_id, deleted_at)
  values (tg_table_name, old.id, v_season, now())
  on conflict (entity, row_id) do update
    set season_id = excluded.season_id, deleted_at = excluded.deleted_at;
  return null;
end $$;

-- A row inserted again under the same id (writeFormFields and replaceScoringRules upsert by
-- id-carrying rows) is live again: its tombstone goes, or the next delta pull would drop it.
create or replace function public.clear_form_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.form_deletions where entity = tg_table_name and row_id = new.id;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['forms','form_versions','form_fields','scoring_rules'] loop
    execute format(
      'create trigger record_form_deletion after delete on public.%I
         for each row execute function public.record_form_deletion()', t);
    execute format(
      'create trigger clear_form_deletion after insert on public.%I
         for each row execute function public.clear_form_deletion()', t);
  end loop;
end $$;

-- Trigger functions only; nothing calls them through the Data API.
revoke execute on function public.record_form_deletion() from public, anon, authenticated;
revoke execute on function public.clear_form_deletion() from public, anon, authenticated;

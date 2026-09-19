-- Migration 0003 — scouting entries and sync conflicts (SPEC-FINAL §3.5, §3.6).

create table public.scouting_entries (
  id                 uuid primary key,                        -- client-generated
  form_version_id    uuid not null references public.form_versions(id) on delete cascade,
  form_kind          text not null check (form_kind in ('match','super')),
  event_id           uuid not null references public.events(id) on delete cascade,
  match_id           uuid references public.matches(id) on delete restrict,
  team_id            uuid not null references public.teams(id) on delete restrict,
  alliance           text check (alliance in ('red','blue')),
  scouter_id         uuid not null references public.users(id) on delete restrict,
  robot_status       text check (robot_status in ('played','no_show','disabled','broke_down')),
  breakdown_seconds  integer,
  data               jsonb not null default '{}'::jsonb,
  version            integer not null default 1,              -- server-assigned revision (§9.5)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);

-- Duplicate detection for the canonical-entry rule. DELIBERATELY NOT UNIQUE (§9.5, §11.6):
-- both rows are kept and flagged, and the engine reads the latest client_updated_at.
create index scouting_entries_logical_key_idx
  on public.scouting_entries (event_id, form_kind, team_id, match_id)
  where deleted_at is null;
-- The delta-pull index (§9.3).
create index scouting_entries_delta_idx on public.scouting_entries (event_id, updated_at);
create index scouting_entries_scouter_idx on public.scouting_entries (scouter_id);
create index scouting_entries_match_idx on public.scouting_entries (match_id);
create index scouting_entries_form_version_idx on public.scouting_entries (form_version_id);
-- No GIN index on data: nothing in v1 queries the JSONB from SQL (§3.5).

create table public.sync_conflicts (
  id                            uuid primary key,
  event_id                      uuid not null references public.events(id) on delete cascade,
  entity                        text not null check (entity in
                                  ('scouting_entry','pick_list','pick_list_entry',
                                   'do_not_pick','alliance_slot')),
  row_id                        uuid not null,
  kind                          text not null check (kind in ('divergence','duplicate')),
  superseded_payload            jsonb,
  superseded_author_id          uuid references public.users(id),
  superseded_client_updated_at  timestamptz,
  base_version                  integer,
  duplicate_row_id              uuid,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  resolved_at                   timestamptz,
  resolved_by                   uuid references public.users(id)
);
create index sync_conflicts_delta_idx on public.sync_conflicts (event_id, updated_at);
create index sync_conflicts_entity_idx on public.sync_conflicts (entity, row_id);
create index sync_conflicts_open_idx on public.sync_conflicts (event_id) where resolved_at is null;

-- The op_id idempotency ledger (SPEC-FINAL 9.3.1). Replaying a push batch is safe:
-- a previously applied op_id returns `noop`. It carries no updated_at and therefore
-- no trigger — it is append-only and is never synced to a device.
create table public.applied_operations (
  op_id       text primary key,
  applied_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['scouting_entries','sync_conflicts'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

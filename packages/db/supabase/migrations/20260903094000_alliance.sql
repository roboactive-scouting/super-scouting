-- Migration 0005 — alliance selection (SPEC-FINAL §3.8).

create table public.pick_lists (
  id                     uuid primary key,
  event_id               uuid not null references public.events(id) on delete cascade,
  kind                   text not null check (kind in ('first','second')),
  seeded_from_preset_id  uuid references public.weight_presets(id) on delete set null,
  seeded_from_weights    jsonb,
  version                integer not null default 1,   -- the ordering guard (§14.7)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  client_created_at      timestamptz not null,
  client_updated_at      timestamptz not null,
  unique (event_id, kind)
);
create index pick_lists_delta_idx on public.pick_lists (event_id, updated_at);

create table public.pick_list_entries (
  id                 uuid primary key,
  pick_list_id       uuid not null references public.pick_lists(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  rank               integer not null,
  note               text,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);
create unique index pick_list_entries_live_idx
  on public.pick_list_entries (pick_list_id, team_id) where deleted_at is null;
create index pick_list_entries_rank_idx on public.pick_list_entries (pick_list_id, rank);
create index pick_list_entries_delta_idx on public.pick_list_entries (pick_list_id, updated_at);

create table public.do_not_pick (
  id                 uuid primary key,
  event_id           uuid not null references public.events(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  reason             text not null check (length(btrim(reason)) > 0),
  created_by         uuid not null references public.users(id),
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  deleted_at         timestamptz
);
create unique index do_not_pick_live_idx on public.do_not_pick (event_id, team_id) where deleted_at is null;
create index do_not_pick_delta_idx on public.do_not_pick (event_id, updated_at);

create table public.alliances (
  id         uuid primary key,
  event_id   uuid not null references public.events(id) on delete cascade,
  number     integer not null check (number between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, number)
);

-- An empty slot is a row with team_id null, never an absent row (§3.8, D31).
create table public.alliance_slots (
  id                 uuid primary key,
  alliance_id        uuid not null references public.alliances(id) on delete cascade,
  slot               text not null check (slot in ('captain','pick1','pick2','backup')),
  team_id            uuid references public.teams(id) on delete restrict,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  client_updated_at  timestamptz not null,
  unique (alliance_id, slot)
);
create index alliance_slots_alliance_idx on public.alliance_slots (alliance_id);

create table public.alliance_declines (
  id                 uuid primary key,
  alliance_id        uuid not null references public.alliances(id) on delete cascade,
  team_id            uuid not null references public.teams(id) on delete restrict,
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  client_created_at  timestamptz not null,
  deleted_at         timestamptz,
  unique (alliance_id, team_id)
);
create index alliance_declines_alliance_idx on public.alliance_declines (alliance_id);

do $$
declare t text;
begin
  foreach t in array array[
    'pick_lists','pick_list_entries','do_not_pick','alliances','alliance_slots','alliance_declines'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

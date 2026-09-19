-- Migration 0001 — the fixed skeleton (SPEC-FINAL §3.1).
-- No RLS anywhere in this schema: authorization lives in the server use-case layer (§7.4).

create extension if not exists pgcrypto;

-- The one load-bearing trigger (§3.10). Without it the delta pull silently misses
-- every edit and every tombstone. It is a timestamp assignment, not logic.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.seasons (
  id                uuid primary key,
  year              integer not null unique,
  game_name         text not null,
  field_image_path  text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.events (
  id          uuid primary key,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  name        text not null,
  code        text,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season_id, name)
);
create index events_season_sort_idx on public.events (season_id, sort_order);

-- The active context is a singleton row, not a flag on events (§3.1, D21).
create table public.app_settings (
  id                boolean primary key default true check (id),
  active_season_id  uuid references public.seasons(id) on delete set null,
  active_event_id   uuid references public.events(id)  on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
insert into public.app_settings (id) values (true);

create table public.teams (
  id          uuid primary key,
  number      integer not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.event_teams (
  id          uuid primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  team_id     uuid not null references public.teams(id)  on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index event_teams_live_idx on public.event_teams (event_id, team_id) where deleted_at is null;
create index event_teams_delta_idx on public.event_teams (event_id, updated_at);
create index event_teams_team_idx on public.event_teams (team_id);

create table public.matches (
  id                  uuid primary key,
  event_id            uuid not null references public.events(id) on delete cascade,
  match_type          text not null check (match_type in ('practice','qualification','playoff')),
  number              integer not null,
  -- reserved official result, nullable, never populated in v1 (§3.1)
  official_red_score  integer,
  official_blue_score integer,
  official_red_rp     integer,
  official_blue_rp    integer,
  official_winner     text check (official_winner in ('red','blue','tie')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (event_id, match_type, number)
);
create index matches_delta_idx on public.matches (event_id, updated_at);

create table public.match_teams (
  id          uuid primary key,
  match_id    uuid not null references public.matches(id) on delete cascade,
  alliance    text not null check (alliance in ('red','blue')),
  station     integer not null check (station between 1 and 3),
  team_id     uuid not null references public.teams(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (match_id, alliance, station)
);
create index match_teams_team_idx on public.match_teams (team_id);
create index match_teams_match_idx on public.match_teams (match_id);

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','events','app_settings','teams','event_teams','matches','match_teams'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Migration 0004 — metrics, dashboards, charts, weight presets (SPEC-FINAL §3.7).

create table public.metrics (
  id           uuid primary key,
  season_id    uuid not null references public.seasons(id) on delete cascade,
  source_kind  text not null check (source_kind in ('form','meta')),
  form_id      uuid references public.forms(id) on delete cascade,
  name         text not null,
  description  text,
  definition   jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (season_id, name)
);
create index metrics_delta_idx on public.metrics (season_id, updated_at);

create table public.dashboards (
  id         uuid primary key,
  season_id  uuid not null references public.seasons(id) on delete cascade,
  kind       text not null check (kind in
               ('custom','team','ranking','compare','match_preview','operational')),
  name       text not null,
  scope      jsonb not null,
  filters    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- exactly one of each built-in kind per season; 'custom' is unconstrained
create unique index dashboards_builtin_idx on public.dashboards (season_id, kind) where kind <> 'custom';
create index dashboards_delta_idx on public.dashboards (season_id, updated_at);

create table public.dashboard_charts (
  id            uuid primary key,
  dashboard_id  uuid not null references public.dashboards(id) on delete cascade,
  position      integer not null,
  span          integer not null check (span in (3,6,12)),
  config        jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index dashboard_charts_position_idx on public.dashboard_charts (dashboard_id, position);

create table public.weight_presets (
  id         uuid primary key,
  season_id  uuid not null references public.seasons(id) on delete cascade,
  name       text not null,
  weights    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name)
);
create index weight_presets_delta_idx on public.weight_presets (season_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['metrics','dashboards','dashboard_charts','weight_presets'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Migration 0002 — users, forms, versions, fields, scoring (SPEC-FINAL §3.2–§3.4).

create table public.users (
  id                   uuid primary key,
  username             text not null,
  full_name            text not null,
  password_hash        text not null,             -- bcrypt, cost 10 (§7.5)
  role                 text not null check (role in ('scouter','lead','admin')),
  must_change_password boolean not null default false,
  disabled_at          timestamptz,               -- "delete a user" means disable (§3.2)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Case-insensitive uniqueness without the citext extension (§7.5).
create unique index users_username_lower_idx on public.users (lower(username));

create table public.forms (
  id                 uuid primary key,
  season_id          uuid not null references public.seasons(id) on delete cascade,
  kind               text not null check (kind in ('match','super')),
  name               text not null,
  active_version_id  uuid,                        -- FK added below (circular reference)
  timer_config       jsonb not null default '{"phases":[]}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (season_id, kind)
);

create table public.form_versions (
  id            uuid primary key,
  form_id       uuid not null references public.forms(id) on delete cascade,
  version_no    integer not null,
  published_at  timestamptz,                      -- null = draft
  is_locked     boolean not null default false,   -- true once an entry binds to it
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (form_id, version_no)
);
create index form_versions_delta_idx on public.form_versions (form_id, updated_at);

alter table public.forms
  add constraint forms_active_version_fk
  foreign key (active_version_id) references public.form_versions(id) on delete set null;

create table public.form_fields (
  id                    uuid primary key,
  form_version_id       uuid not null references public.form_versions(id) on delete cascade,
  key                   text not null,            -- PERMANENT. Never changes, ever.
  label                 text not null,            -- editable in place, no new version
  help_text             text,
  type                  text not null,
  section               text,
  display_order         integer not null,
  required              boolean not null default false,
  default_value         jsonb,
  config                jsonb not null default '{}'::jsonb,
  visibility_condition  jsonb,
  deprecated            boolean not null default false,
  -- semantic metadata; required on data fields, enforced in the use-case layer (§3.3)
  description           text,
  unit                  text check (unit in ('count','seconds','points','boolean','enum','text','coordinate')),
  phase                 text check (phase in ('auto','teleop','endgame','post_match')),
  direction             text check (direction in ('higher_is_better','lower_is_better','neutral')),
  category              text,
  expected_range        jsonb,
  include_in_ai_context boolean,
  is_ordinal            boolean,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (form_version_id, key)
);
create index form_fields_delta_idx on public.form_fields (form_version_id, updated_at);

create table public.scoring_rules (
  id             uuid primary key,
  form_id        uuid not null references public.forms(id) on delete cascade,
  field_key      text not null,
  points         numeric not null default 0 check (points >= 0),
  option_points  jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (form_id, field_key)
);
create index scoring_rules_delta_idx on public.scoring_rules (form_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['users','forms','form_versions','form_fields','scoring_rules'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

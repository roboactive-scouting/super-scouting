-- Migration — saved form exports, kept 24 hours (SPEC-FINAL 3.3 and 5.1, amended v1.22; task 1.27).
--
-- Export saves one form version's portable definition (exactly what exportForm returns) here;
-- Import picks from these. Rows older than 24 hours are deleted by the use cases whenever
-- exports are saved or listed, so there is no updated_at and no deleted_at. Not a synced
-- entity: devices never pull it. form_id is ON DELETE SET NULL so an export outlives a deleted
-- form (the form delete offers "Export it first"). No row-level security, as everywhere:
-- authorization is in the use-case layer (SPEC-FINAL 7.4).

create table public.form_exports (
  id          uuid primary key,
  form_id     uuid references public.forms(id) on delete set null,
  label       text not null,                      -- e.g. 'Match form 2026 · draft v4'
  definition  jsonb not null,                     -- exactly what exportForm returns
  created_by  uuid not null references public.users(id),
  created_at  timestamptz not null default now()
);
-- The 24-hour purge deletes by created_at.
create index form_exports_created_at_idx on public.form_exports (created_at);

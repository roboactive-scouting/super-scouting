-- Migration — explicit Data API grants for the server's role (Supabase change of 2026-10-30).
--
-- From 2026-10-30 Supabase stops granting Data API access automatically to tables created
-- in "public". The server reaches every table through supabase-js with the service-role
-- key (apps/server/src/db/client.ts), so a table without a grant to service_role answers
-- "permission denied". The dev and production projects keep the grants they already have;
-- what breaks is a schema rebuilt from these migrations — a new project, `supabase db
-- reset`, a preview branch — where none of the earlier migrations granted anything.
--
-- service_role only: the client never talks to the Data API (all traffic goes through the
-- server, SPEC-FINAL §15), so anon and authenticated need nothing. On the existing
-- projects this is a no-op. Every later migration that creates a table grants it in the
-- same file (BUILD-CONTEXT §7).

grant select, insert, update, delete on all tables in schema public to service_role;

-- Migration — hard delete of a match together with its entries (SPEC-FINAL 3.9, v1.47; task 1.60).
--
-- SPEC-FINAL 3.9: a match with entries cannot be deleted on its own
-- (scouting_entries.match_id is ON DELETE RESTRICT), but an admin may delete it TOGETHER
-- with its entries — every row naming the match, soft-deleted ones included, since a
-- soft-deleted entry keeps its row and so still holds the key. Entries first, then the
-- match. One function call is one transaction: an entry that arrives between the two
-- statements makes the match delete fail with 23503 and rolls the entry delete back too,
-- so it is all or nothing. The match's slots go by their own ON DELETE CASCADE, and the
-- match_deletions tombstone is written by the existing AFTER DELETE trigger (UF.1,
-- migration 20261008090000). The use case checks the role and the typed label first.
--
-- Answers how many entry rows went, for the use case's reply.

create or replace function public.delete_match_cascade(p_match_id uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_entries integer;
begin
  delete from public.scouting_entries where match_id = p_match_id;
  get diagnostics v_entries = row_count;
  delete from public.matches where id = p_match_id;
  return v_entries;
end $$;

-- Only the server (service role) calls this. Authorization lives in the use-case layer
-- (no RLS, SPEC-FINAL 7.4), so nothing else may reach it through the Data API.
revoke execute on function public.delete_match_cascade(uuid) from public, anon, authenticated;
grant execute on function public.delete_match_cascade(uuid) to service_role;

-- Migration — who last saved a form version (SPEC-FINAL 3.3, amended v1.21; task 1.27).
--
-- The forms list (/admin/forms) shows "last edited · who" per version. Every form use case
-- that writes a version stamps it with the caller (and the set_updated_at trigger bumps
-- updated_at). Nullable: versions saved before this migration have no recorded author.
-- No ON DELETE action: a user is never deleted, only disabled (SPEC-FINAL 3.2).

alter table public.form_versions add column updated_by uuid references public.users(id);

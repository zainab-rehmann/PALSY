-- PALSY migration 006 — personal chat wallpaper (2026-11-12).
-- Each user picks their own chat wallpaper; stored on their profile row.
-- Value is a preset id (e.g. 'hearts'), a custom uploaded image URL, or
-- 'default'. No policy changes needed: profiles_update_own already lets a
-- user update their own row, and profiles_select is open to authenticated
-- users. Idempotent: safe to run more than once.
alter table public.profiles
  add column if not exists wallpaper text not null default 'default';

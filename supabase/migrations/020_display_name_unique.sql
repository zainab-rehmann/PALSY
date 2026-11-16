-- 020: display names must be unique per person (case-insensitive), like usernames.
--
-- Zainab's rule: one person has only one name, one name belongs to only one
-- person, so searching by name finds exactly the right person. Usernames
-- were already unique; display_name (the name shown everywhere and matched
-- by Find search) had no constraint at all.
--
-- Audit 2026-11-16 (before applying): 6 profiles, no duplicate display
-- names (case-insensitive, trimmed), none blank — so this index builds
-- cleanly and NO existing account is touched or renamed.
--
-- Partial unique index: blank names ('') stay allowed, because the UI falls
-- back to showing the username when no display name is set. Trimming in the
-- expression matches the app, which trims before saving and checking.

create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(btrim(display_name)))
  where btrim(display_name) <> '';

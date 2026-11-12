-- PALSY migration 011: account privacy switch
-- Applied: 2026-11-12 (via Supabase SQL Editor)
-- Adds profiles.is_private (default false = Public). Existing and new accounts
-- stay Public until the user switches to Private in Settings > Account.
-- Discovery is NOT affected: the Friends Find tab and search show every
-- account either way. Privacy only controls who sees profile details (bio):
-- private accounts show their bio to friends only; strangers see the basic
-- card plus a "This account is private" note. Enforced in the app UI.
alter table public.profiles
  add column if not exists is_private boolean not null default false;

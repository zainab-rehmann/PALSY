-- PALSY migration 005 (2026-11-12): live presence (online / last seen)
-- The app already stores is_online + last_seen on profiles, and the
-- PresenceManager heartbeat keeps them fresh. This only adds profiles
-- to the realtime publication so friends' online / last-seen status
-- updates live in DMs, the messages list, and the friends list.
-- No columns, no policy changes. Safe to re-run.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

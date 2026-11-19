-- 027_birthday.sql — Birthday magic: optional birthday on profiles.
-- A nullable date; friends can already read profiles (same scope as
-- the bio), so no new RLS is needed — profiles are readable by
-- authenticated users. The app compares month+day in local time
-- (src/lib/birthday.ts) and shows a cake badge + banner on the day.
-- No data is changed: every existing row keeps birthday NULL until
-- the user sets one in Settings → Profile.
alter table public.profiles add column if not exists birthday date;

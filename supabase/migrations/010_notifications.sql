-- PALSY migration 010 — notifications center support (2026-11-12).
-- 1) Per-user browser pop-up switch (Settings toggle). The in-app bell
--    keeps listing everything; this flag only gates the pop-ups.
-- 2) notifications table joins the realtime publication so the bell
--    badge and list update live. Guarded: safe to run more than once.
alter table public.profiles add column if not exists notifications_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end
$$;

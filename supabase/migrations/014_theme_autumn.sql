-- PALSY migration 014 — allow the 'autumn' dark theme (2026-11-14).
-- The profiles.theme check constraint only allowed 'blue' and 'pink'.
-- This replaces it (whatever its current name is) with one that also
-- allows 'autumn'. No data changes: every existing value stays valid.
-- Idempotent: safe to run more than once.
do $$
declare v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%theme%';
  if v_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_theme_check check (theme in ('blue', 'pink', 'autumn'));

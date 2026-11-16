-- 021: let the SIGNED-OUT signup page check name availability safely.
--
-- Problem (proven live 2026-11-16): profiles can only be read by signed-in
-- users (RLS), so the signup page's live availability check — running
-- signed-out — always saw empty results and reported every name
-- "available", including taken ones. The submit-time check was blind the
-- same way; only the database unique rule caught duplicates, with a raw
-- unfriendly error.
--
-- Fix WITHOUT touching any RLS policy (the order forbade RLS changes):
-- a SECURITY DEFINER function that answers true/false only, revealing no
-- rows — the same pattern as the locker and entry-code checks. Granted to
-- anon (signup visitors) and authenticated. It reveals nothing beyond
-- what attempting to register would reveal.
--
-- The display-name comparison mirrors index 020 exactly:
-- lower(btrim(display_name)).

create or replace function public.check_signup_name(p_username text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := lower(btrim(coalesce(p_username, '')));
  d text := lower(btrim(coalesce(p_display_name, '')));
begin
  return jsonb_build_object(
    'username_taken', (u <> '' and exists (select 1 from public.profiles where lower(username) = u)),
    'name_taken', (d <> '' and exists (select 1 from public.profiles where lower(btrim(display_name)) = d))
  );
end;
$$;

grant execute on function public.check_signup_name(text, text) to anon, authenticated;

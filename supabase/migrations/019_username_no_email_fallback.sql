-- 019: never derive a username (or display name) from the email address.
--
-- The old handle_new_user fell back to split_part(new.email, '@', 1) when
-- signup metadata had no username, so any metadata-less signup (dashboard
-- user, direct API call, future OAuth) got an email-derived username.
-- COALESCE also missed EMPTY metadata ('') — it only catches NULL.
--
-- New rule: use the metadata username when it is present and non-blank
-- (the signup form requires the user to type their own). Otherwise use a
-- generated handle ('palsy_' + 8 random hex chars, looped until unique) —
-- never anything from the email. Display name falls back to the chosen
-- username, never the email.
--
-- Existing accounts are UNTOUCHED: CREATE OR REPLACE only changes what
-- future inserts do. No rows are updated, no RLS policies change.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen text;
  disp text;
  candidate text;
begin
  chosen := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if chosen is null then
    loop
      candidate := 'palsy_' || substr(md5(random()::text), 1, 8);
      exit when not exists (select 1 from public.profiles where username = candidate);
    end loop;
    chosen := candidate;
  end if;
  disp := nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  if disp is null then disp := chosen; end if;
  insert into public.profiles (id, email, username, display_name, theme)
  values (
    new.id,
    new.email,
    chosen,
    disp,
    coalesce(new.raw_user_meta_data->>'theme', 'blue')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

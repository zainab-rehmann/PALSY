-- 031_dm_chat_themes.sql — per-DM chat themes (2-week plan, Mon 2026-11-23:
-- Chat themes 1: theme engine + DM themes). Instagram-style: each DM has
-- ONE shared theme; either participant can change it and both see it
-- instantly. The theme sets the chat background + own-bubble colour +
-- accent together (see src/lib/chatThemes.ts).
--
-- Storage: one row per DM, keyed by the app's existing dm_key
-- ('dm:<uuid>:<uuid>', the two participant ids sorted). There is no
-- dm_conversations table — DMs are messages scoped by dm_key — so the
-- theme lives in its own tiny table.
--
-- Security: RLS is on. Participants may SELECT their own DM's row (so the
-- app can read the theme and realtime can deliver it). There are NO
-- insert/update/delete policies on purpose: writes go ONLY through the
-- SECURITY DEFINER function below, which checks the caller is one of the
-- two ids in the key and that the theme id is one the app knows. A
-- non-participant (or a bad theme id / malformed key) gets false and
-- nothing is written.
--
-- Realtime: the table is added to the supabase_realtime publication so a
-- theme change reaches the other participant live, like messages do.

create table if not exists public.dm_chat_themes (
  dm_key text primary key,
  theme text not null default 'default',
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.dm_chat_themes enable row level security;

create policy dm_chat_themes_select on public.dm_chat_themes
  for select
  using (
    auth.uid()::text in (
      split_part(dm_key, ':', 2),
      split_part(dm_key, ':', 3)
    )
  );

create or replace function public.set_dm_chat_theme(
  p_dm_key text,
  p_theme text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'default', 'love', 'ocean', 'sunset', 'forest', 'midnight', 'lavender'
  ];
begin
  -- Key must be exactly dm:<uuid>:<uuid>.
  if p_dm_key is null or p_dm_key !~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    return false;
  end if;

  -- Caller must be one of the two participants in the key.
  if not (auth.uid()::text in (
    split_part(p_dm_key, ':', 2),
    split_part(p_dm_key, ':', 3)
  )) then
    return false;
  end if;

  -- Theme must be one the app knows.
  if p_theme is null or not (p_theme = any (v_allowed)) then
    return false;
  end if;

  insert into public.dm_chat_themes (dm_key, theme, updated_by, updated_at)
  values (p_dm_key, p_theme, auth.uid(), now())
  on conflict (dm_key) do update
    set theme = excluded.theme,
        updated_by = excluded.updated_by,
        updated_at = now();
  return true;
end;
$$;

grant execute on function public.set_dm_chat_theme(text, text) to authenticated;

alter publication supabase_realtime add table public.dm_chat_themes;

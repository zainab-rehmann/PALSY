-- 033_room_chat_themes.sql — per-room chat themes (2-week plan, Tue 2026-11-24:
-- Chat themes 2: room themes + gradient gallery). Instagram-style: each room
-- has ONE shared gradient theme; any member can change it and all members
-- see it instantly. The theme sets the chat background + own-bubble colour +
-- accent together (see src/lib/chatThemes.ts — the same 7 themes as DMs).
--
-- Storage: a column on the rooms row itself (rooms already has a
-- theme preset / accent / picture, changed by any member via
-- update_room_appearance, migration 017). 'default' means no chat theme:
-- the solid preset + personal wallpaper show, as before.
--
-- Security: the rooms UPDATE policy is owner-only, so members change the
-- theme through the SECURITY DEFINER function below, which checks the
-- caller owns the room or is a member of it, and that the theme id is one
-- the app knows. A non-member (or a bad theme id) gets false and nothing
-- is written. No other column can be touched through it.
--
-- Realtime: the rooms table is added to the supabase_realtime publication
-- (guarded — no error if it is already there) so a theme change reaches
-- every open room view live; the room page subscribes to UPDATEs on its
-- own room id. This also makes solid-preset and room-picture changes
-- arrive live for everyone (previously they needed a reload).

alter table public.rooms
  add column if not exists chat_theme text not null default 'default';

create or replace function public.set_room_chat_theme(
  p_room_id uuid,
  p_chat_theme text
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
  v_is_member boolean;
begin
  -- Caller must own the room or be a member of it.
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id and r.owner_id = auth.uid()
  ) or exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then
    return false;
  end if;

  -- Theme must be one the app knows.
  if p_chat_theme is null or not (p_chat_theme = any (v_allowed)) then
    return false;
  end if;

  update public.rooms
  set chat_theme = p_chat_theme
  where id = p_room_id;
  return found;
end;
$$;

grant execute on function public.set_room_chat_theme(uuid, text) to authenticated;

-- Realtime for the rooms table (guarded: a second run is a no-op).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

-- 017_room_appearance.sql — room theme + picture changeable by ANY member
-- (scheduled Mon 2026-11-16, weekly plan). Entry codes, member
-- management and clear-chat stay owner/moderator-only (unchanged).
--
-- The rooms UPDATE policy is owner-only, so members change appearance
-- through this SECURITY DEFINER function, which checks membership first
-- and updates ONLY preset / accent_color / avatar_url. No other column
-- can be touched through it, and the values are validated:
--   preset       must be one of the app's six theme presets
--   accent_color must be a #RRGGBB hex code
--   avatar_url   must be a public URL from this project's media bucket
-- A null argument leaves that column untouched.

create or replace function public.update_room_appearance(
  p_room_id uuid,
  p_preset text default null,
  p_accent_color text default null,
  p_avatar_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
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

  if p_preset is not null and p_preset not in (
    'cloudy-blue', 'strawberry-milk', 'lavender-dreams',
    'peachy', 'minty-fresh', 'cotton-candy'
  ) then
    return false;
  end if;

  if p_accent_color is not null and p_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
    return false;
  end if;

  if p_avatar_url is not null and p_avatar_url not like 'https://ygzanokycmuuoqawaqmo.supabase.co/storage/v1/object/public/media/%' then
    return false;
  end if;

  update public.rooms
  set preset = coalesce(p_preset, preset),
      accent_color = coalesce(p_accent_color, accent_color),
      avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = p_room_id;
  return found;
end;
$$;

grant execute on function public.update_room_appearance(uuid, text, text, text) to authenticated;

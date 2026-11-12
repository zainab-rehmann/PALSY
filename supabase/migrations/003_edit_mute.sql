-- PALSY migration 003 (2026-11-10): message editing + per-room notification mute
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.room_members add column if not exists muted boolean not null default false;

-- Members must be able to update their OWN membership row (the mute toggle).
drop policy if exists "room_members_update_own" on public.room_members;
create policy "room_members_update_own" on public.room_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

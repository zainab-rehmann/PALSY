-- 032_message_delete_for_me.sql — WhatsApp-style deletion (2026-11-23).
-- Per-user "delete for me": a marker row hides a message for one user only.
-- Delete-for-everyone stays on messages.is_deleted (placeholder renders).
-- Writes go through SECURITY DEFINER RPCs so room owner/moderator rules
-- are enforced server-side (messages_update_own only allows the sender).

create table if not exists public.message_deletions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_deletions enable row level security;

create policy message_deletions_select on public.message_deletions
  for select to authenticated using (user_id = auth.uid());
create policy message_deletions_insert on public.message_deletions
  for insert to authenticated with check (user_id = auth.uid());
create policy message_deletions_delete on public.message_deletions
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.delete_message_for_me(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg record;
begin
  if p_message_id is null then return false; end if;
  select sender_id, receiver_id, room_id into v_msg
    from public.messages where id = p_message_id;
  if not found then return false; end if;
  if v_msg.room_id is not null then
    if not exists (select 1 from public.room_members
      where room_id = v_msg.room_id and user_id = auth.uid()) then
      return false;
    end if;
  elsif not (auth.uid() in (v_msg.sender_id, v_msg.receiver_id)) then
    return false;
  end if;
  insert into public.message_deletions (message_id, user_id)
    values (p_message_id, auth.uid())
    on conflict (message_id, user_id) do nothing;
  return true;
end;
$$;
grant execute on function public.delete_message_for_me(uuid) to authenticated;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg record;
  v_role text;
begin
  if p_message_id is null then return false; end if;
  select sender_id, receiver_id, room_id into v_msg
    from public.messages where id = p_message_id;
  if not found then return false; end if;
  if auth.uid() = v_msg.sender_id then
    null; -- sender: allowed
  elsif v_msg.room_id is not null then
    select role into v_role from public.room_members
      where room_id = v_msg.room_id and user_id = auth.uid();
    if v_role is null or v_role not in ('owner', 'moderator') then
      return false;
    end if;
  else
    return false;
  end if;
  update public.messages
    set is_deleted = true, content = null
    where id = p_message_id;
  return true;
end;
$$;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;

alter publication supabase_realtime add table public.message_deletions;

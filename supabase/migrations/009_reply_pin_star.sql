-- PALSY migration 009 — reply / pin / star (2026-11-12).
-- Reply: messages.reply_to_id is a plain uuid with NO foreign key on
-- purpose — when the original message is hard-deleted, the id dangles
-- and the app renders the quote as "Message deleted" instead of
-- breaking. (A set-null FK would erase the fact it was a reply.)
-- Pin: shared per conversation, is_pinned + pinned_at on messages.
-- Only the SECURITY DEFINER function below may change pin state from
-- the app, so room pin permissions (owner/moderator) are enforced
-- server-side; the function touches only the two pin columns.
-- Star: private per user in message_stars, RLS limited to your own
-- rows; star rows cascade away when the message is deleted.
-- Idempotent: safe to run more than once.
alter table public.messages add column if not exists reply_to_id uuid;
create index if not exists messages_reply_to_id_idx on public.messages (reply_to_id);

alter table public.messages add column if not exists is_pinned boolean not null default false;
alter table public.messages add column if not exists pinned_at timestamptz;
create index if not exists messages_pinned_idx on public.messages (is_pinned, pinned_at desc);

create table if not exists public.message_stars (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.message_stars enable row level security;

drop policy if exists "stars_select_own" on public.message_stars;
create policy "stars_select_own" on public.message_stars
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "stars_insert_own" on public.message_stars;
create policy "stars_insert_own" on public.message_stars
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "stars_delete_own" on public.message_stars;
create policy "stars_delete_own" on public.message_stars
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.set_message_pinned(p_message_id uuid, p_pin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_msg record;
declare v_role text;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if not found then raise exception 'message not found'; end if;
  if v_msg.room_id is not null then
    select role into v_role from public.room_members
      where room_id = v_msg.room_id and user_id = auth.uid();
    if v_role is null or v_role not in ('owner', 'moderator') then
      raise exception 'only room owners and moderators can pin messages';
    end if;
  else
    if v_msg.sender_id <> auth.uid() and v_msg.receiver_id <> auth.uid() then
      raise exception 'not a participant of this chat';
    end if;
  end if;
  update public.messages
    set is_pinned = p_pin,
        pinned_at = case when p_pin then now() else null end
    where id = p_message_id;
end;
$$;

revoke execute on function public.set_message_pinned(uuid, boolean) from public;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

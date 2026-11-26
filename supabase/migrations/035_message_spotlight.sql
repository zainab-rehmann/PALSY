-- PALSY migration 035 — Spotlight highlights (2026-11-26, 2-week plan Day 5).
-- A highlight is SHARED per chat (unlike a private star): anyone in the
-- conversation can highlight a message and everyone sees it — the bubble
-- gets a gradient frame and the message joins the Highlights strip at the
-- top of the chat. Tap a highlight jumps to the message; un-highlight
-- removes it for everyone.
-- Mirrors the pin columns + RPC from migration 009, except rooms allow
-- ANY member to highlight (pins stay owner/moderator-only). Only the
-- SECURITY DEFINER function below may change highlight state from the
-- app; it touches only the two highlight columns. Deleted messages never
-- show in the strip (the app filters is_deleted on the strip query).
-- Idempotent: safe to run more than once.
alter table public.messages add column if not exists is_highlighted boolean not null default false;
alter table public.messages add column if not exists highlighted_at timestamptz;
create index if not exists messages_highlighted_idx on public.messages (is_highlighted, highlighted_at desc);

create or replace function public.set_message_highlighted(p_message_id uuid, p_highlight boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_msg record;
declare v_member boolean;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if not found then raise exception 'message not found'; end if;
  if v_msg.room_id is not null then
    select exists (
      select 1 from public.room_members
      where room_id = v_msg.room_id and user_id = auth.uid()
    ) into v_member;
    if not v_member then
      raise exception 'not a member of this room';
    end if;
  else
    if v_msg.sender_id <> auth.uid() and v_msg.receiver_id <> auth.uid() then
      raise exception 'not a participant of this chat';
    end if;
  end if;
  update public.messages
    set is_highlighted = p_highlight,
        highlighted_at = case when p_highlight then now() else null end
    where id = p_message_id;
end;
$$;

revoke execute on function public.set_message_highlighted(uuid, boolean) from public;
grant execute on function public.set_message_highlighted(uuid, boolean) to authenticated;

-- PALSY migration 015: per-member delivery/read receipts for room messages.
-- Powers WhatsApp-group-style ticks in room chat: single grey tick = sent,
-- grey double tick = delivered to every other current member, blue double
-- tick + "Seen" = every other current member has read it.
-- One row per (message, member). A member who joins later has no rows, so
-- ticks stay grey for them until they open the room. No change to the
-- messages table or to the messages_select policy.

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists message_receipts_room_idx
  on public.message_receipts (room_id);

alter table public.message_receipts enable row level security;

-- Senders must be able to read other members' receipt rows to compute
-- "all seen"; rows carry no message content, only ids and timestamps.
create policy message_receipts_select on public.message_receipts
  for select to authenticated using (true);

-- A member writes only their own receipt rows.
create policy message_receipts_insert_own on public.message_receipts
  for insert to authenticated with check (user_id = auth.uid());

create policy message_receipts_update_own on public.message_receipts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy message_receipts_delete_own on public.message_receipts
  for delete to authenticated using (user_id = auth.uid());

-- Live tick updates for senders.
alter publication supabase_realtime add table public.message_receipts;

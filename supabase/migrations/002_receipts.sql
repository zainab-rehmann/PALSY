-- PALSY migration 002 (2026-11-10): WhatsApp-style message acknowledgments
-- delivered_at = the message reached the receiver's app
-- read_at      = the receiver opened the chat and saw it
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;

-- The receiver must be able to stamp delivered/read on messages sent TO them
-- (the original schema only let senders update their own messages).
drop policy if exists "messages_mark_received" on public.messages;
create policy "messages_mark_received" on public.messages
  for update to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

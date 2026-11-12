-- PALSY migration 007 — conversation delete (2026-11-12).
-- Lets every participant of a conversation delete its messages, so
-- "clear chat" and multi-select delete work for everyone in the chat.
-- Previously only the sender could delete (messages_delete_own), so a
-- user could never clear messages the other person sent. Policies are
-- permissive and combine with OR; this only ADDS delete rights for
-- participants of that conversation (DM receiver, or room members).
-- Hard deletes cascade to reactions (message_reactions.message_id has
-- ON DELETE CASCADE). Idempotent: safe to run more than once.
drop policy if exists "messages_delete_conversation" on public.messages;
create policy "messages_delete_conversation" on public.messages
  for delete to authenticated
  using (
    sender_id = auth.uid()
    or receiver_id = auth.uid()
    or exists (
      select 1 from public.room_members m
      where m.room_id = messages.room_id and m.user_id = auth.uid()
    )
  );

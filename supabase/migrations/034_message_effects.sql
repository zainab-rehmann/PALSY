-- 034_message_effects.sql — message effects + magic words (2-week plan,
-- Wed 2026-11-25: Message effects + magic words). The sender picks an
-- effect in the composer (or a magic word in the text picks one
-- automatically) and the effect id is stored on the message row, so both
-- sides see the same animated bubble — the sender on send, the receiver when the
-- message arrives live (see src/lib/messageEffects.ts).
--
-- Storage: one nullable text column on messages. The CHECK keeps it to
-- the four effects the app knows; null means "no effect" and behaves
-- exactly as before. No policy changes: messages_select is already
-- permissive and messages_insert already lets the sender insert their
-- own rows, so the new column flows through both. No realtime change:
-- messages is already in the supabase_realtime publication.

alter table public.messages
  add column if not exists effect text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_effect_check'
  ) then
    alter table public.messages
      add constraint messages_effect_check
      check (effect is null or effect in ('confetti', 'hearts', 'fire', 'stars'));
  end if;
end $$;

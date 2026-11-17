-- 023_reactions_realtime.sql
-- Reactions arrive live in DMs and rooms: message_reactions must be in
-- the supabase_realtime publication, otherwise postgres_changes
-- subscriptions on the table receive nothing and the other side only
-- sees a reaction after a reload. Idempotent: only adds it when missing.
-- RLS is unchanged (SELECT using (true) already lets everyone see
-- reactions; INSERT/DELETE stay own-row only).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end $$;

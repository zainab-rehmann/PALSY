-- 025_polls.sql — Polls in rooms + DMs (WhatsApp-style).
-- A poll is a message with type 'poll': poll_data holds
-- {question, options: string[]} and one row per voter lives in
-- poll_votes (one vote per user per poll; changeable, removable).
-- RLS mirrors message_reactions: anyone can read votes, only the
-- voter can write their own. poll_votes joins the realtime
-- publication so vote counts arrive live, and REPLICA IDENTITY FULL
-- so DELETE events carry message_id (same lesson as migration 024).

-- 1. Messages can carry poll data.
alter table public.messages add column if not exists poll_data jsonb;

-- 2. Allow type 'poll': drop any existing type CHECK on messages
-- (its auto-generated name varies) and re-add it with an explicit
-- name including 'poll'. Re-runnable: the drop loop removes the
-- constraint added by a previous run too, then it is re-added.
do $$
declare cname text;
begin
  for cname in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%type%'
  loop
    execute format('alter table public.messages drop constraint %I', cname);
  end loop;
end $$;
alter table public.messages
  add constraint messages_type_check
  check (type in ('text','image','video','audio','file','voice','poll'));

-- 3. Votes table.
create table if not exists public.poll_votes (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id)
);
create index if not exists idx_poll_votes_message on public.poll_votes(message_id);

alter table public.poll_votes enable row level security;
drop policy if exists "Users can view poll votes" on public.poll_votes;
create policy "Users can view poll votes" on public.poll_votes for select using (true);
drop policy if exists "Users can vote in polls" on public.poll_votes;
create policy "Users can vote in polls" on public.poll_votes for insert with check (auth.uid() = user_id);
drop policy if exists "Users can change own vote" on public.poll_votes;
create policy "Users can change own vote" on public.poll_votes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can remove own vote" on public.poll_votes;
create policy "Users can remove own vote" on public.poll_votes for delete using (auth.uid() = user_id);

-- 4. Live vote counts.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes'
  ) then
    execute 'alter publication supabase_realtime add table public.poll_votes';
  end if;
end $$;

-- 5. Full old rows on DELETE so live handlers learn the message_id.
alter table public.poll_votes replica identity full;

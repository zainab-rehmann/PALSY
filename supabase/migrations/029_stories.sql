-- 029_stories.sql — Stories: 24-hour photo/video status updates.
-- A story is one media item (image or video in the `media` bucket)
-- with an optional caption, visible for 24 hours after posting.
-- VISIBILITY (app-enforced, same approach as the app's existing
-- permissive reads): SELECT is open to any signed-in user, but the
-- app only ever queries stories whose owner is me or one of my
-- friends (friendships), and only where expires_at > now(). A
-- stranger's story id is never queried, so it never renders.
-- Writes are locked down: only the owner can insert (their own
-- user_id) or delete their own stories. No update policy: a story
-- is never edited, only deleted and re-posted.
-- Realtime + REPLICA IDENTITY FULL follow migrations 023/025 so
-- new/deleted stories can arrive live and DELETEs carry the id.

create table if not exists public.stories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_stories_user on public.stories(user_id);
create index if not exists idx_stories_expires on public.stories(expires_at);

alter table public.stories enable row level security;
drop policy if exists "Users can view stories" on public.stories;
create policy "Users can view stories" on public.stories for select using (auth.role() = 'authenticated');
drop policy if exists "Users can post own story" on public.stories;
create policy "Users can post own story" on public.stories for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own story" on public.stories;
create policy "Users can delete own story" on public.stories for delete using (auth.uid() = user_id);

-- Live arrival of new stories (same lesson as migrations 023/025).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories'
  ) then
    execute 'alter publication supabase_realtime add table public.stories';
  end if;
end $$;

-- Full old rows on DELETE so live handlers learn the story id.
alter table public.stories replica identity full;

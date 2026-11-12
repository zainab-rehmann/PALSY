-- ============================================================
-- PALSY (Next.js app) — full database schema, 2026-11-10
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Built from the app's own TypeScript types + every query in
-- the code, following the patterns of her original Stage-2
-- schema.sql (profiles trigger + RLS), extended to all tables
-- the current app uses: profiles, rooms, room_members,
-- messages, message_reactions, friendships, friend_requests,
-- notifications, games, game_players + media storage policies
-- + realtime for messages + backfill for existing auth users.
-- ============================================================

-- ---------- 1. TABLES ----------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  username     text not null unique,
  display_name text not null default '',
  bio          text,
  avatar_url   text,
  theme        text not null default 'blue' check (theme in ('blue','pink')),
  is_online    boolean not null default false,
  last_seen    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  avatar_url      text,
  cover_url       text,
  wallpaper       text,
  accent_color    text,
  preset          text,
  is_private      boolean not null default false,
  invite_code     text not null unique default upper(substr(md5(random()::text), 1, 6)),
  max_members     integer not null default 50,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  welcome_message text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid references public.rooms(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid references public.profiles(id) on delete cascade,
  content     text,
  media_url   text,
  type        text not null default 'text' check (type in ('text','image','video','audio','file','voice')),
  is_deleted  boolean not null default false,
  reply_to    uuid references public.messages(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  friend_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at  timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  type       text not null,
  status     text not null default 'waiting' check (status in ('waiting','active','finished')),
  state      jsonb not null default '{}'::jsonb,
  winner_id  uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  score     integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

-- ---------- 2. AUTO-CREATE PROFILE ON SIGNUP ----------
-- Uses the username / display_name / theme the signup form
-- saves into the user's metadata.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, display_name, theme)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name',
             new.raw_user_meta_data->>'username',
             split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'theme', 'blue')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. ROW LEVEL SECURITY ----------

alter table public.profiles         enable row level security;
alter table public.rooms            enable row level security;
alter table public.room_members     enable row level security;
alter table public.messages         enable row level security;
alter table public.message_reactions enable row level security;
alter table public.friendships      enable row level security;
alter table public.friend_requests  enable row level security;
alter table public.notifications    enable row level security;
alter table public.games            enable row level security;
alter table public.game_players     enable row level security;

-- profiles: readable by signed-in users, editable only by the owner
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- rooms
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select to authenticated using (true);
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "rooms_update_own" on public.rooms;
create policy "rooms_update_own" on public.rooms
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "rooms_delete_own" on public.rooms;
create policy "rooms_delete_own" on public.rooms
  for delete to authenticated using (owner_id = auth.uid());

-- room_members
drop policy if exists "room_members_select" on public.room_members;
create policy "room_members_select" on public.room_members
  for select to authenticated using (true);
drop policy if exists "room_members_insert" on public.room_members;
create policy "room_members_insert" on public.room_members
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "room_members_delete" on public.room_members;
create policy "room_members_delete" on public.room_members
  for delete to authenticated using (user_id = auth.uid());

-- messages
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated using (true);
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages
  for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- message_reactions
drop policy if exists "reactions_select" on public.message_reactions;
create policy "reactions_select" on public.message_reactions
  for select to authenticated using (true);
drop policy if exists "reactions_insert" on public.message_reactions;
create policy "reactions_insert" on public.message_reactions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reactions_delete" on public.message_reactions;
create policy "reactions_delete" on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

-- friendships (accepting a request inserts both directions from one client)
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select" on public.friendships
  for select to authenticated using (true);
drop policy if exists "friendships_insert" on public.friendships;
create policy "friendships_insert" on public.friendships
  for insert to authenticated with check (user_id = auth.uid() or friend_id = auth.uid());
drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete" on public.friendships
  for delete to authenticated using (user_id = auth.uid() or friend_id = auth.uid());

-- friend_requests
drop policy if exists "friend_requests_select" on public.friend_requests;
create policy "friend_requests_select" on public.friend_requests
  for select to authenticated using (true);
drop policy if exists "friend_requests_insert" on public.friend_requests;
create policy "friend_requests_insert" on public.friend_requests
  for insert to authenticated with check (sender_id = auth.uid());
drop policy if exists "friend_requests_update" on public.friend_requests;
create policy "friend_requests_update" on public.friend_requests
  for update to authenticated using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());
drop policy if exists "friend_requests_delete" on public.friend_requests;
create policy "friend_requests_delete" on public.friend_requests
  for delete to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());

-- notifications (you read your own; friends can create them for you)
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert to authenticated with check (true);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- games + players (shared game state: players update the game row together)
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games
  for select to authenticated using (true);
drop policy if exists "games_insert" on public.games;
create policy "games_insert" on public.games
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "games_update" on public.games;
create policy "games_update" on public.games
  for update to authenticated using (true) with check (true);
drop policy if exists "game_players_select" on public.game_players;
create policy "game_players_select" on public.game_players
  for select to authenticated using (true);
drop policy if exists "game_players_insert" on public.game_players;
create policy "game_players_insert" on public.game_players
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "game_players_update" on public.game_players;
create policy "game_players_update" on public.game_players
  for update to authenticated using (true) with check (true);

-- ---------- 4. MEDIA STORAGE POLICIES ----------
-- The 'media' bucket already exists (created in the dashboard, public).
-- App uploads to media/<user-id>/... so the first folder must be your id.

drop policy if exists "Media is viewable by everyone" on storage.objects;
create policy "Media is viewable by everyone"
  on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "Users upload their own media" on storage.objects;
create policy "Users upload their own media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own media" on storage.objects;
create policy "Users update their own media"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own media" on storage.objects;
create policy "Users delete their own media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 5. REALTIME (live chat) ----------

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------- 6. BACKFILL PROFILES FOR EXISTING USERS ----------
-- The 10 accounts created before this schema existed get a
-- profile row each, using their saved signup metadata.

do $$
declare
  u record;
  uname text;
begin
  for u in select * from auth.users loop
    uname := left(coalesce(u.raw_user_meta_data->>'username', split_part(u.email, '@', 1)), 20);
    if exists (select 1 from public.profiles where username = uname and id <> u.id) then
      uname := left(uname, 14) || '_' || substr(md5(u.id::text), 1, 5);
    end if;
    begin
      insert into public.profiles (id, email, username, display_name, theme)
      values (
        u.id,
        u.email,
        uname,
        coalesce(u.raw_user_meta_data->>'display_name',
                 u.raw_user_meta_data->>'username',
                 split_part(u.email, '@', 1)),
        coalesce(u.raw_user_meta_data->>'theme', 'blue')
      )
      on conflict (id) do nothing;
    exception when unique_violation then
      null; -- skip a clashing username; that user can be fixed by hand
    end;
  end loop;
end $$;

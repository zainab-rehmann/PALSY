-- ============================================================
-- PALSY — Complete Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT,
  avatar_url TEXT,
  theme TEXT NOT NULL DEFAULT 'blue' CHECK (theme IN ('blue','pink')),
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, display_name, theme)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'theme', 'blue')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- 2. FRIEND REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own requests" ON public.friend_requests FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send requests" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Receivers can update status" ON public.friend_requests FOR UPDATE USING (auth.uid() = receiver_id);
CREATE POLICY "Users can delete own requests" ON public.friend_requests FOR DELETE USING (auth.uid() = sender_id);

-- ============================================================
-- 3. FRIENDSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own friendships" ON public.friendships FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can insert friendships" ON public.friendships FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "Users can delete friendships" ON public.friendships FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ============================================================
-- 4. ROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  wallpaper TEXT,
  accent_color TEXT,
  preset TEXT,
  is_private BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT upper(substring(md5(random()::text),1,8)),
  max_members INT NOT NULL DEFAULT 50,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  welcome_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public rooms are viewable" ON public.rooms FOR SELECT USING (NOT is_private OR owner_id = auth.uid() OR id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated can create rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update rooms" ON public.rooms FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete rooms" ON public.rooms FOR DELETE USING (auth.uid() = owner_id);

-- ============================================================
-- 5. ROOM MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view room membership" ON public.room_members FOR SELECT USING (user_id = auth.uid() OR room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can join" ON public.room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave" ON public.room_members FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Owners can remove members" ON public.room_members FOR DELETE USING (room_id IN (SELECT id FROM public.rooms WHERE owner_id = auth.uid()));

-- ============================================================
-- 6. MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','audio','file','voice')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  reply_to UUID REFERENCES public.messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT must_have_destination CHECK (room_id IS NOT NULL OR receiver_id IS NOT NULL)
);

CREATE INDEX idx_messages_room ON public.messages(room_id, created_at DESC);
CREATE INDEX idx_messages_dm ON public.messages(sender_id, receiver_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room members can read room messages" ON public.messages FOR SELECT USING (
  (room_id IS NOT NULL AND room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()))
  OR (receiver_id IS NOT NULL AND (auth.uid() = sender_id OR auth.uid() = receiver_id))
);
CREATE POLICY "Authenticated can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Senders can delete own messages" ON public.messages FOR UPDATE USING (auth.uid() = sender_id);

-- ============================================================
-- 7. MESSAGE REACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view reactions" ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 8. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- 9. GAMES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('tictactoe','number-guess','hangman','rps')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished')),
  state JSONB NOT NULL DEFAULT '{}',
  winner_id UUID REFERENCES public.profiles(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room members can view games" ON public.games FOR SELECT USING (room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()));
CREATE POLICY "Room members can create games" ON public.games FOR INSERT WITH CHECK (room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "Room members can update games" ON public.games FOR UPDATE USING (room_id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.game_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, user_id)
);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view game players" ON public.game_players FOR SELECT USING (true);
CREATE POLICY "Users can join games" ON public.game_players FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own player" ON public.game_players FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;


export type Theme = 'blue' | 'pink' | 'autumn';

export interface Profile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  theme: Theme;
  wallpaper: string | null;
  notifications_enabled: boolean;
  is_private: boolean;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string;
  friend?: Profile;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  wallpaper: string | null;
  accent_color: string | null;
  preset: string | null;
  is_private: boolean;
  invite_code: string;
  has_entry_code: boolean;
  max_members: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
  welcome_message: string | null;
  member_count?: number;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'owner' | 'moderator' | 'member';
  muted: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface Message {
  id: string;
  room_id: string | null;
  sender_id: string;
  receiver_id: string | null;
  content: string | null;
    media_url: string | null;
  delivered_at: string | null;
  read_at: string | null;
  edited_at: string | null;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice' | 'poll';
  // Polls (migration 025): {question, options: string[]}.
  poll_data?: { question: string; options: string[] } | null;
  poll_votes?: PollVote[];
  is_deleted: boolean;
  reply_to: string | null;
  reply_to_id: string | null;
  is_pinned: boolean;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reactions?: MessageReaction[];
  // Local-only: set when a send fails so the bubble can offer a retry.
  failed?: boolean;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// One vote in a poll (migration 025): one row per (poll, voter);
// changing a vote updates the row, tapping your vote again removes it.
export interface PollVote {
  id: string;
  message_id: string;
  user_id: string;
  option_index: number;
  created_at: string;
}

// Per-member delivery/read receipt for a ROOM message (migration 015).
// One row per (message, member): delivered_at when the member's open room
// view received the message, read_at when they actually had the chat in
// view. Ticks turn blue only when every other current member has read it.
export interface MessageReceipt {
  message_id: string;
  user_id: string;
  room_id: string;
  delivered_at: string;
  read_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'friend_request' | 'friend_accepted' | 'new_message' | 'room_invite' | 'game_invite' | 'game_result';
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export type GameType = 'tictactoe' | 'number-guess' | 'hangman' | 'rps' | 'draw-guess' | 'trivia' | 'dots-boxes' | 'crazy-eights' | 'wordle';
export type GameStatus = 'waiting' | 'active' | 'finished';

export interface Game {
  id: string;
  room_id: string | null;
  dm_key: string | null;
  type: GameType;
  status: GameStatus;
  state: Record<string, unknown>;
  winner_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  score: number;
  joined_at: string;
  profile?: Profile;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

export interface LockedChat {
  user_id: string;
  chat_type: 'dm' | 'room';
  target_id: string;
  locked_at: string;
}

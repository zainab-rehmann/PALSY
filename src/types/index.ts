export type Theme = 'blue' | 'pink';

export interface Profile {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  theme: Theme;
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
  joined_at: string;
  profile?: Profile;
}

export interface Message {
  id: string;
  room_id: string | null;
  sender_id: string;
  receiver_id: string | null;
  content: string | null;
  media_url?: string | null;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice';
  is_deleted: boolean;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
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

export type GameType = 'tictactoe' | 'number-guess' | 'hangman' | 'rps';
export type GameStatus = 'waiting' | 'active' | 'finished';

export interface Game {
  id: string;
  room_id: string;
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


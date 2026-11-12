// PALSY — notification rows + live pokes. Every helper is fire-and-forget
// safe: a notification failure must never break sending a message.
// Why the "poke": live database updates do not reach a user for rows
// someone else created for them (private-row quirk), so after writing a
// row we also send a tiny live broadcast on the recipient's own channel.
// The bell and the pop-up notifier listen for it and re-read their rows.
import type { Profile, Room, RoomMember } from '@/types';

type Sb = ReturnType<typeof import('@/lib/supabase/client').createClient>;

function displayName(p: Profile | null | undefined, fallback: string): string {
  return p?.display_name || p?.username || fallback;
}

export function messagePreview(type: string, content: string | null): string {
  if (type === 'image') return '📷 sent you a photo';
  if (type === 'video') return '🎥 sent you a video';
  if (type === 'audio' || type === 'voice') return '🎤 sent you a voice message';
  if (type === 'file') return `📎 sent a file${content ? `: ${content}` : ''}`;
  return (content || '').slice(0, 90) || 'sent you a message ♡';
}

// Nudge one user's bell + pop-ups to re-read their notification rows.
export async function pokeBell(supabase: Sb, userId: string): Promise<void> {
  try {
    const ch = supabase.channel(`bell-${userId}`);
    await new Promise<void>((resolve) => {
      ch.subscribe((status: string) => { if (status === 'SUBSCRIBED') resolve(); });
      setTimeout(resolve, 2000);
    });
    await ch.send({ type: 'broadcast', event: 'new-notification', payload: {} });
    setTimeout(() => { try { supabase.removeChannel(ch); } catch {} }, 600);
  } catch {}
}

// Write one notification row, replacing the previous unread row with the
// same dedupe key. The replace runs inside the push_notification function
// (migration 012): a sender cannot delete the recipient's rows directly
// (row security only allows deleting your own), so the function does the
// delete+insert atomically and only touches unread rows the caller created.
async function push(
  supabase: Sb,
  userId: string,
  type: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  await supabase.rpc('push_notification', {
    p_user_id: userId, p_type: type, p_title: title, p_body: body, p_data: data,
  });
}

// One unread "new message" row per sender — older unread rows from the
// same sender are replaced so the bell never fills with duplicates.
export async function notifyDM(
  supabase: Sb,
  sender: Profile,
  receiverId: string,
  type: string,
  content: string | null,
): Promise<void> {
  try {
    await push(supabase, receiverId, 'message', `${displayName(sender, 'A friend')} ♡`, messagePreview(type, content), {
      sender_id: sender.id, dedupe_key: `dm:${sender.id}`,
    });
    void pokeBell(supabase, receiverId);
  } catch {}
}

// One unread row per room per member. Muted members get nothing at all —
// no pop-up and no bell noise from a room they muted.
export async function notifyRoom(
  supabase: Sb,
  sender: Profile,
  room: Room,
  members: RoomMember[],
  type: string,
  content: string | null,
): Promise<void> {
  try {
    const preview = messagePreview(type, content);
    const targets = members.filter((m) => m.user_id !== sender.id && !m.muted);
    for (const t of targets) {
      await push(supabase, t.user_id, 'room_message', `${room.name} ♡`, `${displayName(sender, 'Someone')}: ${preview}`, {
        room_id: room.id, sender_id: sender.id, dedupe_key: `room:${room.id}`,
      });
      void pokeBell(supabase, t.user_id);
    }
  } catch {}
}

// A new game in a room — one row per other (unmuted) member, no dedupe:
// games are rare and each one is its own invitation.
export async function notifyGame(
  supabase: Sb,
  sender: Profile,
  room: Room,
  gameId: string,
  gameType: string,
): Promise<void> {
  try {
    const { data: members } = await supabase.from('room_members')
      .select('user_id,muted').eq('room_id', room.id);
    const label: Record<string, string> = {
      tictactoe: 'Tic Tac Toe', hangman: 'Hangman',
      numberguess: 'Number Guess', rps: 'Rock Paper Scissors',
    };
    const gameName = label[gameType] || 'a game';
    for (const m of (members || [])) {
      if (m.user_id === sender.id || m.muted) continue;
      await push(supabase, m.user_id, 'game', `New game in ${room.name}! 🎮`, `${displayName(sender, 'Someone')} started ${gameName} — come play!`, {
        room_id: room.id, game_id: gameId, game_type: gameType, sender_id: sender.id, dedupe_key: `game:${gameId}`,
      });
      void pokeBell(supabase, m.user_id);
    }
  } catch {}
}

export async function notifyFriendAccept(
  supabase: Sb,
  accepter: Profile,
  senderId: string,
): Promise<void> {
  try {
    await push(supabase, senderId, 'friend_accept', 'Friend request accepted! 💕', `${displayName(accepter, 'Your friend')} accepted your friend request ♡`, {
      sender_id: accepter.id, dedupe_key: `friend_accept:${accepter.id}`,
    });
    void pokeBell(supabase, senderId);
  } catch {}
}

// Where tapping a notification should take the user.
export function notificationHref(n: { type: string; data: Record<string, string> }): string {
  const d = n.data || {};
  if (n.type === 'message' && d.sender_id) return `/messages/${d.sender_id}`;
  if ((n.type === 'room_message' || n.type === 'game') && d.room_id) return `/rooms/${d.room_id}`;
  if (n.type === 'friend_request' || n.type === 'friend_accept') return '/friends';
  return '/dashboard';
}

export function notificationIcon(type: string): string {
  if (type === 'message') return '💬';
  if (type === 'room_message') return '🏠';
  if (type === 'friend_request') return '👋';
  if (type === 'friend_accept') return '💕';
  if (type === 'game') return '🎮';
  return '🔔';
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

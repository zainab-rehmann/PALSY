// PALSY — chat locker (migration 013).
// One OPTIONAL code per user; the user picks which DMs and rooms to
// lock, and nothing is locked by default. The code itself is never
// stored or read by clients — only a bcrypt hash lives in the
// database, checked by a server-side function that returns true/false.
// Unlock state lives only in memory: moving between pages keeps the
// locker open, but a reload locks it again.
import type { LockedChat } from '@/types';

type Sb = ReturnType<typeof import('@/lib/supabase/client').createClient>;

let unlocked = false;

export function isLockerUnlocked(): boolean {
  return unlocked;
}

export function setLockerUnlocked(value: boolean): void {
  unlocked = value;
}

export async function hasLockerCode(supabase: Sb): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('has_locker_code');
    return data === true;
  } catch {
    return false;
  }
}

export async function setLockerCode(supabase: Sb, code: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_locker_code', { p_code: code });
  return error ? error.message : null;
}

export async function verifyLockerCode(supabase: Sb, code: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('verify_locker_code', { p_code: code });
    return data === true;
  } catch {
    return false;
  }
}

export async function removeLockerCode(supabase: Sb): Promise<string | null> {
  const { error } = await supabase.rpc('remove_locker_code');
  if (!error) setLockerUnlocked(false);
  return error ? error.message : null;
}

export async function getLockedChats(supabase: Sb): Promise<LockedChat[]> {
  const { data } = await supabase.from('locked_chats').select('*');
  return (data || []) as LockedChat[];
}

export async function lockChat(
  supabase: Sb,
  chatType: 'dm' | 'room',
  targetId: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not signed in';
  const { error } = await supabase
    .from('locked_chats')
    .upsert({ user_id: user.id, chat_type: chatType, target_id: targetId }, { onConflict: 'user_id,chat_type,target_id' });
  return error ? error.message : null;
}

export async function unlockChat(
  supabase: Sb,
  chatType: 'dm' | 'room',
  targetId: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Not signed in';
  const { error } = await supabase
    .from('locked_chats')
    .delete()
    .eq('user_id', user.id)
    .eq('chat_type', chatType)
    .eq('target_id', targetId);
  return error ? error.message : null;
}

// Is this chat locked for a given user? Used by notification writers
// (the sender) so message previews stay hidden for locked chats. The
// server only answers for chats the caller takes part in.
export async function isChatLockedFor(
  supabase: Sb,
  userId: string,
  chatType: 'dm' | 'room',
  targetId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_chat_locked_for', {
      p_user_id: userId,
      p_chat_type: chatType,
      p_target_id: targetId,
    });
    return data === true;
  } catch {
    return false;
  }
}

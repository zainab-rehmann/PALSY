'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Global new-message notifier (mounted once in the root layout).
// - Stamps delivered_at when a DM reaches this device (WhatsApp's ✓✓)
// - Pops a browser notification on mobile/laptop when a message arrives
//   and the user is not already looking at that chat.
// Notification permission is requested on the first tap/click, because
// browsers only allow asking during a user gesture.
export default function MessageNotifier() {
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let roomChannel: ReturnType<typeof supabase.channel> | null = null;

    const ask = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', ask, { once: true });

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const nameCache = new Map<string, string>();

      channel = supabase
        .channel(`notify-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
          async (payload) => {
            const msg = payload.new as {
              id: string; sender_id: string; content: string | null; type: string;
            };

            // It reached this device -> delivered
            await supabase
              .from('messages')
              .update({ delivered_at: new Date().toISOString() })
              .eq('id', msg.id)
              .is('delivered_at', null);

            // Already looking at this chat? No popup needed.
            if (window.location.pathname === `/messages/${msg.sender_id}`) return;
            if (!('Notification' in window) || Notification.permission !== 'granted') return;

            let name = nameCache.get(msg.sender_id);
            if (!name) {
              const { data: p } = await supabase
                .from('profiles')
                .select('display_name,username')
                .eq('id', msg.sender_id)
                .single();
              name = p?.display_name || p?.username || 'A friend';
              nameCache.set(msg.sender_id, name as string);
            }
            const senderName = name ?? 'A friend';

            const body =
              msg.type === 'text'
                ? (msg.content || '').slice(0, 90)
                : msg.type === 'image'
                  ? '📷 sent you a photo'
                  : msg.type === 'video'
                    ? '🎥 sent you a video'
                    : msg.type === 'voice' || msg.type === 'audio'
                      ? '🎤 sent you a voice message'
                      : '📎 sent you a file';

            try {
              const n = new Notification(`PALSY ♡ — ${senderName}`, {
                body,
                icon: '/favicon.svg',
                tag: `dm-${msg.sender_id}`,
              });
              n.onclick = () => {
                window.focus();
                window.location.href = `/messages/${msg.sender_id}`;
                n.close();
              };
            } catch {
              // Notifications unsupported in this browser context — ignore.
            }
          }
        )
        .subscribe();

      // Room messages: popups for rooms I belong to (unless I muted the room)
      const { data: myRooms } = await supabase
        .from('room_members')
        .select('room_id,muted,room:rooms(name)')
        .eq('user_id', user.id);
      const roomMap = new Map<string, { muted: boolean; name: string }>(
        (myRooms || []).map((r: any) => [r.room_id, { muted: !!r.muted, name: r.room?.name || 'Room' }])
      );
      roomChannel = supabase
        .channel(`notify-rooms-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          async (payload) => {
            const m = payload.new as any;
            if (!m.room_id || m.sender_id === user.id) return;
            const info = roomMap.get(m.room_id);
            if (!info || info.muted) return;
            if (window.location.pathname === `/rooms/${m.room_id}`) return;
            if (!('Notification' in window) || Notification.permission !== 'granted') return;
            let senderName = nameCache.get(m.sender_id);
            if (!senderName) {
              const { data: p } = await supabase
                .from('profiles')
                .select('display_name,username')
                .eq('id', m.sender_id)
                .single();
              senderName = p?.display_name || p?.username || 'Someone';
              nameCache.set(m.sender_id, senderName as string);
            }
            const preview = m.type === 'text' ? (m.content || '').slice(0, 80) : 'sent a message ♡';
            try {
              const n = new Notification(`PALSY ♡ — ${info.name}`, {
                body: `${senderName ?? 'Someone'}: ${preview}`,
                icon: '/favicon.svg',
                tag: `room-${m.room_id}`,
              });
              n.onclick = () => {
                window.focus();
                window.location.href = `/rooms/${m.room_id}`;
                n.close();
              };
            } catch {}
          }
        )
        .subscribe();
    })();

    return () => {
      window.removeEventListener('pointerdown', ask);
      if (channel) supabase.removeChannel(channel);
      if (roomChannel) supabase.removeChannel(roomChannel);
    };
  }, []);

  return null;
}

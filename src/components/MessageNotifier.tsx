'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { notificationHref } from '@/lib/notify';

// Global new-message notifier (mounted once in the root layout).
// - Stamps delivered_at when a DM reaches this device (WhatsApp's ✓✓)
// - Pops a browser notification on mobile/laptop when a message arrives
//   and the user is not already looking at that chat.
// - Pops for friend requests, friend accepts and new games too.
// Pop-ups only fire when the user allowed them in the browser AND kept
// the pop-up switch on in Settings. Muted rooms never pop. The friendly
// permission ask lives in NotificationPrompt — this component never
// asks on its own.
export default function MessageNotifier() {
  useEffect(() => {
    const supabase = createClient();
    let channels: ReturnType<typeof supabase.channel>[] = [];
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    // Mutable settings, refreshed every 30s so muting a room or turning
    // pop-ups off takes effect without a reload.
    let enabled = true;
    let roomMap = new Map<string, { muted: boolean; name: string }>();
    const nameCache = new Map<string, string>();
    const seenNotifIds = new Set<string>();

    function canPop(): boolean {
      return enabled && 'Notification' in window && Notification.permission === 'granted';
    }

    async function senderName(id: string): Promise<string> {
      const cached = nameCache.get(id);
      if (cached) return cached;
      const { data: p } = await supabase.from('profiles').select('display_name,username').eq('id', id).single();
      const name = p?.display_name || p?.username || 'Someone';
      nameCache.set(id, name);
      return name;
    }

    function pop(title: string, body: string, tag: string, href: string) {
      if (!canPop()) return;
      try {
        const n = new Notification(title, { body, icon: '/favicon.svg', tag });
        n.onclick = () => {
          window.focus();
          window.location.href = href;
          n.close();
        };
      } catch {}
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      async function refreshSettings() {
        const { data: prof } = await supabase.from('profiles').select('notifications_enabled').eq('id', user!.id).single();
        if (prof) enabled = prof.notifications_enabled !== false;
        const { data: myRooms } = await supabase.from('room_members')
          .select('room_id,muted,room:rooms(name)').eq('user_id', user!.id);
        roomMap = new Map<string, { muted: boolean; name: string }>(
          (myRooms || []).map((r: any) => [r.room_id, { muted: !!r.muted, name: r.room?.name || 'Room' }]),
        );
      }
      await refreshSettings();
      refreshTimer = setInterval(refreshSettings, 30000);

      // Rows already waiting are "seen" — only NEW ones may pop.
      const { data: waiting } = await supabase.from('notifications').select('id')
        .eq('user_id', user.id).eq('is_read', false);
      (waiting || []).forEach((r: any) => seenNotifIds.add(r.id));

      // DM pop-ups + delivered stamps.
      const dmChannel = supabase
        .channel(`notify-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
          async (payload) => {
            const msg = payload.new as { id: string; sender_id: string; content: string | null; type: string };
            await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', msg.id).is('delivered_at', null);
            if (window.location.pathname === `/messages/${msg.sender_id}`) return;
            const name = await senderName(msg.sender_id);
            const body = msg.type === 'text' ? (msg.content || '').slice(0, 90)
              : msg.type === 'image' ? '📷 sent you a photo'
              : msg.type === 'video' ? '🎥 sent you a video'
              : msg.type === 'voice' || msg.type === 'audio' ? '🎤 sent you a voice message'
              : '📎 sent you a file';
            pop(`PALSY ♡ — ${name}`, body, `dm-${msg.sender_id}`, `/messages/${msg.sender_id}`);
          })
        .subscribe();

      // Room pop-ups (membership + mute respected, refreshed above).
      const roomChannel = supabase
        .channel(`notify-rooms-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          async (payload) => {
            const m = payload.new as any;
            if (!m.room_id || m.sender_id === user.id) return;
            const info = roomMap.get(m.room_id);
            if (!info || info.muted) return;
            if (window.location.pathname === `/rooms/${m.room_id}`) return;
            const name = await senderName(m.sender_id);
            const preview = m.type === 'text' ? (m.content || '').slice(0, 80) : 'sent a message ♡';
            pop(`PALSY ♡ — ${info.name}`, `${name}: ${preview}`, `room-${m.room_id}`, `/rooms/${m.room_id}`);
          })
        .subscribe();

      // Friend + game pop-ups: the live poke tells us a new notification
      // row exists; we re-read and pop for fresh friend/game rows only.
      // (Message rows are covered by the channels above — no doubles.)
      const pokeChannel = supabase
        .channel(`bell-${user.id}`)
        .on('broadcast', { event: 'new-notification' }, async () => {
          const { data } = await supabase.from('notifications').select('*')
            .eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(10);
          for (const n of (data || []) as any[]) {
            if (seenNotifIds.has(n.id)) continue;
            seenNotifIds.add(n.id);
            if (n.type !== 'friend_request' && n.type !== 'friend_accept' && n.type !== 'game') continue;
            if (Date.now() - new Date(n.created_at).getTime() > 60000) continue;
            pop(`PALSY ♡ — ${n.title}`, n.body, `notif-${n.id}`, notificationHref(n));
          }
        })
        .subscribe();

      channels = [dmChannel, roomChannel, pokeChannel];
    })();

    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
      channels.forEach((c) => { try { supabase.removeChannel(c); } catch {} });
    };
  }, []);

  return null;
}

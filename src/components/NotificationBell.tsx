'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { AppNotification } from '@/types';
import { Bell } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { notificationHref, notificationIcon, timeAgo } from '@/lib/notify';

// The notification bell + dropdown, used in the dashboard header and the
// desktop sidebar. The badge and list refresh live (broadcast poke +
// database updates) with a polling fallback.
export default function NotificationBell({ variant }: { variant: 'icon' | 'navRow' | 'navItem' }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Escape closes the panel (the backdrop click already does).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await supabase.from('notifications').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    setItems((data || []) as AppNotification[]);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    let bellChannel: ReturnType<typeof supabase.channel> | null = null;
    let dbChannel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Live poke from whoever created a notification for this user.
      bellChannel = supabase.channel(`bell-${user.id}`)
        .on('broadcast', { event: 'new-notification' }, () => { load(); })
        .subscribe();
      // Own changes (marking read in another tab) arrive directly.
      dbChannel = supabase.channel(`bell-db-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { load(); })
        .subscribe();
    })();
    // Polling fallback: the badge is never more than 20s stale.
    const t = setInterval(load, 20000);
    return () => {
      clearInterval(t);
      if (bellChannel) supabase.removeChannel(bellChannel);
      if (dbChannel) supabase.removeChannel(dbChannel);
    };
  }, [load]);

  const unread = items.filter((n) => !n.is_read).length;

  async function openItem(n: AppNotification) {
    const supabase = createClient();
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    setOpen(false);
    router.push(notificationHref(n));
  }

  async function markAllRead() {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
  }

  async function clearAll() {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from('notifications').delete().eq('user_id', userId);
    setItems([]);
    setShowClearConfirm(false);
  }

  const badge = unread > 0 ? (
    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full text-white font-bold"
      style={{ background: 'var(--color-accent)', fontSize: 10 }}>{unread > 9 ? '9+' : unread}</span>
  ) : null;

  return (
    <div className="relative">
      {variant === 'icon' && (
        <button onClick={() => setOpen((v) => !v)} className="relative p-2 rounded-xl transition-all" style={{ background: 'var(--color-secondary)' }} title="Notifications">
          <Bell size={18} style={{ color: 'var(--color-accent)' }} />
          {badge}
        </button>
      )}
      {variant === 'navRow' && (
        <button onClick={() => setOpen((v) => !v)}
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all w-full text-left"
          style={{ background: open ? 'var(--color-secondary)' : 'transparent', color: 'var(--color-text)' }}>
          <span className="relative"><Bell size={18} />{badge}</span>
          Notifications
          {unread > 0 && <span className="ml-auto text-xs font-bold" style={{ color: 'var(--color-accent)' }}>{unread} new</span>}
        </button>
      )}
      {variant === 'navItem' && (
        <button onClick={() => setOpen((v) => !v)} className="flex-1 flex flex-col items-center py-2.5 gap-1 transition-all relative"
          style={{ color: open ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
          <span className="relative"><Bell size={20} />{badge}</span>
          <span className="text-xs font-semibold">Alerts</span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={variant === 'navItem'
              ? 'fixed left-3 right-3 z-50 rounded-3xl p-3 max-h-[62vh] overflow-y-auto'
              : 'absolute right-0 top-full mt-2 z-50 w-[360px] max-w-[92vw] rounded-3xl p-3 max-h-[70vh] overflow-y-auto'}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              ...(variant === 'navItem' ? { bottom: 76 } : {}),
            }}>
            <div className="flex items-center gap-2 px-1 pb-2">
              <p className="font-black text-sm theme-text flex-1">Notifications ♡</p>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'var(--color-secondary)', color: 'var(--color-accent)' }}>Mark all read</button>
              )}
              {items.length > 0 && (
                <button onClick={() => setShowClearConfirm(true)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(255,107,107,0.1)', color: '#FF6B6B' }}>Clear</button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
                All quiet here ♡<br />New messages and friend news will appear here.
              </p>
            ) : items.map((n) => (
              <button key={n.id} onClick={() => openItem(n)} className="w-full flex gap-3 px-3 py-2.5 rounded-2xl mb-1 text-left"
                style={{ background: n.is_read ? 'transparent' : 'var(--color-secondary)' }}>
                <span className="text-xl flex-shrink-0">{notificationIcon(n.type)}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-bold truncate theme-text">{n.title}</span>
                    <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{timeAgo(n.created_at)}</span>
                  </span>
                  <span className="block text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{n.body}</span>
                </span>
                {!n.is_read && <span className="w-2 h-2 rounded-full flex-shrink-0 self-center" style={{ background: 'var(--color-accent)' }} />}
              </button>
            ))}
          </div>
        </>
      )}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear all notifications?"
          message="This deletes every notification in your bell. You can't undo it."
          confirmLabel="Clear all"
          onConfirm={clearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

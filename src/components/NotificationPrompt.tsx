'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, X } from 'lucide-react';

// Friendly one-time ask for browser pop-up permission. Shown only to
// signed-in users whose permission is still undecided, and never more
// than once a week after dismissing it.
const DISMISSED_KEY = 'palsy-notif-prompt-dismissed';

export default function NotificationPrompt() {
  const [show, setShow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'default') return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) || 0);
        if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
      } catch {}
      // Let the page settle before asking.
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    })();
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  async function enable() {
    if (!('Notification' in window)) return;
    setAsking(true);
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        setShow(false);
      } else if (result === 'denied') {
        setBlocked(true);
      }
    } catch {}
    setAsking(false);
  }

  if (!show) return null;

  return (
    <div className="fixed z-50 left-3 right-3 sm:left-auto sm:right-5 sm:w-[360px] rounded-3xl p-4"
      style={{ bottom: 76, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
      <div className="flex items-start gap-3">
        <span className="p-2.5 rounded-2xl flex-shrink-0" style={{ background: 'var(--color-secondary)' }}>
          <Bell size={20} style={{ color: 'var(--color-accent)' }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm theme-text">Get pop-ups when friends message you? ♡</p>
          {blocked ? (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Pop-ups are blocked for this site. Tap the lock (or tune) icon in your browser&apos;s address bar → Site settings → Notifications → Allow, then come back here.
            </p>
          ) : (
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              We&apos;ll show a little pop-up on this device when a message arrives — even when PALSY isn&apos;t the front tab. You can turn it off anytime in Settings.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            {!blocked && (
              <button onClick={enable} disabled={asking} className="theme-btn px-3 py-2 rounded-xl text-xs font-bold">
                {asking ? 'Asking…' : 'Turn on notifications'}
              </button>
            )}
            <button onClick={dismiss} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--color-secondary)', color: 'var(--color-text)' }}>
              {blocked ? 'Got it' : 'Not now'}
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="p-1 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}><X size={14} /></button>
      </div>
    </div>
  );
}

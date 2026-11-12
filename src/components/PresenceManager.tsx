'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Global presence heartbeat (mounted once in the root layout).
//
// THE KEY FIX: the layout mounts once, BEFORE login, and login navigates
// with router.replace (no remount). A one-time getUser() here therefore
// never saw the signed-in user, so the heartbeat never started at all and
// is_online / last_seen went stale. This version listens to auth state
// instead, so the heartbeat starts the moment anyone signs in.
//
// - Marks me online + refreshes last_seen every 15s while signed in.
// - Marks me offline when the tab is hidden, and on pagehide via a
//   keepalive fetch that survives tab close (a normal async call is
//   often killed before it lands).
// - Readers treat "online" as fresh-only (see src/lib/presence.ts), so a
//   closed tab that never got its offline write still flips to last seen
//   within a minute.
const HEARTBEAT_MS = 15000;

export default function PresenceManager() {
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;
    let accessToken: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    async function writePresence(online: boolean) {
      if (!userId) return;
      try {
        await supabase
          .from('profiles')
          .update({ is_online: online, last_seen: new Date().toISOString() })
          .eq('id', userId);
      } catch {
        // Presence is best-effort; never break the app over it.
      }
    }

    function writeOfflineBeacon() {
      if (!userId) return;
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !anon || !accessToken) {
          void writePresence(false);
          return;
        }
        fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ is_online: false, last_seen: new Date().toISOString() }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Best effort only.
      }
    }

    function startHeartbeat() {
      if (timer || !userId) return;
      void writePresence(true);
      timer = setInterval(() => {
        void writePresence(true);
      }, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (!userId) return;
      if (document.hidden) {
        stopHeartbeat();
        void writePresence(false);
      } else {
        startHeartbeat();
      }
    }

    function onHide() {
      if (!userId) return;
      stopHeartbeat();
      writeOfflineBeacon();
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (stopped) return;
      if (session?.user) {
        userId = session.user.id;
        accessToken = session.access_token;
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          startHeartbeat();
        }
      } else {
        userId = null;
        accessToken = null;
        stopHeartbeat();
      }
    });

    return () => {
      stopped = true;
      stopHeartbeat();
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}

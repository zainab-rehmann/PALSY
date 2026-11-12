'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// Global presence heartbeat (mounted once in the root layout).
// - Marks me online + refreshes last_seen every 30s while the app is open.
// - Marks me offline when the tab is hidden or closed (best effort).
// Readers treat "online" as fresh-only (see src/lib/presence.ts), so a
// closed tab that never got its offline write still shows as last seen.
export default function PresenceManager() {
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function setPresence(online: boolean) {
      const id = userIdRef.current;
      if (!id) return;
      try {
        await supabase
          .from('profiles')
          .update({ is_online: online, last_seen: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // Presence is best-effort; never break the app over it.
      }
    }

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || stopped) return;
      userIdRef.current = user.id;
      await setPresence(true);
      timer = setInterval(() => setPresence(true), 30000);
    })();

    function onVisibility() {
      if (document.hidden) setPresence(false);
      else setPresence(true);
    }
    function onHide() {
      setPresence(false);
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      setPresence(false);
    };
  }, []);

  return null;
}

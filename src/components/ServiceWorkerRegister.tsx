'use client';
import { useEffect } from 'react';

// Registers the minimal installability service worker (public/sw.js).
// Production only: in local development a registered worker would just
// confuse rebuilds. Registration failure is silent — the app works
// exactly the same without it, it just isn't installable.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

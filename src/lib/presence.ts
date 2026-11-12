// PALSY — presence helpers (online / last seen, WhatsApp-style).
// is_online alone can go stale (a closed tab never clears it), so a user
// only counts as Online when is_online is true AND last_seen is fresh.
import type { Profile } from '@/types';

const FRESH_MS = 60 * 1000; // online heartbeat runs every 15s

export function isFreshOnline(p: Partial<Profile> | null | undefined): boolean {
  if (!p || !p.is_online || !p.last_seen) return false;
  return Date.now() - new Date(p.last_seen).getTime() < FRESH_MS;
}

export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'last seen a while ago';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'last seen a while ago';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 1000) return 'last seen just now';
  if (diff < 60 * 60 * 1000) return `last seen ${Math.floor(diff / 60000)} min ago`;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return `last seen today at ${time}`;
  if (days === 1) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

export function presenceLabel(p: Partial<Profile> | null | undefined): string {
  return isFreshOnline(p) ? 'Online' : formatLastSeen(p?.last_seen);
}

// --- Chat date separators (WhatsApp-style day dividers) ---

export function sameDay(a: string | Date, b: string | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function dayDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

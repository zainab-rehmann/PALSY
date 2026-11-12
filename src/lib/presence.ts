// PALSY — presence helpers (online / last seen, WhatsApp-style).
// is_online alone can go stale (a closed tab never clears it), so a user
// only counts as Online when is_online is true AND last_seen is fresh.
import type { Profile } from '@/types';

const FRESH_MS = 3 * 60 * 1000; // online heartbeat runs every 30s

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
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
}

export function presenceLabel(p: Partial<Profile> | null | undefined): string {
  return isFreshOnline(p) ? 'Online' : formatLastSeen(p?.last_seen);
}

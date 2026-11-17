'use client';
import { Volume2, VolumeX } from 'lucide-react';
import { useSoundsMuted } from '@/lib/sounds';

// Little speaker button for game headers (rooms + DMs). Toggles the
// per-device game-sounds mute; the Settings Alerts tab has the same
// switch, and both stay in sync. userId keys the mute per user.
export default function SoundToggle({ userId }: { userId?: string | null }) {
  const [muted, setMuted] = useSoundsMuted(userId);
  return (
    <button type="button" onClick={() => setMuted(!muted)}
      title={muted ? 'Game sounds off — tap to turn on' : 'Game sounds on — tap to mute'}
      className="p-2 rounded-xl flex-shrink-0 transition-all hover:scale-105"
      style={{ background: 'rgba(var(--color-overlay-rgb),0.7)', color: 'var(--color-text-muted)' }}>
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}

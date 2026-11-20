'use client';

// Shared media gallery for PALSY — every photo and video shared in ONE
// chat (a DM or a room), in a grid, newest first. Tap a tile to open
// the full image / video; close returns to the chat.
//
// LOCKER RULE: this component only ever renders inside a chat page that
// has already passed its locker gate (locked chats return the code
// prompt before any chat UI mounts), and it only ever shows the items
// the caller loaded with a conversation-filtered query (room_id = this
// room, or the DM pair) — it runs no query of its own and never sees
// another conversation's media. Solid colours only, no blur/glow.
import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Play } from 'lucide-react';

export interface GalleryItem {
  id: string;
  media_url: string;
  type: 'image' | 'video';
  created_at: string;
  sender_id: string;
  sender_name?: string;
}

export default function MediaGallery({ items, title, accentColor, loading, onClose }: {
  items: GalleryItem[];
  title: string;
  accentColor: string;
  loading: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  // Escape closes the viewer first, then the gallery.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected !== null) setSelected(null);
      else onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected, onClose]);

  const current = selected !== null ? items[selected] : null;
  const step = (d: number) => {
    if (selected === null) return;
    setSelected((selected + d + items.length) % items.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--color-surface)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: 'var(--color-secondary)' }} title="Back to chat">
          <X size={18} style={{ color: 'var(--color-accent)' }} />
        </button>
        <p className="font-black text-sm theme-text flex-1 truncate">{title}</p>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: `${accentColor}22`, color: accentColor }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Grid — 3 columns at phone width, newest first. */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--color-text-muted)' }}>Loading your media… ♡</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-4xl">🖼️</p>
            <p className="font-black theme-text">No photos or videos yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Photos and videos you share in this chat will appear here ♡</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((it, i) => (
              <button key={it.id} onClick={() => setSelected(i)} className="relative aspect-square rounded-xl overflow-hidden" style={{ background: 'var(--color-secondary)' }} title={it.sender_name || ''}>
                {it.type === 'video' ? (
                  <>
                    <video src={it.media_url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                        <Play size={16} />
                      </span>
                    </span>
                  </>
                ) : (
                  <img src={it.media_url} alt="shared media" loading="lazy" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full viewer — solid dark panel, image or video with controls. */}
      {current && (
        <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: '#231A16' }}>
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
            <button onClick={() => setSelected(null)} className="p-2 rounded-xl" style={{ background: '#3A2E28' }} title="Back to grid">
              <X size={18} style={{ color: '#FFF8F0' }} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: '#FFF8F0' }}>{current.sender_name || 'Shared media'}</p>
              <p className="text-xs" style={{ color: '#D8C4B8' }}>
                {new Date(current.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {new Date(current.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <span className="text-xs font-bold" style={{ color: '#D8C4B8' }}>{(selected ?? 0) + 1} / {items.length}</span>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-4 gap-2">
            {items.length > 1 && (
              <button onClick={() => step(-1)} className="p-2 rounded-full flex-shrink-0" style={{ background: '#3A2E28', color: '#FFF8F0' }} title="Previous">
                <ChevronLeft size={20} />
              </button>
            )}
            {current.type === 'video' ? (
              <video key={current.id} src={current.media_url} controls autoPlay playsInline className="max-w-full max-h-full rounded-2xl" style={{ background: '#000' }} />
            ) : (
              <img key={current.id} src={current.media_url} alt="shared media" className="max-w-full max-h-full object-contain rounded-2xl" />
            )}
            {items.length > 1 && (
              <button onClick={() => step(1)} className="p-2 rounded-full flex-shrink-0" style={{ background: '#3A2E28', color: '#FFF8F0' }} title="Next">
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// PALSY — personal chat wallpapers (WhatsApp-style).
// Each user picks their OWN wallpaper; it is stored on their profile and
// only ever changes what THEY see in DMs and room chats. A value is either
// a preset id, a custom uploaded image URL, or 'default'/empty.
import type { CSSProperties } from 'react';

export interface WallpaperPreset {
  id: string;
  name: string;
  emoji: string;
  style: CSSProperties;
}

const HEART_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Cpath d='M28 42 C14 31 10 23 13 16 C16 10 23 10 28 16 C33 10 40 10 43 16 C46 23 42 31 28 42Z' fill='%23F2BBD2' fill-opacity='0.5'/%3E%3C/svg%3E\")";
const STAR_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cpath d='M32 10 L37 24 L52 24 L40 33 L44 48 L32 39 L20 48 L24 33 L12 24 L27 24 Z' fill='%23A9C9F5' fill-opacity='0.55'/%3E%3C/svg%3E\")";

export const WALLPAPERS: WallpaperPreset[] = [
  { id: 'default', name: 'Default', emoji: '✨', style: {} },
  {
    id: 'blush',
    name: 'Blush',
    emoji: '🩷',
    style: { background: 'linear-gradient(160deg, #FFE3EE 0%, #FFF6F9 55%, #FFF9F0 100%)' },
  },
  {
    id: 'sky',
    name: 'Sky',
    emoji: '💙',
    style: { background: 'linear-gradient(160deg, #DCEBFF 0%, #F2F8FF 55%, #FFFFFF 100%)' },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    emoji: '💜',
    style: { background: 'linear-gradient(160deg, #EDE7F6 0%, #F8F5FF 60%, #FFFFFF 100%)' },
  },
  {
    id: 'peach',
    name: 'Peach',
    emoji: '🍑',
    style: { background: 'linear-gradient(160deg, #FFEEDD 0%, #FFF8F0 60%, #FFFFFF 100%)' },
  },
  {
    id: 'mint',
    name: 'Mint',
    emoji: '🌿',
    style: { background: 'linear-gradient(160deg, #E8F5E9 0%, #F7FCF7 60%, #FFFFFF 100%)' },
  },
  {
    id: 'hearts',
    name: 'Hearts',
    emoji: '💕',
    style: { backgroundColor: '#FFF0F5', backgroundImage: HEART_SVG, backgroundSize: '56px 56px' },
  },
  {
    id: 'stars',
    name: 'Stars',
    emoji: '⭐',
    style: { backgroundColor: '#EDF4FF', backgroundImage: STAR_SVG, backgroundSize: '64px 64px' },
  },
  {
    id: 'dots',
    name: 'Dots',
    emoji: '🫧',
    style: {
      backgroundColor: '#FFF9F0',
      backgroundImage: 'radial-gradient(#F2BBD2 2.2px, transparent 2.3px)',
      backgroundSize: '26px 26px',
    },
  },
  {
    id: 'clouds',
    name: 'Clouds',
    emoji: '☁️',
    style: {
      backgroundColor: '#EAF3FF',
      backgroundImage:
        'radial-gradient(ellipse 90px 34px at 20% 25%, rgba(255,255,255,0.95) 60%, transparent 61%),' +
        'radial-gradient(ellipse 120px 42px at 75% 60%, rgba(255,255,255,0.95) 60%, transparent 61%),' +
        'radial-gradient(ellipse 80px 30px at 45% 85%, rgba(255,255,255,0.9) 60%, transparent 61%)',
      backgroundSize: '340px 340px',
    },
  },
];

// Resolve a stored wallpaper value to the style for a chat background.
// Custom uploads get a soft white wash so bubbles and text stay readable
// over any photo.
export function wallpaperStyle(value: string | null | undefined): CSSProperties {
  if (!value || value === 'default') return {};
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return {
      backgroundImage: `linear-gradient(rgba(255,255,255,0.62), rgba(255,255,255,0.62)), url(${value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const preset = WALLPAPERS.find((w) => w.id === value);
  return preset ? preset.style : {};
}

export function isCustomWallpaper(value: string | null | undefined): boolean {
  return !!value && (value.startsWith('http://') || value.startsWith('https://'));
}

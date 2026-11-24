// PALSY — per-chat themes, Instagram-style (2-week plan, Mon 2026-11-23).
// One theme sets the chat background + own-bubble colour + accent together.
// A DM's theme is SHARED: either participant can change it and both see it
// instantly (stored in dm_chat_themes, migration 031). Rooms share the
// same gallery (stored on the rooms row, migration 033).
//
// Colours are solid theme tokens only — gradients are built from colour
// stops, no blur/glow/transparency (her standing rule). 'default' means
// "no chat theme": the personal wallpaper + app theme show, as before.
// In Autumn (dark) mode the dark page background wins over a light theme
// background (same rule as room presets, from the 2026-11-22 dark-mode
// fix) — the theme accent still applies to bubbles, games and polls.
import type { CSSProperties } from 'react';
import { wallpaperStyle } from './wallpapers';

export interface ChatTheme {
  id: string;
  name: string;
  emoji: string;
  /** Gradient for the chat background (light themes) or dark surface. */
  background: string;
  /** Own-message bubble colour. */
  bubbleMine: string;
  /** Text colour on own bubbles. */
  bubbleMineText: string;
  /** Accent used for the games banner, polls and highlights in this chat. */
  accent: string;
  /** Dark background — the list needs light text/muted/border overrides. */
  dark: boolean;
}

export const DEFAULT_CHAT_THEME_ID = 'default';

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'default',
    name: 'Default',
    emoji: '✨',
    background: '',
    bubbleMine: '',
    bubbleMineText: '',
    accent: '',
    dark: false,
  },
  {
    id: 'love',
    name: 'Love',
    emoji: '💕',
    background: 'linear-gradient(160deg, #FFD6E8 0%, #FFE9F3 45%, #FFF1F1 100%)',
    bubbleMine: '#FF5C8A',
    bubbleMineText: '#FFFFFF',
    accent: '#FF5C8A',
    dark: false,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    background: 'linear-gradient(160deg, #CDE9FF 0%, #E3F2FF 45%, #E6FFF9 100%)',
    bubbleMine: '#0E7490',
    bubbleMineText: '#FFFFFF',
    accent: '#0E7490',
    dark: false,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    emoji: '🌅',
    background: 'linear-gradient(160deg, #FFE3C2 0%, #FFE9E4 45%, #F3E4FF 100%)',
    bubbleMine: '#EA580C',
    bubbleMineText: '#FFFFFF',
    accent: '#EA580C',
    dark: false,
  },
  {
    id: 'forest',
    name: 'Forest',
    emoji: '🌿',
    background: 'linear-gradient(160deg, #D3EDD8 0%, #E8F7E8 45%, #F4FBEF 100%)',
    bubbleMine: '#15803D',
    bubbleMineText: '#FFFFFF',
    accent: '#15803D',
    dark: false,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    emoji: '🌙',
    background: 'linear-gradient(160deg, #1E293B 0%, #312E81 55%, #1E1B4B 100%)',
    bubbleMine: '#4F46E5',
    bubbleMineText: '#FFFFFF',
    accent: '#818CF8',
    dark: true,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    emoji: '💜',
    background: 'linear-gradient(160deg, #E7DEFF 0%, #F2EBFF 45%, #FDF2FF 100%)',
    bubbleMine: '#7C3AED',
    bubbleMineText: '#FFFFFF',
    accent: '#7C3AED',
    dark: false,
  },
];

export function getChatTheme(id: string | null | undefined): ChatTheme {
  return CHAT_THEMES.find((t) => t.id === id) || CHAT_THEMES[0];
}

// Style for the message-list container. A shared chat theme wins over the
// personal wallpaper (both participants see the same background); with no
// theme, the personal wallpaper shows exactly as before. In dark (autumn)
// mode the dark page wins and the wallpaper rule applies unchanged.
export function chatListStyle(
  themeId: string | null | undefined,
  wallpaper: string | null | undefined,
  darkMode: boolean,
): CSSProperties {
  const theme = getChatTheme(themeId);
  if (theme.id === 'default' || darkMode) return wallpaperStyle(wallpaper, darkMode);
  const style: CSSProperties = { background: theme.background };
  if (theme.dark) {
    // Light text on the dark gradient: override the theme vars the list
    // children read (timestamps, dividers, friend bubbles, chips).
    return {
      ...style,
      '--color-text': '#F1F5F9',
      '--color-text-muted': '#CBD5E1',
      '--color-secondary': 'rgba(255,255,255,0.12)',
      '--color-border': 'rgba(255,255,255,0.18)',
      '--color-bubble-other': 'rgba(255,255,255,0.14)',
    } as CSSProperties;
  }
  return style;
}

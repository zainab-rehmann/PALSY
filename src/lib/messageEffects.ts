// PALSY — message effects + magic words (2-week plan, Wed 2026-11-25,
// REDONE Fri 2026-11-27 as Instagram-style animated bubbles,
// RE-REDONE Fri 2026-11-27 after Zainab said the redo was not satisfying).
//
// What was wrong with the first redo (diagnosed frame by frame): the
// animation played TWICE on the sender's screen — the optimistic message
// animated, then the real saved row cleared it and re-animated, so the
// bubble visibly snapped back mid-pop; the pop was slow and floaty
// (1000–1300ms); once it settled the bubble looked like any other message
// and could never replay; and there were no particles at all, so it read
// as a colour blink, not a celebration.
//
// The fix, in this file + src/components/MessageEffect.tsx:
// - One play only: the play carries across the optimistic→real swap with
//   a negative animation-delay, so it never restarts (see the pages).
// - Snappy: ~650–700ms, one strong pop (0.6 → 1.15 with overshoot).
// - A lasting look: after settling, the bubble keeps a solid tint in the
//   effect's colour (dark ink text, contrast-checked 4.5:1+), and tapping
//   the message replays the animation. Old messages never replay on reload.
// - Small solid particles burst FROM the bubble itself — contained near
//   it, fading fast, never full-screen, never emoji (plain CSS/SVG shapes).
//
// One reusable helper for both chats (DMs + rooms): the sender picks an
// effect in the composer, or a magic word in the text picks one
// automatically. The effect id is stored on the message row (migration
// 034, messages.effect) so BOTH sides see the same animated message —
// the sender when they send, the receiver when it arrives live. Effects
// are visual only: they never change message content, and they play no
// sound, so the sounds-mute setting does not apply. Colours are solid
// theme colours only — no blur/glow/transparency (her standing rule).
// The keyframes live in src/components/MessageEffect.tsx.

import type { CSSProperties } from 'react';

export type MessageEffectId = 'confetti' | 'hearts' | 'fire' | 'stars';

export interface MessageEffectDef {
  id: MessageEffectId;
  name: string;
  /** CSS keyframes name (defined in MessageEffectStyles). */
  keyframes: string;
  /** How long one play lasts, ms. */
  durationMs: number;
  /** Solid flash colours the bubble passes through while popping. */
  accent: string;
  accent2: string;
  /** Solid background the bubble KEEPS after the pop settles. */
  tint: string;
  /** Text colour on the tint — dark ink, contrast 4.5:1+ on every tint. */
  tintText: string;
  hint: string;
}

export const MESSAGE_EFFECTS: MessageEffectDef[] = [
  {
    id: 'confetti',
    name: 'Confetti',
    keyframes: 'msg-fx-confetti',
    durationMs: 650,
    accent: '#FFC94D',
    accent2: '#FF8FB3',
    tint: '#E9A800',
    tintText: '#4A2436',
    hint: 'Pops in with a celebration bounce',
  },
  {
    id: 'hearts',
    name: 'Hearts',
    keyframes: 'msg-fx-hearts',
    durationMs: 700,
    accent: '#FF8FB3',
    accent2: '#FF5C8A',
    tint: '#F27BA8',
    tintText: '#4A2436',
    hint: 'Beats like a heart, keeps a pink tint',
  },
  {
    id: 'fire',
    name: 'Fire',
    keyframes: 'msg-fx-fire',
    durationMs: 650,
    accent: '#FF8A50',
    accent2: '#FF6B35',
    tint: '#F0762B',
    tintText: '#4A2436',
    hint: 'Ignites, keeps a warm tint',
  },
  {
    id: 'stars',
    name: 'Stars',
    keyframes: 'msg-fx-stars',
    durationMs: 650,
    accent: '#D9C6F7',
    accent2: '#B79CFF',
    tint: '#B79CFF',
    tintText: '#4A2436',
    hint: 'Sparkles as it lands, keeps a lilac tint',
  },
];

export function isMessageEffectId(v: unknown): v is MessageEffectId {
  return typeof v === 'string' && MESSAGE_EFFECTS.some((e) => e.id === v);
}

export function messageEffectDef(id: MessageEffectId): MessageEffectDef {
  return MESSAGE_EFFECTS.find((e) => e.id === id) ?? MESSAGE_EFFECTS[0];
}

// Magic words: a phrase anywhere in the message (case-insensitive)
// plays its effect automatically on send — no picker tap needed.
// Longer phrases first, so "i love you" wins over "love you".
export const MAGIC_WORDS: { phrase: string; effect: MessageEffectId }[] = [
  { phrase: 'happy birthday', effect: 'confetti' },
  { phrase: 'happy new year', effect: 'confetti' },
  { phrase: 'congratulations', effect: 'confetti' },
  { phrase: 'congrats', effect: 'confetti' },
  { phrase: 'i love you', effect: 'hearts' },
  { phrase: 'love you', effect: 'hearts' },
  { phrase: 'good luck', effect: 'stars' },
  { phrase: 'on fire', effect: 'fire' },
];

export function detectMagicWord(text: string): MessageEffectId | null {
  const lower = text.toLowerCase();
  for (const m of MAGIC_WORDS) {
    if (lower.includes(m.phrase)) return m.effect;
  }
  return null;
}

// A picked effect wins over a magic word; a magic word wins over none.
export function resolveMessageEffect(
  text: string,
  picked: MessageEffectId | null,
): MessageEffectId | null {
  return picked ?? detectMagicWord(text);
}

// The style to add to a message bubble while its effect is playing.
// --fx-tint is the lasting tint: the keyframes flash through the
// effect's solid colours and land on it, so the bubble settles exactly
// onto its tinted look. delayMs is a NEGATIVE CSS animation-delay (ms):
// when a play is carried from the optimistic message onto the real row,
// it resumes mid-flight instead of restarting. The animation runs once.
export function bubbleEffectStyle(
  effect: MessageEffectId,
  delayMs = 0,
): CSSProperties {
  const def = messageEffectDef(effect);
  return {
    '--fx-tint': def.tint,
    '--fx-accent': def.accent,
    '--fx-accent2': def.accent2,
    animation: `${def.keyframes} ${def.durationMs}ms cubic-bezier(.34,1.56,.64,1) 1`,
    ...(delayMs !== 0 ? { animationDelay: `${delayMs}ms` } : {}),
  } as CSSProperties;
}

// The lasting look: every message with an effect keeps its tint
// (background + text colour) after the animation ends — and after reload,
// since the effect id is stored on the message row.
export function effectTintStyle(effect: MessageEffectId): CSSProperties {
  const def = messageEffectDef(effect);
  return { background: def.tint, color: def.tintText };
}

// A single-play preview of the effect, for the composer picker and the
// picked-effect button — so the sender sees exactly what the message
// will do. It plays once when the picker opens (the picker mounts fresh
// each time), matching the real bubble's one play.
export function effectPreviewStyle(effect: MessageEffectId): CSSProperties {
  const def = messageEffectDef(effect);
  return {
    '--fx-tint': def.tint,
    '--fx-accent': def.accent,
    '--fx-accent2': def.accent2,
    animation: `${def.keyframes} ${def.durationMs}ms cubic-bezier(.34,1.56,.64,1) 1`,
    background: def.accent,
  } as CSSProperties;
}

// --- Particles: small solid shapes bursting FROM the bubble itself. ---
// Each particle starts at (x%, y%) of the bubble box and flies (dx, dy)
// pixels outward while fading, staggered by delay ms. Contained near the
// bubble (max ~40px travel), never full-screen, never emoji.

export type ParticleShape = 'rect' | 'circle' | 'heart' | 'flame' | 'star';

export interface ParticleDef {
  shape: ParticleShape;
  size: number; // px
  color: string;
  x: number; // burst point, % of bubble width
  y: number; // burst point, % of bubble height
  dx: number; // px travel, right positive
  dy: number; // px travel, down positive
  rot: number; // deg
  delay: number; // ms stagger
}

export const EFFECT_PARTICLES: Record<MessageEffectId, ParticleDef[]> = {
  confetti: [
    { shape: 'rect', size: 8, color: '#FF5C8A', x: 50, y: 50, dx: 30, dy: -28, rot: 140, delay: 0 },
    { shape: 'circle', size: 7, color: '#FFC94D', x: 50, y: 50, dx: -32, dy: -24, rot: 200, delay: 20 },
    { shape: 'rect', size: 7, color: '#4CAF7D', x: 50, y: 50, dx: 26, dy: 26, rot: 90, delay: 40 },
    { shape: 'circle', size: 8, color: '#6AA9FF', x: 50, y: 50, dx: -28, dy: 28, rot: 260, delay: 10 },
    { shape: 'rect', size: 6, color: '#FF8FB3', x: 50, y: 50, dx: 0, dy: -38, rot: 180, delay: 60 },
    { shape: 'rect', size: 7, color: '#FFC94D', x: 50, y: 50, dx: 38, dy: 4, rot: 120, delay: 30 },
    { shape: 'circle', size: 7, color: '#FF5C8A', x: 50, y: 50, dx: -38, dy: -2, rot: 220, delay: 80 },
    { shape: 'rect', size: 6, color: '#6AA9FF', x: 50, y: 50, dx: 14, dy: -34, rot: 160, delay: 50 },
    { shape: 'circle', size: 8, color: '#4CAF7D', x: 50, y: 50, dx: -16, dy: 32, rot: 240, delay: 70 },
    { shape: 'rect', size: 7, color: '#FF8FB3', x: 50, y: 50, dx: 34, dy: 18, rot: 100, delay: 90 },
  ],
  hearts: [
    { shape: 'heart', size: 15, color: '#FF5C8A', x: 50, y: 50, dx: -16, dy: -44, rot: -12, delay: 0 },
    { shape: 'heart', size: 12, color: '#FF8FB3', x: 50, y: 50, dx: -6, dy: -52, rot: 8, delay: 40 },
    { shape: 'heart', size: 14, color: '#E84A82', x: 50, y: 50, dx: 4, dy: -46, rot: -6, delay: 80 },
    { shape: 'heart', size: 12, color: '#FF5C8A', x: 50, y: 50, dx: 14, dy: -40, rot: 12, delay: 20 },
    { shape: 'heart', size: 13, color: '#FF8FB3', x: 50, y: 50, dx: -10, dy: -36, rot: -10, delay: 60 },
    { shape: 'heart', size: 11, color: '#FF5C8A', x: 50, y: 50, dx: 20, dy: -48, rot: 6, delay: 100 },
  ],
  fire: [
    { shape: 'flame', size: 13, color: '#FF6B35', x: 50, y: 12, dx: -12, dy: -26, rot: -8, delay: 0 },
    { shape: 'flame', size: 11, color: '#FF8A50', x: 50, y: 12, dx: -4, dy: -32, rot: 6, delay: 30 },
    { shape: 'flame', size: 12, color: '#FFC94D', x: 50, y: 12, dx: 6, dy: -28, rot: -5, delay: 60 },
    { shape: 'flame', size: 10, color: '#FF6B35', x: 50, y: 12, dx: 14, dy: -22, rot: 8, delay: 20 },
    { shape: 'flame', size: 12, color: '#FF8A50', x: 50, y: 12, dx: 0, dy: -36, rot: 0, delay: 50 },
  ],
  stars: [
    { shape: 'star', size: 13, color: '#FFC94D', x: 50, y: 50, dx: 24, dy: -20, rot: 90, delay: 0 },
    { shape: 'star', size: 11, color: '#FFE08A', x: 50, y: 50, dx: -24, dy: -16, rot: 140, delay: 30 },
    { shape: 'star', size: 12, color: '#FF8A50', x: 50, y: 50, dx: 20, dy: 18, rot: 60, delay: 60 },
    { shape: 'star', size: 10, color: '#FFC94D', x: 50, y: 50, dx: -20, dy: 20, rot: 120, delay: 20 },
    { shape: 'star', size: 12, color: '#FFE08A', x: 50, y: 50, dx: 0, dy: -30, rot: 180, delay: 40 },
    { shape: 'star', size: 11, color: '#FFC94D', x: 50, y: 50, dx: 28, dy: 2, rot: 90, delay: 70 },
    { shape: 'star', size: 10, color: '#FF8A50', x: 50, y: 50, dx: -28, dy: 4, rot: 150, delay: 10 },
  ],
};

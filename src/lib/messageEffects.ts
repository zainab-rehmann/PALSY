// PALSY — message effects + magic words (2-week plan, Wed 2026-11-25,
// REDONE Fri 2026-11-27 as Instagram-style animated bubbles).
//
// The first version (run 62) burst emoji across the whole screen. Zainab
// corrected it 26 Nov: "The msg effect does not mean the emojis. Make the
// proper effect as in Instagram — the appearance of that msg would be
// changed, in animation." So now the effect lives ON the message bubble
// itself: when a message with an effect is new, its bubble animates in —
// it pops, beats, ignites or sparkles — and then settles back to its
// normal look. No overlay, no floating pieces, no emoji anywhere.
//
// One reusable helper for both chats (DMs + rooms): the sender picks an
// effect in the composer, or a magic word in the text picks one
// automatically. The effect id is stored on the message row (migration
// 034, messages.effect) so BOTH sides see the same animated message —
// the sender when they send, the receiver when it arrives live. The
// animation plays ONCE per new message; old messages never replay on
// reload. Effects are visual only: they never change message content,
// and they play no sound, so the sounds-mute setting does not apply.
// Colours are solid theme colours only — no blur/glow/transparency
// (her standing rule). The keyframes live in src/components/MessageEffect.tsx.

import type { CSSProperties } from 'react';

export type MessageEffectId = 'confetti' | 'hearts' | 'fire' | 'stars';

export interface MessageEffectDef {
  id: MessageEffectId;
  name: string;
  /** CSS keyframes name (defined in MessageEffectStyles). */
  keyframes: string;
  /** How long one play lasts, ms. */
  durationMs: number;
  /** Solid flash colours the bubble passes through while animating. */
  accent: string;
  accent2: string;
  hint: string;
}

export const MESSAGE_EFFECTS: MessageEffectDef[] = [
  {
    id: 'confetti',
    name: 'Confetti',
    keyframes: 'msg-fx-confetti',
    durationMs: 1200,
    accent: '#FFC94D',
    accent2: '#FF8FB3',
    hint: 'Your bubble pops in with a celebration bounce',
  },
  {
    id: 'hearts',
    name: 'Hearts',
    keyframes: 'msg-fx-hearts',
    durationMs: 1100,
    accent: '#FF8FB3',
    accent2: '#FF5C8A',
    hint: 'Your bubble beats like a heart',
  },
  {
    id: 'fire',
    name: 'Fire',
    keyframes: 'msg-fx-fire',
    durationMs: 1000,
    accent: '#FF8A50',
    accent2: '#FF6B35',
    hint: 'Your bubble ignites, then settles',
  },
  {
    id: 'stars',
    name: 'Stars',
    keyframes: 'msg-fx-stars',
    durationMs: 1300,
    accent: '#FFE08A',
    accent2: '#FFC94D',
    hint: 'Your bubble sparkles as it lands',
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
// --fx-bg is the bubble's normal background: the keyframes flash
// through the effect's solid colours and land back on it, so the bubble
// settles exactly where it started. The animation runs once.
export function bubbleEffectStyle(
  effect: MessageEffectId,
  bubbleBg: string,
): CSSProperties {
  const def = messageEffectDef(effect);
  return {
    '--fx-bg': bubbleBg,
    '--fx-accent': def.accent,
    '--fx-accent2': def.accent2,
    animation: `${def.keyframes} ${def.durationMs}ms cubic-bezier(.34,1.56,.64,1) 1`,
  } as CSSProperties;
}

// A tiny looping preview of the effect, for the composer picker and the
// picked-effect button — so the sender can see what each effect does
// before picking it. Loops forever; the real bubble plays once.
export function effectPreviewStyle(effect: MessageEffectId): CSSProperties {
  const def = messageEffectDef(effect);
  return {
    '--fx-bg': def.accent,
    '--fx-accent': def.accent2,
    '--fx-accent2': def.accent,
    animation: `${def.keyframes} ${def.durationMs}ms cubic-bezier(.34,1.56,.64,1) infinite`,
    background: def.accent,
  } as CSSProperties;
}

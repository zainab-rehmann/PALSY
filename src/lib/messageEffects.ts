// PALSY — message effects + magic words (2-week plan, Wed 2026-11-25).
//
// One reusable helper for both chats (DMs + rooms): the sender picks an
// effect in the composer, or a magic word in the text picks one
// automatically. The effect id is stored on the message row (migration
// 034, messages.effect) so BOTH sides see the same burst — the sender
// when they send, the receiver when the message arrives live.
//
// Effects are visual only: they never change the message content, and
// they play no sound, so the sounds-mute setting does not apply to them.
// Colours are solid theme colours only — no blur/glow/transparency
// (her standing rule). A message with no effect behaves exactly as
// before; old messages never replay an effect on reload.

export type MessageEffectId = 'confetti' | 'hearts' | 'fire' | 'stars';

export interface MessageEffectDef {
  id: MessageEffectId;
  name: string;
  emoji: string;
  /** Characters that burst across the chat when the effect plays. */
  pieces: string[];
  /** Solid colours for the confetti pieces (plain text pieces use their own colour). */
  colors: string[];
  hint: string;
}

export const MESSAGE_EFFECTS: MessageEffectDef[] = [
  {
    id: 'confetti',
    name: 'Confetti',
    emoji: '🎉',
    pieces: ['🎉', '🎊', '✨', '💛', '💗', '💙'],
    colors: ['#FF6B9D', '#FFC94D', '#4ECDC4', '#7C6FF0', '#FF8A65'],
    hint: 'A burst of celebration',
  },
  {
    id: 'hearts',
    name: 'Hearts',
    emoji: '💕',
    pieces: ['💕', '💖', '💗', '💓', '❤️'],
    colors: ['#FF5C8A'],
    hint: 'Hearts float up',
  },
  {
    id: 'fire',
    name: 'Fire',
    emoji: '🔥',
    pieces: ['🔥', '✨', '💥'],
    colors: ['#FF6B35'],
    hint: 'Bring the heat',
  },
  {
    id: 'stars',
    name: 'Stars',
    emoji: '✨',
    pieces: ['✨', '⭐', '🌟', '💫'],
    colors: ['#FFC94D'],
    hint: 'A sprinkle of sparkle',
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

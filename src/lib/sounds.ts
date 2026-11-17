// Game sounds for PALSY — one reusable Web Audio helper (Saturday's
// Simon Says reuses this too). No audio files, no new dependencies:
// small oscillator note sequences, played locally only. Nothing about
// sounds is ever synced — a sound plays on the device that caused it
// (your tap) or when shared game state changes on your screen (your
// friend's move, a win). Mute is per user AND per device, persisted in
// localStorage (key `palsy-sounds:<userId>`, 'on'/'off'; an older shared
// key is still honoured as a fallback), default ON (sounds play).
// Sounds must never break a game: every call is wrapped so a missing
// AudioContext just means silence.
// Verification: every sound actually played is appended to the tiny
// in-memory log window.__palsySounds ([{ name, at }], newest last,
// capped at 100) — a browser cannot hear, so tests read the log.
'use client';
import { useEffect, useRef, useState } from 'react';

export type SoundKind = 'pop' | 'correct' | 'wrong' | 'win' | 'lose' | 'draw' | 'card' | 'claim' | 'turn' | 'round';
export type PadIndex = 0 | 1 | 2 | 3;

const LEGACY_MUTE_KEY = 'palsy-sounds-muted';
const MUTE_KEY_PREFIX = 'palsy-sounds:';
const CHANGED_EVENT = 'palsy-sounds-changed';

// The signed-in user for this tab. Set by useSoundsMuted / SoundToggle
// (the only places that know the user id); playSound is called deep
// inside game components with no user in scope, so it reads this.
// One user per tab, so one id is enough.
let currentUserId: string | null = null;
export function setSoundsUser(userId?: string | null): void {
  if (userId) currentUserId = userId;
}

function muteKey(userId: string): string {
  return `${MUTE_KEY_PREFIX}${userId}`;
}

// In-memory log of sounds actually played, for automated verification.
export interface SoundLogEntry { name: string; at: number }
declare global {
  interface Window { __palsySounds?: SoundLogEntry[] }
}
function logPlayed(name: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!window.__palsySounds) window.__palsySounds = [];
    const log = window.__palsySounds;
    log.push({ name, at: Date.now() });
    if (log.length > 100) log.splice(0, log.length - 100);
  } catch {
    // Logging must never break a game.
  }
}

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

// Browsers block audio until the user interacts: unlock the AudioContext
// on the first pointer/key press, and resume it when the tab becomes
// visible again after being hidden. Installed once, client-side only.
let audioUnlockInstalled = false;
function unlockAudio(): void {
  try {
    const at = audioCtx();
    if (at && at.state === 'suspended') void at.resume().catch(() => undefined);
  } catch {
    // Silence.
  }
}
if (typeof window !== 'undefined' && !audioUnlockInstalled) {
  audioUnlockInstalled = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) unlockAudio();
  });
}

function tone(at: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  const o = at.createOscillator();
  const g = at.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(at.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// [frequency, delay seconds, duration seconds, oscillator type]
const SOUND_MAP: Record<SoundKind, [number, number, number, OscillatorType?][]> = {
  pop: [[520, 0, 0.09, 'sine']],
  turn: [[660, 0, 0.1, 'sine'], [880, 0.09, 0.12, 'sine']],
  correct: [[523, 0, 0.1, 'sine'], [659, 0.09, 0.1, 'sine'], [784, 0.18, 0.16, 'sine']],
  wrong: [[220, 0, 0.16, 'triangle'], [175, 0.12, 0.2, 'triangle']],
  win: [[523, 0, 0.12, 'sine'], [659, 0.1, 0.12, 'sine'], [784, 0.2, 0.12, 'sine'], [1047, 0.3, 0.22, 'sine']],
  lose: [[392, 0, 0.14, 'triangle'], [330, 0.12, 0.14, 'triangle'], [262, 0.24, 0.22, 'triangle']],
  draw: [[440, 0, 0.12, 'sine'], [440, 0.14, 0.16, 'sine']],
  card: [[700, 0, 0.06, 'triangle'], [500, 0.05, 0.08, 'triangle']],
  claim: [[587, 0, 0.1, 'sine'], [880, 0.08, 0.14, 'sine']],
  round: [[494, 0, 0.1, 'sine'], [622, 0.09, 0.14, 'sine']],
};

export function isSoundsMuted(userId?: string | null): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const id = userId ?? currentUserId;
    if (id) {
      const v = localStorage.getItem(muteKey(id));
      if (v === 'off') return true;
      if (v === 'on') return false;
      // No per-user value yet: honour the older shared key once, so a
      // mute set before per-user keys existed is not lost.
    }
    return localStorage.getItem(LEGACY_MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundsMuted(muted: boolean, userId?: string | null): void {
  try {
    const id = userId ?? currentUserId;
    if (id) localStorage.setItem(muteKey(id), muted ? 'off' : 'on');
    else if (muted) localStorage.setItem(LEGACY_MUTE_KEY, '1');
    else localStorage.removeItem(LEGACY_MUTE_KEY);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    // Mute preference is best-effort; a failed write just means sounds stay on.
  }
}

export function playSound(kind: SoundKind): void {
  try {
    if (isSoundsMuted()) return;
    const at = audioCtx();
    if (!at) return;
    const now = at.currentTime + 0.01;
    for (const [freq, delay, dur, type] of SOUND_MAP[kind]) tone(at, freq, now + delay, dur, type || 'sine');
    logPlayed(kind);
  } catch {
    // Sounds must never break the game.
  }
}

// Low-level tone primitive: one soft generated tone. Frequency in Hz,
// duration in seconds, sine/triangle for a gentle voice, low gain.
// Saturday's Simon Says (and any future game) builds on this — do not
// build a second audio path.
export interface ToneOptions {
  frequency: number;
  duration?: number;
  waveform?: OscillatorType;
  gain?: number;
  delay?: number;
}
export function playTone(opts: ToneOptions): void {
  try {
    if (isSoundsMuted()) return;
    const at = audioCtx();
    if (!at) return;
    tone(at, opts.frequency, at.currentTime + 0.01 + (opts.delay ?? 0), opts.duration ?? 0.15, opts.waveform ?? 'sine', opts.gain ?? 0.12);
    logPlayed('tone');
  } catch {
    // Sounds must never break the game.
  }
}

// Simon Says pads: four distinct beeps on the same soft sine voice.
// Pads are C4 / E4 / G4 / C5 — far enough apart to tell by ear.
const PAD_FREQUENCIES: readonly [number, number, number, number] = [262, 330, 392, 523];
export function playPadTone(pad: PadIndex): void {
  try {
    if (isSoundsMuted()) return;
    const at = audioCtx();
    if (!at) return;
    tone(at, PAD_FREQUENCIES[pad], at.currentTime + 0.01, 0.35, 'sine', 0.14);
    logPlayed(`pad${pad}`);
  } catch {
    // Sounds must never break the game.
  }
}

// React hook: current mute state, live-updates when any toggle changes it.
// Pass the signed-in user's id so the mute is stored per user.
export function useSoundsMuted(userId?: string | null): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    if (userId) setSoundsUser(userId);
    setMuted(isSoundsMuted(userId));
    const onChange = () => setMuted(isSoundsMuted(userId));
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, [userId]);
  return [muted, (m: boolean) => setSoundsMuted(m, userId)];
}

// Play win / lose / draw once when a game's winner first appears.
// `winner` is a player id, or the string 'draw'. Skips the first render
// so opening a finished game does not jingle.
export function useWinnerSound(winner: string | null | undefined, myId?: string | null) {
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const p = prev.current;
    prev.current = winner;
    if (p === undefined) return;
    if (!winner || p === winner) return;
    if (winner === 'draw') playSound('draw');
    else playSound(winner === myId ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner]);
}

// Play a soft "your turn" chime when the turn first passes to me.
export function useTurnSound(myTurn: boolean, active: boolean) {
  const prev = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const p = prev.current;
    prev.current = myTurn;
    if (p === undefined) return;
    if (myTurn && !p && active) playSound('turn');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, active]);
}

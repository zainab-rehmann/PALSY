// Game sounds for PALSY — one reusable Web Audio helper (Saturday's
// Simon Says reuses this too). No audio files, no new dependencies:
// small oscillator note sequences, played locally only. Nothing about
// sounds is ever synced — a sound plays on the device that caused it
// (your tap) or when shared game state changes on your screen (your
// friend's move, a win). Mute is per-device, persisted in localStorage,
// default ON (sounds play). Sounds must never break a game: every call
// is wrapped so a missing AudioContext just means silence.
'use client';
import { useEffect, useRef, useState } from 'react';

export type SoundKind = 'pop' | 'correct' | 'wrong' | 'win' | 'lose' | 'draw' | 'card' | 'claim' | 'turn' | 'round';

const MUTE_KEY = 'palsy-sounds-muted';
const CHANGED_EVENT = 'palsy-sounds-changed';

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

export function isSoundsMuted(): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundsMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
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
  } catch {
    // Sounds must never break the game.
  }
}

// React hook: current mute state, live-updates when any toggle changes it.
export function useSoundsMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(isSoundsMuted());
    const onChange = () => setMuted(isSoundsMuted());
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, []);
  return [muted, setSoundsMuted];
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

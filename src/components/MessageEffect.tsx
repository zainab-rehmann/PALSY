// PALSY — message effect burst (2-week plan, Wed 2026-11-25).
//
// One short celebration overlay: pieces rise from the bottom of the
// screen and fade away, then the component removes itself (onDone).
// Used by DMs + rooms for both picked effects and magic words.
// pointer-events-none, so it never blocks taps; solid colours only,
// no blur/glow (her standing rule). Keyframes are inline, the same
// pattern the dashboard + friends pages already use.
'use client';
import { useEffect, useMemo } from 'react';
import { messageEffectDef, type MessageEffectId } from '@/lib/messageEffects';

export default function MessageEffect({
  effect,
  onDone,
}: {
  effect: MessageEffectId;
  onDone: () => void;
}) {
  const def = messageEffectDef(effect);
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: 4 + Math.random() * 92, // % across the screen
        delay: Math.random() * 0.35, // seconds before this piece starts
        duration: 1.4 + Math.random() * 0.9,
        size: 16 + Math.random() * 14,
        char: def.pieces[i % def.pieces.length],
        color: def.colors[i % def.colors.length],
      })),
    [def],
  );
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
    >
      <style>{`@keyframes msg-effect-rise{0%{transform:translateY(0) rotate(0deg) scale(0.6);opacity:0}12%{opacity:1}100%{transform:translateY(-46vh) rotate(340deg) scale(1.05);opacity:0}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            bottom: '-8%',
            fontSize: p.size,
            color: p.color,
            animation: `msg-effect-rise ${p.duration}s ease-out ${p.delay}s forwards`,
          }}
        >
          {p.char}
        </span>
      ))}
    </div>
  );
}

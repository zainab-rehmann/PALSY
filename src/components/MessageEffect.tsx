// PALSY — message effect keyframes + particles (2-week plan, Wed 2026-11-25,
// REDONE Fri 2026-11-27 as Instagram-style animated bubbles,
// RE-REDONE Fri 2026-11-27 after Zainab said the redo was not satisfying).
//
// The first redo only wobbled the bubble and flashed its colour, with no
// particles and no lasting look — and it played twice on the sender's
// screen. This version: one snappy pop (~650–700ms, 0.6 → 1.15 overshoot),
// small solid particles bursting FROM the bubble itself, and a lasting
// solid tint the bubble keeps afterwards (the tint + tap-to-replay live
// in the pages; the keyframes land on --fx-tint so the settle is exact).
//
// The keyframes animate transform + background-color only, using three
// CSS variables set on the bubble: --fx-tint (its lasting tint — the
// animation lands on it), --fx-accent and --fx-accent2 (solid flash
// colours). Solid colours only, no blur/glow/transparency (her standing
// rule). No emoji anywhere — particles are plain CSS/SVG shapes.
'use client';

import type { CSSProperties } from 'react';
import {
  EFFECT_PARTICLES,
  messageEffectDef,
  type MessageEffectId,
  type ParticleShape,
} from '@/lib/messageEffects';

export function MessageEffectStyles() {
  return (
    <style>{`
@keyframes msg-fx-confetti{
  0%{transform:scale(.6) rotate(-4deg);background-color:var(--fx-accent)}
  30%{transform:scale(1.15) rotate(1.5deg);background-color:var(--fx-accent2)}
  55%{transform:scale(.98) rotate(0deg);background-color:var(--fx-tint)}
  100%{transform:scale(1) rotate(0deg);background-color:var(--fx-tint)}
}
@keyframes msg-fx-hearts{
  0%{transform:scale(.6);background-color:var(--fx-accent)}
  25%{transform:scale(1.16);background-color:var(--fx-accent2)}
  45%{transform:scale(.97);background-color:var(--fx-tint)}
  65%{transform:scale(1.08);background-color:var(--fx-tint)}
  100%{transform:scale(1);background-color:var(--fx-tint)}
}
@keyframes msg-fx-fire{
  0%{transform:scale(.7) translateY(5px);background-color:var(--fx-accent2)}
  30%{transform:scale(1.14) translateY(-2px);background-color:var(--fx-accent)}
  55%{transform:scale(.99) translateY(0);background-color:var(--fx-tint)}
  100%{transform:scale(1) translateY(0);background-color:var(--fx-tint)}
}
@keyframes msg-fx-stars{
  0%{transform:scale(.65);background-color:var(--fx-accent2)}
  30%{transform:scale(1.13);background-color:var(--fx-accent)}
  55%{transform:scale(.98);background-color:var(--fx-tint)}
  100%{transform:scale(1);background-color:var(--fx-tint)}
}
@keyframes msg-fx-particle{
  0%{transform:translate(0,0) scale(.5) rotate(0deg);opacity:1}
  100%{transform:translate(var(--dx),var(--dy)) scale(1) rotate(var(--rot));opacity:0}
}
`}</style>
  );
}

// One solid particle shape, centred on its point. The outer span (in
// EffectParticles) carries the flight; this inner piece is just the shape.
function ParticleShapeEl({ shape, size, color }: { shape: ParticleShape; size: number; color: string }) {
  const base: CSSProperties = { position: 'absolute', left: 0, top: 0, transform: 'translate(-50%,-50%)' };
  if (shape === 'heart') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={base} aria-hidden="true">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={color} />
      </svg>
    );
  }
  if (shape === 'flame') {
    // Teardrop pointing up: sharp corner top-left, rotated 45°.
    return <span style={{ ...base, width: size, height: size, background: color, borderRadius: '0 50% 50% 50%', transform: 'translate(-50%,-50%) rotate(45deg)' }} />;
  }
  if (shape === 'star') {
    return (
      <span
        style={{
          ...base,
          width: size,
          height: size,
          background: color,
          clipPath: 'polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)',
        }}
      />
    );
  }
  if (shape === 'circle') {
    return <span style={{ ...base, width: size, height: size, background: color, borderRadius: '50%' }} />;
  }
  return <span style={{ ...base, width: size, height: Math.round(size * 0.7), background: color, borderRadius: 2 }} />;
}

// Small solid particles bursting from the bubble while its effect plays.
// Rendered inside the bubble (which is position:relative); the layer
// covers the bubble, particles fly outward past its edges and fade fast.
// delayMs is the same negative carry-over as the bubble animation, so a
// play carried onto the real saved row resumes mid-flight, not from zero.
export function EffectParticles({ effect, delayMs = 0 }: { effect: MessageEffectId; delayMs?: number }) {
  const def = messageEffectDef(effect);
  const parts = EFFECT_PARTICLES[effect];
  return (
    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}>
      {parts.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: 0,
              height: 0,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
              animation: `msg-fx-particle ${def.durationMs}ms ease-out ${p.delay + delayMs}ms 1 forwards`,
            } as CSSProperties
          }
        >
          <ParticleShapeEl shape={p.shape} size={p.size} color={p.color} />
        </span>
      ))}
    </span>
  );
}

export default MessageEffectStyles;

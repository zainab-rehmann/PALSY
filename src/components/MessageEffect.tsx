// PALSY — message effect keyframes (2-week plan, Wed 2026-11-25,
// REDONE Fri 2026-11-27 as Instagram-style animated bubbles).
//
// The first version was a full-screen emoji burst overlay. Zainab
// corrected it: the effect is the MESSAGE BUBBLE itself changing
// appearance in animation. So this file now only holds the keyframes
// (rendered once per chat page via <MessageEffectStyles/>) plus the
// bubble animation. The pages apply the animation to a bubble with
// bubbleEffectStyle() from src/lib/messageEffects.ts when a message
// with an effect is new, and remove it after one play.
//
// The keyframes animate transform + background-color only, using three
// CSS variables set on the bubble: --fx-bg (its normal background —
// the animation lands back on it, so the bubble settles exactly where
// it started), --fx-accent and --fx-accent2 (solid flash colours).
// Solid colours only, no blur/glow/transparency (her standing rule).
'use client';

export function MessageEffectStyles() {
  return (
    <style>{`
@keyframes msg-fx-confetti{
  0%{transform:scale(.45) rotate(-5deg);background-color:var(--fx-accent)}
  35%{transform:scale(1.14) rotate(2deg);background-color:var(--fx-accent2)}
  60%{transform:scale(.96) rotate(0deg);background-color:var(--fx-bg)}
  80%{transform:scale(1.03);background-color:var(--fx-bg)}
  100%{transform:scale(1) rotate(0deg);background-color:var(--fx-bg)}
}
@keyframes msg-fx-hearts{
  0%{transform:scale(1);background-color:var(--fx-bg)}
  20%{transform:scale(1.16);background-color:var(--fx-accent)}
  35%{transform:scale(.94);background-color:var(--fx-bg)}
  55%{transform:scale(1.1);background-color:var(--fx-accent2)}
  75%{transform:scale(.98);background-color:var(--fx-bg)}
  100%{transform:scale(1);background-color:var(--fx-bg)}
}
@keyframes msg-fx-fire{
  0%{transform:scale(.85) translateY(6px);background-color:var(--fx-accent2)}
  30%{transform:scale(1.1) translateY(-2px);background-color:var(--fx-accent)}
  55%{transform:scale(.98) translateX(2px);background-color:var(--fx-bg)}
  70%{transform:scale(1.02) translateX(-2px);background-color:var(--fx-bg)}
  100%{transform:scale(1) translateX(0) translateY(0);background-color:var(--fx-bg)}
}
@keyframes msg-fx-stars{
  0%{transform:scale(.9);background-color:var(--fx-accent2)}
  30%{transform:scale(1.06);background-color:var(--fx-accent)}
  55%{transform:scale(.97);background-color:var(--fx-bg)}
  80%{transform:scale(1.03);background-color:var(--fx-bg)}
  100%{transform:scale(1);background-color:var(--fx-bg)}
}
`}</style>
  );
}

export default MessageEffectStyles;

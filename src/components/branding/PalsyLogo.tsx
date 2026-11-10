'use client';
import React from 'react';

export function PalsyLogoIcon({ size = 48, className = '', colorful = false }: { size?: number; className?: string; colorful?: boolean }) {
  // 'colorful' swaps the near-black outline for each bubble's own colour,
  // so the mark stays colourful at small (mobile) sizes, where the dark
  // outline would otherwise swallow the pastel fills.
  const outlineBlue = colorful ? '#7CA8E8' : '#1a0a10';
  const outlinePink = colorful ? '#F0A6C6' : '#1a0a10';
  const outlineHeart = colorful ? '#E8A93D' : '#2a1a00';
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <radialGradient id="bgr" cx="38%" cy="35%" r="62%">
          <stop offset="0%" stopColor="#E8F4FF"/>
          <stop offset="100%" stopColor="#A9C9F5"/>
        </radialGradient>
        <radialGradient id="pgr" cx="38%" cy="35%" r="62%">
          <stop offset="0%" stopColor="#FDE8F0"/>
          <stop offset="100%" stopColor="#F2BBD2"/>
        </radialGradient>
      </defs>
      {/* Pink bubble back */}
      <ellipse cx="128" cy="112" rx="58" ry="54" fill={outlinePink} transform="rotate(-10 128 112)"/>
      <ellipse cx="128" cy="110" rx="52" ry="48" fill="url(#pgr)" transform="rotate(-10 128 110)"/>
      <path d="M100 148 Q88 168 76 172 Q90 162 96 148 Z" fill={outlinePink}/>
      <path d="M102 148 Q92 164 82 167 Q94 159 99 148 Z" fill="url(#pgr)"/>
      {/* Blue bubble front */}
      <circle cx="85" cy="102" r="62" fill={outlineBlue}/>
      <circle cx="85" cy="100" r="56" fill="url(#bgr)"/>
      <path d="M58 148 Q42 172 30 178 Q46 164 54 148 Z" fill={outlineBlue}/>
      <path d="M60 148 Q46 168 36 172 Q50 160 57 148 Z" fill="url(#bgr)"/>
      {/* Eyes */}
      <ellipse cx="73" cy="93" rx="7" ry="8" fill="#1a1a2e"/>
      <ellipse cx="73" cy="91.5" rx="2.5" ry="2.5" fill="white" fillOpacity="0.4"/>
      <ellipse cx="96" cy="90" rx="7" ry="8" fill="#1a1a2e"/>
      <ellipse cx="96" cy="88.5" rx="2.5" ry="2.5" fill="white" fillOpacity="0.4"/>
      {/* Smile */}
      <path d="M68 108 Q84 122 101 108" stroke="#1a1a2e" strokeWidth="5" fill="none" strokeLinecap="round"/>
      {/* Heart */}
      <path d="M94 46 C94 36 82 30 76 38 C70 30 58 36 58 46 C58 56 76 70 76 70 C76 70 94 56 94 46 Z" fill={outlineHeart} transform="translate(14,-6) scale(0.95)"/>
      <path d="M94 46 C94 36 82 30 76 38 C70 30 58 36 58 46 C58 56 76 70 76 70 C76 70 94 56 94 46 Z" fill="#FFD97D" transform="translate(15,-5) scale(0.88)"/>
    </svg>
  );
}

export function PalsyWordmark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`} style={{ fontSize: size, color: 'var(--color-text)', fontFamily: "'Nunito', sans-serif" }}>
      palsy
    </span>
  );
}

export function PalsyLogo({ iconSize = 36, textSize = 28, showTagline = false, className = '', colorful = false }: {
  iconSize?: number; textSize?: number; showTagline?: boolean; className?: string; colorful?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <PalsyLogoIcon size={iconSize} colorful={colorful}/>
      <div className="flex flex-col leading-none">
        <PalsyWordmark size={textSize}/>
        {showTagline && (
          <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 500, letterSpacing: '0.5px', marginTop: 2 }}>
            your little corner of friendship. ♡
          </span>
        )}
      </div>
    </div>
  );
}


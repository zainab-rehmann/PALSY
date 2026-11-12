'use client';

import { useState } from 'react';
import { Lock, KeyRound, X } from 'lucide-react';

// Friendly prompt shown when a non-member tries to enter a room that
// has an entry code. The parent verifies the code (server-side check)
// and reports back whether it matched.
export default function EntryCodePrompt({
  roomName,
  accentColor,
  error,
  busy,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  roomName: string;
  accentColor: string;
  error: string;
  busy: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [code, setCode] = useState('');

  return (
    <div className="w-full max-w-sm mx-auto rounded-3xl p-6 space-y-4 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--color-secondary)', color: accentColor }}>
        <Lock size={26} />
      </div>
      <div>
        <p className="font-black text-lg theme-text">This room is locked 🔑</p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-bold" style={{ color: 'var(--color-text)' }}>{roomName}</span> has an entry code.
          Ask a member for it, then type it below to come in ♡
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onSubmit(code);
        }}
        className="space-y-3"
      >
        <div className="relative">
          <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ENTRY CODE"
            autoFocus
            maxLength={8}
            className="theme-input w-full py-3 pl-11 pr-4 text-center font-mono tracking-[0.3em] uppercase text-base"
          />
        </div>
        {error && (
          <p className="text-sm font-bold" style={{ color: '#FF6B6B' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="theme-btn w-full py-3 text-sm"
          style={{ opacity: busy || code.trim().length < 4 ? 0.6 : 1 }}
        >
          {busy ? 'Checking…' : submitLabel}
        </button>
      </form>
      <button onClick={onCancel} className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
        <X size={13} /> Not now
      </button>
      <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
        Already a member? You never need the code — members always come straight in.
      </p>
    </div>
  );
}

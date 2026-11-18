'use client';

// PollForm — the "ask a question" sheet above the composer (rooms +
// DMs share it). Question + 2–4 options; Create is disabled until
// the question and at least two options are filled in. The chat page
// owns the actual insert — this component only collects the poll.
import { useState } from 'react';
import { X } from 'lucide-react';

export function PollForm({ accentColor, onCreate, onCancel }: {
  accentColor: string;
  onCreate: (question: string, options: string[]) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && filled.length >= 2;

  function setOption(i: number, v: string) {
    setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  }

  return (
    <div className="absolute left-4 right-4 z-30 rounded-2xl p-4 space-y-3" style={{ bottom: 'calc(100% + 8px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
      <div className="flex items-center gap-2">
        <p className="font-black text-sm flex-1 theme-text">📊 Ask a question</p>
        <button type="button" onClick={onCancel} className="p-1.5 rounded-full" style={{ background: 'var(--color-secondary)' }} title="Close">
          <X size={14} />
        </button>
      </div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Your question…"
        maxLength={140}
        className="theme-input w-full py-2.5 px-3 text-sm"
      />
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={o}
            onChange={(e) => setOption(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
            maxLength={60}
            className="theme-input flex-1 py-2.5 px-3 text-sm"
          />
          {options.length > 2 && (
            <button type="button" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} className="p-2 rounded-full text-xs font-bold" style={{ background: 'var(--color-secondary)', color: 'var(--color-text-muted)' }} title="Remove option">
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {options.length < 4 && (
        <button type="button" onClick={() => setOptions((prev) => [...prev, ''])} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: `${accentColor}22`, color: accentColor }}>
          + Add option
        </button>
      )}
      <button type="button" disabled={!canCreate} onClick={() => onCreate(question.trim(), filled)} className="theme-btn w-full py-2.5 text-sm" style={{ opacity: canCreate ? 1 : 0.5 }}>
        Create poll
      </button>
    </div>
  );
}

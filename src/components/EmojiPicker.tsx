'use client';

import { useMemo, useRef, useState } from 'react';
import { EMOJI_GROUPS, EMOJI_TOTAL } from '@/lib/emojiData';

// Emoji panel for the chat composer — tap an emoji to insert it
// into the message being typed. Ten groups with tabs and a name
// search, WhatsApp-style. Solid theme colours only, like the
// rest of PALSY. The parent owns open/close; this panel only calls
// onPick. (The Enter key in the search box must not submit the
// composer's form, so it is swallowed.)
//
// The set is the full standard emoji list (see src/lib/emojiData.ts).
// Only one group renders at a time so the panel stays fast.
const SEARCH_CAP = 200;

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(EMOJI_GROUPS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  // Match whole words by prefix ("cat" finds cat faces, not "vacation").
  // A longer query word also matches a shorter name word ("cats" finds "cat").
  const qWords = q.split(/\s+/).filter(Boolean);
  const results = useMemo(() => {
    if (!q) return [];
    const out: { e: string; n: string; group: string }[] = [];
    for (const g of EMOJI_GROUPS) {
      for (const item of g.emojis) {
        const words = item.n.split(/[^a-z0-9]+/).filter(Boolean);
        if (qWords.every(qw => words.some(w => w.startsWith(qw) || (qw.length >= 4 && w.length >= 3 && qw.startsWith(w))))) {
          out.push({ ...item, group: g.label });
        }
      }
    }
    return out;
  }, [q, qWords]);
  const shown = results.slice(0, SEARCH_CAP);
  const activeGroup = EMOJI_GROUPS.find(g => g.id === active) || EMOJI_GROUPS[0];

  function jumpTo(id: string) {
    setQuery('');
    setActive(id);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        boxShadow: '0 8px 28px var(--color-primary-alpha)',
        width: 340,
        maxWidth: '92vw',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div className="p-2 pb-1">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: 'var(--color-secondary)', borderRadius: 12 }}
        >
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder={`Search ${EMOJI_TOTAL.toLocaleString()} emojis… try “cat”`}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm theme-text"
            style={{ color: 'var(--color-text)' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-0.5 px-2 pb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {EMOJI_GROUPS.map(g => (
          <button
            key={g.id}
            type="button"
            title={g.label}
            onClick={() => jumpTo(g.id)}
            className="flex-1 text-lg py-1.5 rounded-lg transition-all"
            style={{
              background: active === g.id && !q ? 'var(--color-secondary)' : 'transparent',
              opacity: active === g.id && !q ? 1 : 0.55,
              transform: active === g.id && !q ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            {g.icon}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div
        ref={scrollRef}
        className="p-2 pt-1"
        style={{ maxHeight: 300, overflowY: 'auto', position: 'relative' }}
      >
        {q ? (
          results.length > 0 ? (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider px-1 pb-1"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {results.length > SEARCH_CAP
                  ? `Showing ${SEARCH_CAP} of ${results.length} results — keep typing to narrow it down ♡`
                  : `${results.length} result${results.length === 1 ? '' : 's'}`}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {shown.map((item, i) => (
                  <button
                    key={`${item.e}-${i}`}
                    type="button"
                    title={item.n}
                    onClick={() => onPick(item.e)}
                    className="text-[22px] p-1 rounded-lg transition-transform hover:scale-125"
                    style={{ lineHeight: 1.2 }}
                  >
                    {item.e}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-center py-6" style={{ color: 'var(--color-text-muted)' }}>
              No matches for “{query.trim()}” — try another word ♡
            </p>
          )
        ) : (
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-wider px-1 py-1 sticky top-0 z-10"
              style={{ color: 'var(--color-text-muted)', background: 'var(--color-surface)' }}
            >
              {activeGroup.label} · {activeGroup.emojis.length}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {activeGroup.emojis.map(item => (
                <button
                  key={item.e}
                  type="button"
                  title={item.n}
                  onClick={() => onPick(item.e)}
                  className="text-[22px] p-1 rounded-lg transition-transform hover:scale-125"
                  style={{ lineHeight: 1.2 }}
                >
                  {item.e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

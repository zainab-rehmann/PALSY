'use client';

// Emoji panel for the chat composer — tap an emoji to insert it
// into the message being typed. Grouped so friends can find the
// cute ones fast. Solid theme colours only, like the rest of PALSY.

const GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Faces', emojis: ['😊', '😂', '🥰', '😍', '🤗', '🥺', '😭', '😴', '🤔', '😎', '🙃', '😇', '🤩', '😋', '😜', '🫶'] },
  { label: 'Hearts', emojis: ['❤️', '💕', '💖', '💗', '💓', '💘', '💝', '🧡', '💛', '💚', '💙', '💜', '🤍', '🩷'] },
  { label: 'Hands & fun', emojis: ['👍', '👏', '🙏', '👋', '✌️', '🤞', '🎉', '🔥', '✨', '⭐', '🌈', '🍀', '🎀', '💯'] },
  { label: 'Cute things', emojis: ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐷', '🐥', '🌸', '🌷', '🍓', '🍰', '🧸', '☁️'] },
];

export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div
      className="p-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        boxShadow: '0 8px 28px var(--color-primary-alpha)',
        width: 320,
        maxWidth: '86vw',
        maxHeight: 264,
        overflowY: 'auto',
      }}
    >
      {GROUPS.map(group => (
        <div key={group.label} className="mb-2 last:mb-0">
          <div
            className="text-[10px] font-bold uppercase tracking-wider px-1 pb-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {group.label}
          </div>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emojis.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => onPick(emoji)}
                className="text-xl p-1 rounded-lg transition-transform hover:scale-125"
                style={{ lineHeight: 1.2 }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

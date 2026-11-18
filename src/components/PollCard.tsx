'use client';

// PollCard — the poll inside a chat bubble (rooms + DMs share it).
// Shows the question, every option with its live vote count and a
// fill bar, and your own vote. Tap an option to vote (or change your
// vote); tap your voted option again to take your vote back. Votes
// arrive live through the poll_votes realtime subscription in the
// chat page — this component only renders what it is given.
import type { PollVote } from '@/types';

export function PollCard({ poll, votes, myId, accentColor, onVote }: {
  poll: { question: string; options: string[] } | null | undefined;
  votes: PollVote[];
  myId: string | undefined | null;
  accentColor: string;
  onVote: (optionIndex: number) => void;
}) {
  const options: string[] = poll?.options || [];
  const total = votes.length;
  const myVote = votes.find((v) => v.user_id === myId)?.option_index ?? null;
  return (
    <div className="w-full min-w-[220px]">
      <p className="font-black text-sm flex items-center gap-1.5">📊 Poll</p>
      <p className="font-bold text-sm mt-0.5">{poll?.question || 'Poll'}</p>
      <div className="space-y-1.5 mt-2">
        {options.map((opt, i) => {
          const count = votes.filter((v) => v.option_index === i).length;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = myVote === i;
          return (
            <button key={i} type="button" onClick={(e) => { e.stopPropagation(); onVote(i); }}
              className="block w-full text-left rounded-xl overflow-hidden border"
              style={{ borderColor: mine ? accentColor : 'var(--color-border)' }}
              title={mine ? 'Tap again to remove your vote' : 'Tap to vote'}>
              <span className="relative block px-2.5 py-1.5 text-xs font-bold">
                <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: `${accentColor}33` }} />
                <span className="relative flex justify-between gap-2">
                  <span>{opt}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{count} · {pct}%</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
        {total} vote{total === 1 ? '' : 's'}{myVote !== null ? ' · you voted — tap again to remove' : ' · tap an option to vote'}
      </p>
    </div>
  );
}

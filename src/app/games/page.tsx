'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import { DesktopNav, MobileNav } from '@/components/layout/AppLayout';
import { Gamepad2, Hash, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function GamesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<{ id: string; name: string; preset: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) { router.replace('/login'); return; }
      setProfile(prof);
      document.documentElement.setAttribute('data-theme', prof.theme || 'blue');
      const { data: memberOf } = await supabase.from('room_members').select('room_id').eq('user_id', user.id);
      if (memberOf && memberOf.length > 0) {
        const { data: roomData } = await supabase.from('rooms').select('id,name,preset').in('id', memberOf.map(m => m.room_id));
        setRooms(roomData || []);
      }
      setLoading(false);
    })();
  }, [router]);

  const PRESETS: Record<string, { emoji: string }> = {
    'cloudy-blue': { emoji: '☁️' }, 'strawberry-milk': { emoji: '🍓' }, 'lavender-dreams': { emoji: '💜' },
    'peachy': { emoji: '🍑' }, 'minty-fresh': { emoji: '🌿' }, 'cotton-candy': { emoji: '🩷' },
  };

  const GAMES = [
    { id: 'tictactoe', emoji: '⭕', name: 'Tic Tac Toe', desc: 'Classic 3x3 strategy. First to get 3 in a row wins!', players: '2 players' },
    { id: 'rps', emoji: '✊', name: 'Rock Paper Scissors', desc: 'Choose your weapon and beat your friend!', players: '2 players' },
    { id: 'number-guess', emoji: '🔢', name: 'Number Guess', desc: 'Guess the secret number between 1 and 100!', players: 'Multiplayer' },
    { id: 'hangman', emoji: '🔡', name: 'Hangman', desc: 'Guess the hidden word letter by letter before it\'s too late!', players: 'Multiplayer' },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0, 1, 2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-accent)', animation: 'float 1s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;

  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/games" />
      <main className="md:ml-60 pb-24 md:pb-8">
        <header className="sticky top-0 z-30 px-4 py-4 md:px-8 flex items-center" style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
          <h1 className="text-lg font-black theme-text flex items-center gap-2"><Gamepad2 size={20} style={{ color: 'var(--color-accent)' }} />Games</h1>
        </header>

        <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
          {/* Game info */}
          <div className="theme-card p-5">
            <p className="font-black theme-text mb-1">Play with your friends! 🎮</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Games are played inside rooms. Open a room, go to the Games tab, and start playing!</p>
          </div>

          {/* Available games */}
          <div>
            <h2 className="font-black text-sm mb-3 theme-text">Available Games</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GAMES.map(g => (
                <div key={g.id} className="theme-card p-5 flex gap-4 items-start">
                  <div className="text-4xl">{g.emoji}</div>
                  <div className="flex-1">
                    <p className="font-black theme-text">{g.name}</p>
                    <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>{g.desc}</p>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--color-secondary)', color: 'var(--color-accent)' }}>{g.players}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Room shortcuts */}
          <div>
            <h2 className="font-black text-sm mb-3 theme-text">Play in a Room</h2>
            {rooms.length === 0 ? (
              <div className="theme-card p-8 text-center space-y-3">
                <div className="text-4xl">🏠</div>
                <p className="font-bold theme-text">No rooms yet!</p>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Create or join a room to start playing games with friends.</p>
                <Link href="/rooms" className="theme-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm"><Hash size={15} />Go to Rooms</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map(r => (
                  <Link key={r.id} href={`/rooms/${r.id}?tab=games`} className="theme-card p-4 flex items-center gap-3 hover:scale-[1.01] transition-all">
                    <div className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl" style={{ background: 'var(--color-secondary)' }}>
                      {r.preset && PRESETS[r.preset]?.emoji || '🏠'}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm theme-text">{r.name}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Play games here</p>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav active="/games" />
    </div>
  );
}


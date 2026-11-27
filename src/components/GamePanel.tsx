'use client';

// GamePanel — the twelve game boards, loaded on demand.
// The DM and room pages used to import all of GameComponents statically,
// so every chat visit downloaded every game. Each board is now a
// next/dynamic chunk: it loads the first time a game opens and never
// before. (All twelve resolve to the one GameComponents chunk, fetched
// once.) The pure game logic stays in @/lib/gameLogic.
import dynamic from 'next/dynamic';
import type { Profile, Game } from '@/types';

function GameLoading() {
  return (
    <div className="p-6 rounded-2xl text-center text-sm font-bold theme-text" style={{ background: 'var(--color-surface)' }}>
      Loading game… 🎮
    </div>
  );
}

const TicTacToe = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.TicTacToe })), { ssr: false, loading: GameLoading });
const RPS = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.RPS })), { ssr: false, loading: GameLoading });
const NumberGuess = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.NumberGuess })), { ssr: false, loading: GameLoading });
const Hangman = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.Hangman })), { ssr: false, loading: GameLoading });
const DrawGuess = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.DrawGuess })), { ssr: false, loading: GameLoading });
const TriviaDuel = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.TriviaDuel })), { ssr: false, loading: GameLoading });
const DotsBoxes = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.DotsBoxes })), { ssr: false, loading: GameLoading });
const CrazyEights = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.CrazyEights })), { ssr: false, loading: GameLoading });
const WordleDuel = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.WordleDuel })), { ssr: false, loading: GameLoading });
const Checkers = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.Checkers })), { ssr: false, loading: GameLoading });
const CategoriesDuel = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.CategoriesDuel })), { ssr: false, loading: GameLoading });
const SimonSays = dynamic(() => import('@/components/GameComponents').then(m => ({ default: m.SimonSays })), { ssr: false, loading: GameLoading });

export default function GamePanel({ gameType, game, state, profile, accentColor, canPlay, players, opponentName, onUpdate }: {
  gameType: string | null; game: Game | null; state: any; profile: Profile | null;
  accentColor: string; canPlay: boolean; players: any[]; opponentName: string;
  onUpdate: (s: any) => void;
}) {
  if (!gameType || !game) return null;
  if (gameType === 'tictactoe') return <TicTacToe game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'rps') return <RPS game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} onUpdate={onUpdate} />;
  if (gameType === 'number-guess') return <NumberGuess game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'hangman') return <Hangman game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'draw-guess') return <DrawGuess game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'trivia') return <TriviaDuel game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'dots-boxes') return <DotsBoxes game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'crazy-eights') return <CrazyEights game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'wordle') return <WordleDuel game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'checkers') return <Checkers game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'categories') return <CategoriesDuel game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} players={players} opponentName={opponentName} onUpdate={onUpdate} />;
  if (gameType === 'simon-says') return <SimonSays game={game} state={state} profile={profile} accentColor={accentColor} canPlay={canPlay} onUpdate={onUpdate} />;
  return null;
}

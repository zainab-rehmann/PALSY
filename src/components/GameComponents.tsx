'use client';

// Shared game framework for PALSY: the game components, word/question
// banks and state helpers used by BOTH room games (GamesTab) and DM
// games (DMGamesPanel). One source of truth — a fix here fixes both.
import { useEffect, useState, useRef, type PointerEvent as RPointerEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Eraser } from 'lucide-react';

const DRAW_WORDS: { w: string; hint: string }[] = [
  { w: 'cat', hint: 'animal' }, { w: 'dog', hint: 'animal' }, { w: 'butterfly', hint: 'animal' },
  { w: 'elephant', hint: 'animal' }, { w: 'fish', hint: 'animal' }, { w: 'bird', hint: 'animal' },
  { w: 'rabbit', hint: 'animal' }, { w: 'lion', hint: 'animal' }, { w: 'turtle', hint: 'animal' },
  { w: 'penguin', hint: 'animal' },
  { w: 'pizza', hint: 'food' }, { w: 'banana', hint: 'food' }, { w: 'cupcake', hint: 'food' },
  { w: 'apple', hint: 'food' }, { w: 'carrot', hint: 'food' }, { w: 'cake', hint: 'food' },
  { w: 'strawberry', hint: 'food' }, { w: 'cookie', hint: 'food' },
  { w: 'house', hint: 'thing' }, { w: 'car', hint: 'thing' }, { w: 'bicycle', hint: 'thing' },
  { w: 'sun', hint: 'thing' }, { w: 'moon', hint: 'thing' }, { w: 'star', hint: 'thing' },
  { w: 'umbrella', hint: 'thing' }, { w: 'key', hint: 'thing' }, { w: 'book', hint: 'thing' },
  { w: 'balloon', hint: 'thing' }, { w: 'chair', hint: 'thing' }, { w: 'tree', hint: 'thing' },
  { w: 'flower', hint: 'thing' }, { w: 'boat', hint: 'thing' }, { w: 'airplane', hint: 'thing' },
  { w: 'guitar', hint: 'thing' }, { w: 'hat', hint: 'thing' }, { w: 'clock', hint: 'thing' },
  { w: 'rainbow', hint: 'thing' }, { w: 'snowman', hint: 'thing' },
];

// Trivia Duel question bank: well-known, unambiguous facts only.
// `answer` is the index of the correct option.
const TRIVIA_BANK: { q: string; options: string[]; answer: number; cat: string }[] = [
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answer: 1, cat: 'Science' },
  { q: 'What is H2O commonly known as?', options: ['Salt', 'Oxygen', 'Water', 'Hydrogen'], answer: 2, cat: 'Science' },
  { q: 'How many legs does a spider have?', options: ['6', '8', '10', '4'], answer: 1, cat: 'Science' },
  { q: 'What force keeps us on the ground?', options: ['Magnetism', 'Friction', 'Inertia', 'Gravity'], answer: 3, cat: 'Science' },
  { q: 'What is the chemical symbol for gold?', options: ['Au', 'Ag', 'Gd', 'Go'], answer: 0, cat: 'Science' },
  { q: 'Which gas do plants absorb from the air?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], answer: 1, cat: 'Science' },
  { q: 'How many continents are there on Earth?', options: ['5', '6', '7', '8'], answer: 2, cat: 'Science' },
  { q: 'What is the largest organ of the human body?', options: ['Heart', 'Liver', 'Skin', 'Lung'], answer: 2, cat: 'Science' },
  { q: 'At what temperature (Celsius) does water boil at sea level?', options: ['90', '80', '120', '100'], answer: 3, cat: 'Science' },
  { q: 'Which animal is known as man\u2019s best friend?', options: ['Cat', 'Horse', 'Dog', 'Parrot'], answer: 2, cat: 'General Knowledge' },
  { q: 'What does HTTP stand for?', options: ['High Transfer Text Protocol', 'HyperText Transfer Protocol', 'HyperText Transmission Process', 'Home Tool Transfer Protocol'], answer: 1, cat: 'Tech' },
  { q: 'In which year was the first iPhone released?', options: ['2005', '2007', '2009', '2010'], answer: 1, cat: 'Tech' },
  { q: 'Who co-founded Microsoft with Bill Gates?', options: ['Steve Jobs', 'Jeff Bezos', 'Paul Allen', 'Elon Musk'], answer: 2, cat: 'Tech' },
  { q: 'What does CPU stand for?', options: ['Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit', 'Central Processing Unit'], answer: 3, cat: 'Tech' },
  { q: 'Which company makes the Android operating system?', options: ['Apple', 'Samsung', 'Google', 'Microsoft'], answer: 2, cat: 'Tech' },
  { q: 'What does "www" stand for?', options: ['World Web Window', 'Wide World Web', 'Web World Wide', 'World Wide Web'], answer: 3, cat: 'Tech' },
  { q: 'Which language is used to style web pages?', options: ['HTML', 'Python', 'CSS', 'SQL'], answer: 2, cat: 'Tech' },
  { q: 'How many bits are in one byte?', options: ['4', '16', '8', '32'], answer: 2, cat: 'Tech' },
  { q: 'What is the capital of France?', options: ['London', 'Berlin', 'Paris', 'Madrid'], answer: 2, cat: 'General Knowledge' },
  { q: 'How many days are there in a leap year?', options: ['365', '366', '364', '367'], answer: 1, cat: 'General Knowledge' },
  { q: 'Which is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3, cat: 'General Knowledge' },
  { q: 'How many sides does a hexagon have?', options: ['5', '7', '6', '8'], answer: 2, cat: 'General Knowledge' },
  { q: 'What is the largest hot desert in the world?', options: ['Gobi', 'Sahara', 'Arabian', 'Kalahari'], answer: 1, cat: 'General Knowledge' },
  { q: 'Which country is home to the kangaroo?', options: ['India', 'Brazil', 'Australia', 'Kenya'], answer: 2, cat: 'General Knowledge' },
  { q: 'How many minutes are in 2 hours?', options: ['60', '90', '180', '120'], answer: 3, cat: 'General Knowledge' },
  { q: 'What colour do you get by mixing blue and yellow paint?', options: ['Purple', 'Orange', 'Green', 'Brown'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which movie features a ship called the Titanic?', options: ['Avatar', 'Titanic', 'Jaws', 'Moana'], answer: 1, cat: 'Movies' },
  { q: 'Who directed the movie "Jaws"?', options: ['Christopher Nolan', 'James Cameron', 'Steven Spielberg', 'Quentin Tarantino'], answer: 2, cat: 'Movies' },
  { q: 'Which animated film features a snowman named Olaf?', options: ['Moana', 'Tangled', 'Frozen', 'Brave'], answer: 2, cat: 'Movies' },
  { q: 'What is the name of the cowboy in Toy Story?', options: ['Buzz', 'Rex', 'Woody', 'Slinky'], answer: 2, cat: 'Movies' },
  { q: 'Which movie is about a lion cub named Simba?', options: ['Madagascar', 'The Lion King', 'Zootopia', 'Bambi'], answer: 1, cat: 'Movies' },
  { q: 'In which movie would you hear "May the Force be with you"?', options: ['Star Trek', 'Avatar', 'Dune', 'Star Wars'], answer: 3, cat: 'Movies' },
  // Expansion 2026-11-15: 32 -> 72 questions. Same rules: well-known,
  // timeless facts only, exactly one correct option, no duplicates.
  // Categories are rendered generically (a pill with the cat string),
  // so the two new categories below need no other code change.
  { q: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Earth', 'Mars'], answer: 1, cat: 'Science' },
  { q: 'What is known as the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], answer: 2, cat: 'Science' },
  { q: 'How many bones are in the adult human body?', options: ['206', '196', '216', '186'], answer: 0, cat: 'Science' },
  { q: 'Which organ pumps blood around the human body?', options: ['Liver', 'Lung', 'Kidney', 'Heart'], answer: 3, cat: 'Science' },
  { q: 'Which gas makes up most of the air we breathe?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], answer: 1, cat: 'Science' },
  { q: 'How many hearts does an octopus have?', options: ['1', '2', '3', '4'], answer: 2, cat: 'Science' },
  { q: 'What is the fastest land animal?', options: ['Cheetah', 'Lion', 'Horse', 'Gazelle'], answer: 0, cat: 'Science' },
  { q: 'Which part of a plant makes food using sunlight?', options: ['Root', 'Stem', 'Flower', 'Leaf'], answer: 3, cat: 'Science' },
  { q: 'What does RAM stand for?', options: ['Read Access Memory', 'Random Access Memory', 'Rapid Action Machine', 'Run All Memory'], answer: 1, cat: 'Tech' },
  { q: 'Which company created the iPhone?', options: ['Samsung', 'Google', 'Microsoft', 'Apple'], answer: 3, cat: 'Tech' },
  { q: 'What does AI stand for?', options: ['Automated Intelligence', 'Advanced Internet', 'Artificial Intelligence', 'Apple Intelligence'], answer: 2, cat: 'Tech' },
  { q: 'In which year was the World Wide Web invented?', options: ['1989', '1979', '1995', '2001'], answer: 0, cat: 'Tech' },
  { q: 'Which of these is a web browser?', options: ['Microsoft Word', 'Google Chrome', 'Adobe Photoshop', 'Spotify'], answer: 1, cat: 'Tech' },
  { q: 'What does USB stand for?', options: ['United System Board', 'Universal Storage Box', 'Ultra Speed Band', 'Universal Serial Bus'], answer: 3, cat: 'Tech' },
  { q: 'Who co-founded Apple with Steve Jobs?', options: ['Bill Gates', 'Steve Wozniak', 'Elon Musk', 'Jeff Bezos'], answer: 1, cat: 'Tech' },
  { q: 'How many colours are in a rainbow?', options: ['5', '6', '8', '7'], answer: 3, cat: 'General Knowledge' },
  { q: 'What is the largest mammal in the world?', options: ['Elephant', 'Blue whale', 'Giraffe', 'Hippopotamus'], answer: 1, cat: 'General Knowledge' },
  { q: 'How many seconds are in one minute?', options: ['30', '90', '60', '100'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which instrument has 88 keys?', options: ['Guitar', 'Violin', 'Flute', 'Piano'], answer: 3, cat: 'General Knowledge' },
  { q: 'What is the main language spoken in Brazil?', options: ['Spanish', 'French', 'Portuguese', 'Italian'], answer: 2, cat: 'General Knowledge' },
  { q: 'Which season comes after summer?', options: ['Winter', 'Autumn', 'Spring', 'Monsoon'], answer: 1, cat: 'General Knowledge' },
  { q: 'What do caterpillars turn into?', options: ['Butterflies', 'Bees', 'Ants', 'Flies'], answer: 0, cat: 'General Knowledge' },
  { q: 'Which movie features a clownfish named Nemo?', options: ['Up', 'Finding Nemo', 'Inside Out', 'Coco'], answer: 1, cat: 'Movies' },
  { q: 'Who plays Jack Sparrow in Pirates of the Caribbean?', options: ['Brad Pitt', 'Leonardo DiCaprio', 'Tom Cruise', 'Johnny Depp'], answer: 3, cat: 'Movies' },
  { q: 'In the movie Frozen, what is the name of Elsa\u2019s sister?', options: ['Moana', 'Rapunzel', 'Anna', 'Merida'], answer: 2, cat: 'Movies' },
  { q: 'What is the name of the school in Harry Potter?', options: ['Hogwarts', 'Narnia', 'Middle-earth', 'Wonderland'], answer: 0, cat: 'Movies' },
  { q: 'Which movie features a robot named WALL-E?', options: ['Robots', 'Big Hero 6', 'Toy Story', 'WALL-E'], answer: 3, cat: 'Movies' },
  { q: 'What is the capital of Japan?', options: ['Seoul', 'Beijing', 'Bangkok', 'Tokyo'], answer: 3, cat: 'Geography' },
  { q: 'What is the capital of Australia?', options: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], answer: 1, cat: 'Geography' },
  { q: 'Which is the largest country in the world by area?', options: ['China', 'USA', 'Canada', 'Russia'], answer: 3, cat: 'Geography' },
  { q: 'What is the capital of Canada?', options: ['Toronto', 'Ottawa', 'Vancouver', 'Montreal'], answer: 1, cat: 'Geography' },
  { q: 'On which continent is the Sahara Desert?', options: ['Asia', 'Australia', 'Africa', 'South America'], answer: 2, cat: 'Geography' },
  { q: 'Mount Everest sits on the border of Nepal and which other country?', options: ['India', 'Bhutan', 'China', 'Pakistan'], answer: 2, cat: 'Geography' },
  { q: 'Which ocean lies between Europe and North America?', options: ['Atlantic', 'Pacific', 'Indian', 'Arctic'], answer: 0, cat: 'Geography' },
  { q: 'In which sport would you perform a slam dunk?', options: ['Tennis', 'Golf', 'Basketball', 'Cricket'], answer: 2, cat: 'Sports' },
  { q: 'How many players are on a football (soccer) team on the field?', options: ['9', '11', '10', '12'], answer: 1, cat: 'Sports' },
  { q: 'In tennis, what is a score of zero called?', options: ['Duck', 'Nil', 'Blank', 'Love'], answer: 3, cat: 'Sports' },
  { q: 'Which sport uses a shuttlecock?', options: ['Badminton', 'Squash', 'Table tennis', 'Volleyball'], answer: 0, cat: 'Sports' },
  { q: 'How often are the Summer Olympic Games held?', options: ['Every 2 years', 'Every 4 years', 'Every 3 years', 'Every 5 years'], answer: 1, cat: 'Sports' },
  { q: 'In which sport is the Davis Cup competed for?', options: ['Golf', 'Cricket', 'Tennis', 'Rugby'], answer: 2, cat: 'Sports' },
];

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Replay one drawing stroke onto a canvas context.
function drawStrokeOn(ctx: CanvasRenderingContext2D, s: any) {
  const pts: number[][] = s.points || [];
  if (pts.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size || 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], (s.size || 6) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// Crazy Eights helpers: cards are 'AS', '10H', '8D' — rank + suit letter.
// Suits: S spades, H hearts, D diamonds, C clubs.
const CE_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const CE_SUITS = ['S','H','D','C'] as const;
const CE_SUIT_SYMBOL: Record<string,string> = { S:'♠', H:'♥', D:'♦', C:'♣' };
const CE_SUIT_NAME: Record<string,string> = { S:'Spades', H:'Hearts', D:'Diamonds', C:'Clubs' };
function ceRank(card: string): string { return card.slice(0, -1); }
function ceSuit(card: string): string { return card.slice(-1); }
function ceIsRed(card: string): boolean { const s = ceSuit(card); return s === 'H' || s === 'D'; }
function ceNewDeck(): string[] {
  const d: string[] = [];
  for (const s of CE_SUITS) for (const r of CE_RANKS) d.push(r + s);
  return shuffled(d);
}
function cePlayable(card: string, top: string, currentSuit: string): boolean {
  if (!top) return true;
  return ceRank(card) === '8' || ceRank(card) === ceRank(top) || ceSuit(card) === currentSuit;
}

// Deal 7 cards to a player who has no hand yet (the second player
// joining, or a rematch). Never deals a third hand — the game is
// strictly two players.
export function dealCrazyEights(st: any, userId: string): any {
  const hands: Record<string, string[]> = { ...(st.hands || {}) };
  if (hands[userId]) return st;
  if (Object.keys(hands).length >= 2) return st;
  const deck: string[] = [...(st.deck || [])];
  if (deck.length < 7) return st;
  hands[userId] = deck.splice(0, 7);
  return { ...st, hands, deck };
}

export function initialStateFor(type: string, creatorId: string): any {
  if (type === 'tictactoe') return { board: Array(9).fill(null), currentPlayer: creatorId, playerX: creatorId, playerO: null, winner: null };
  if (type === 'rps') return { choices: {}, winner: null, round: 1 };
  if (type === 'number-guess') return { phase: 'choose', setterId: null, guesserId: null, secret: null, guesses: [], winner: null };
  if (type === 'hangman') return { phase: 'choose', setterId: null, guesserId: null, word: null, guessed: [], wrongGuesses: [], maxWrong: 6, winner: null };
  if (type === 'draw-guess') return { phase: 'playing', round: 1, totalRounds: 4, drawerId: creatorId, words: shuffled(DRAW_WORDS).slice(0, 4), scores: {}, guesses: [], strokes: [], roundEndsAt: null, roundResult: null, winner: null };
  if (type === 'trivia') return { phase: 'playing', qi: 0, questions: shuffled(TRIVIA_BANK).slice(0, 5), answers: {}, scores: {}, lastPoints: {}, questionEndsAt: null, winner: null };
  if (type === 'dots-boxes') return { phase: 'playing', turn: creatorId, edges: {}, boxes: {}, scores: {}, lastMoveBy: null, lastClaimed: 0, winner: null };
  if (type === 'crazy-eights') {
    const deck = ceNewDeck();
    const hands: Record<string, string[]> = { [creatorId]: deck.splice(0, 7) };
    // The first discard must not be an 8: cycle 8s to the bottom.
    let top = deck.shift()!;
    while (ceRank(top) === '8') { deck.push(top); top = deck.shift()!; }
    return { phase: 'playing', deck, hands, discard: [top], currentSuit: ceSuit(top), turn: creatorId, winner: null };
  }
  return {};
}


export const GAME_META: Record<string,{emoji:string;name:string;desc:string}> = {
  'tictactoe': { emoji:'⭕', name:'Tic Tac Toe', desc:'2 players' },
  'rps': { emoji:'✊', name:'Rock Paper Scissors', desc:'2 players' },
  'number-guess': { emoji:'🔢', name:'Number Guess', desc:'2 players' },
  'hangman': { emoji:'🔡', name:'Hangman', desc:'2 players' },
  'draw-guess': { emoji:'🎨', name:'Draw & Guess', desc:'2 players' },
  'trivia': { emoji:'🧠', name:'Trivia Duel', desc:'2 players' },
  'dots-boxes': { emoji:'🔲', name:'Dots & Boxes', desc:'2 players' },
  'crazy-eights': { emoji:'🃏', name:'Crazy Eights', desc:'2 players' },
};

export function TicTacToe({ game, state, profile, accentColor, canPlay, onUpdate }: any) {
  async function makeMove(idx: number) {
    if (!profile || !canPlay || !state.playerO || state.board[idx] || state.winner) return;
    if (state.currentPlayer !== profile.id) return;
    const newBoard = [...state.board];
    const symbol = state.playerX === profile.id ? 'X' : 'O';
    newBoard[idx] = { player: profile.id, symbol };
    const winner = checkWinner(newBoard);
    const nextPlayer = state.currentPlayer===state.playerX ? state.playerO : state.playerX;
    const newState = { ...state, board: newBoard, currentPlayer: nextPlayer, winner };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active', winner_id: winner && winner!=='draw' ? winner.player : null }).eq('id', game.id);
    onUpdate(newState);
  }

  function checkWinner(board: any[]) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) {
      if (board[a]&&board[b]&&board[c]&&board[a].player===board[b].player&&board[b].player===board[c].player) return board[a];
    }
    if (board.every(Boolean)) return 'draw';
    return null;
  }

  const myTurn = state.currentPlayer === profile?.id;
  return (
    <div className="space-y-4">
      {state.winner ? (
        <div className="text-center p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{state.winner==='draw'?'It\'s a draw! 🤝':`${state.winner.symbol} wins! 🎉`}</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Tap Restart above to play again together.</p>
        </div>
      ) : !canPlay ? (
        <p className="text-sm font-bold text-center theme-text">Waiting for the second player to join…</p>
      ) : (
        <p className="text-sm font-bold text-center theme-text">{myTurn?'Your turn! ✨':'Waiting for other player...'}</p>
      )}
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {state.board.map((cell: any, i: number)=>(
          <button key={i} onClick={()=>makeMove(i)} disabled={!canPlay || !!state.winner}
            className="aspect-square rounded-2xl text-3xl font-black flex items-center justify-center transition-all hover:scale-105"
            style={{background:cell?`${accentColor}22`:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}44`,color:accentColor,opacity:(!canPlay||state.winner)?0.6:1}}>
            {cell?.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RPS({ game, state, profile, accentColor, canPlay, onUpdate }: any) {
  async function choose(choice: string) {
    if (!profile || !canPlay || state.choices[profile.id]) return;
    const supabase = createClient();
    // Re-read the freshest state first: both players often choose at the
    // same moment, and writing from a stale snapshot would erase the
    // other player's choice, leaving both screens stuck on "Waiting".
    const { data: fresh } = await supabase.from('games').select('state').eq('id', game.id).single();
    const base = (fresh?.state as any) || state;
    if (base.choices?.[profile.id]) { onUpdate(base); return; }
    const newChoices = { ...(base.choices || {}), [profile.id]: choice };
    const players = Object.keys(newChoices);
    let winner: string | null = null;
    if (players.length === 2) {
      const [p1,p2] = players;
      const [c1,c2] = [newChoices[p1],newChoices[p2]];
      const beats: Record<string,string> = { rock:'scissors', scissors:'paper', paper:'rock' };
      if (c1===c2) winner='draw';
      else if (beats[c1]===c2) winner=p1;
      else winner=p2;
    }
    const newState = { ...base, choices: newChoices, winner };
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active', winner_id: winner && winner!=='draw' ? winner : null }).eq('id', game.id);
    onUpdate(newState);
  }
  const myChoice = profile && state.choices[profile.id];
  return (
    <div className="space-y-4 text-center">
      {!canPlay ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-bold theme-text">Waiting for the second player…</p>
          <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Both players must be in before anyone chooses.</p>
        </div>
      ) : state.winner ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{state.winner==='draw'?'Draw! 🤝':state.winner===profile?.id?'You win! 🎉':'Your friend wins! 🎉'}</p>
          <div className="mt-2 space-y-1 text-sm">
            {Object.entries(state.choices).map(([pid,c]:any)=>(
              <p key={pid} style={{color:'var(--color-text-muted)'}}>{pid===profile?.id?'You':'Them'}: {c==='rock'?'✊':c==='paper'?'✋':'✌️'} {c}</p>
            ))}
          </div>
          <p className="text-xs mt-2" style={{color:'var(--color-text-muted)'}}>Tap Restart above for another round.</p>
        </div>
      ) : myChoice ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-bold theme-text">You chose: {myChoice==='rock'?'✊':myChoice==='paper'?'✋':'✌️'} {myChoice}</p>
          <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Waiting for other player...</p>
        </div>
      ) : (
        <>
          <p className="font-bold theme-text">Make your choice!</p>
          <div className="flex gap-3 justify-center">
            {[{v:'rock',e:'✊'},{v:'paper',e:'✋'},{v:'scissors',e:'✌️'}].map(opt=>(
              <button key={opt.v} onClick={()=>choose(opt.v)}
                className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 text-3xl transition-all hover:scale-110"
                style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}44`}}>
                {opt.e}<span className="text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{opt.v}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Number Guess — one player sets the secret number, the other guesses it.
// Start: two choices — "Set the number" or "Guess". Restart returns here.
export function NumberGuess({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [guess, setGuess] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const phase = state.phase || 'playing'; // older games have no phase: play as before
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const iAmSetter = state.setterId ? state.setterId === profile?.id : false;
  const iAmGuesser = state.guesserId ? state.guesserId === profile?.id : !state.setterId; // legacy: anyone guesses
  const finished = !!state.winner;

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  async function chooseRole(role: 'write' | 'guess') {
    if (!profile || !otherId) return;
    const setterId = role === 'write' ? profile.id : otherId;
    const guesserId = role === 'write' ? otherId : profile.id;
    await saveState({ ...state, phase: 'setup', setterId, guesserId }, false);
  }

  async function setSecret() {
    const n = parseInt(secretInput);
    if (isNaN(n) || n < 1 || n > 100) return;
    await saveState({ ...state, phase: 'playing', secret: n, guesses: [] }, false);
    setSecretInput('');
  }

  async function makeGuess() {
    if (!iAmGuesser) return;
    const n = parseInt(guess);
    if (isNaN(n) || n < 1 || n > 100 || finished) return;
    const isCorrect = n === state.secret;
    const newGuesses = [...(state.guesses || []), { player: profile?.id, value: n, correct: isCorrect, hint: n < state.secret ? 'Too low! 📉' : 'Too high! 📈' }];
    await saveState({ ...state, guesses: newGuesses, winner: isCorrect ? profile?.id : null, phase: isCorrect ? 'finished' : 'playing' }, isCorrect);
    setGuess('');
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-4 text-center">
        <p className="font-bold theme-text">How do you want to play?</p>
        <p className="text-sm" style={{color:'var(--color-text-muted)'}}>One of you picks the secret number, the other one guesses it.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => chooseRole('write')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">✏️</span><span className="font-black text-sm theme-text">Set the number</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>You pick it, they guess</span>
          </button>
          <button onClick={() => chooseRole('guess')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">🔍</span><span className="font-black text-sm theme-text">Guess</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>They pick it, you guess</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    if (iAmSetter) {
      return (
        <div className="space-y-4 text-center">
          <p className="font-bold theme-text">Pick a secret number between 1 and 100 🔢</p>
          <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Your friend will try to guess it. Keep it secret!</p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <input type="number" min="1" max="100" value={secretInput} onChange={e=>setSecretInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setSecret()}
              placeholder="1–100" className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
            <button onClick={setSecret} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Set it!</button>
          </div>
        </div>
      );
    }
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Your friend is picking a secret number… 🤫</p></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold theme-text text-center">
        {finished ? 'Game over!' : iAmGuesser ? 'Guess the number between 1 and 100!' : 'Your friend is guessing your number… 👀'}
      </p>
      {iAmSetter && !finished && (
        <p className="text-xs text-center font-semibold" style={{color:'var(--color-text-muted)'}}>Your secret number: {state.secret}</p>
      )}
      {finished ? (
        <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">🎉 Correct! The number was {state.secret}!</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>{state.winner === profile?.id ? 'You guessed it!' : 'Your friend guessed it!'} Tap Restart above to play again.</p>
        </div>
      ) : iAmGuesser ? (
        <div className="flex gap-2">
          <input type="number" min="1" max="100" value={guess} onChange={e=>setGuess(e.target.value)} onKeyDown={e=>e.key==='Enter'&&makeGuess()}
            placeholder="1–100" className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
          <button onClick={makeGuess} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Guess!</button>
        </div>
      ) : null}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {[...(state.guesses || [])].reverse().map((g:any,i:number)=>(
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
            <span className="font-black text-lg" style={{color:g.correct?'#4ADE80':accentColor}}>{g.value}</span>
            <span className="text-sm" style={{color:g.correct?'#4ADE80':'var(--color-text-muted)'}}>{g.correct?'✅ Correct!':g.hint}</span>
            <span className="text-xs ml-auto" style={{color:'var(--color-text-muted)'}}>{g.player===profile?.id?'You':'Them'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hangman — one player writes the word, the other guesses it.
// Start: two choices — "Write the word" or "Guess". The word stays
// hidden from the guesser until it is guessed or the game ends.
export function Hangman({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [wordInput, setWordInput] = useState('');
  const phase = state.phase || 'playing'; // older games have no phase: play as before
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const iAmSetter = state.setterId ? state.setterId === profile?.id : false;
  const iAmGuesser = state.guesserId ? state.guesserId === profile?.id : !state.setterId; // legacy: anyone guesses
  const word: string = state.word || '';
  const guessed: string[] = state.guessed || [];
  const wrongGuesses: string[] = state.wrongGuesses || [];
  const maxWrong = state.maxWrong || 6;
  const isWon = word.length > 0 && word.split('').every((l: string) => guessed.includes(l));
  const isLost = wrongGuesses.length >= maxWrong;
  const finished = isWon || isLost || phase === 'finished';

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  async function chooseRole(role: 'write' | 'guess') {
    if (!profile || !otherId) return;
    const setterId = role === 'write' ? profile.id : otherId;
    const guesserId = role === 'write' ? otherId : profile.id;
    await saveState({ ...state, phase: 'setup', setterId, guesserId }, false);
  }

  async function setWord() {
    const w = wordInput.trim().toLowerCase();
    if (!/^[a-z]{3,15}$/.test(w)) return;
    await saveState({ ...state, phase: 'playing', word: w, guessed: [], wrongGuesses: [] }, false);
    setWordInput('');
  }

  async function guessLetter(letter: string) {
    if (!iAmGuesser || guessed.includes(letter) || wrongGuesses.includes(letter) || finished || !word) return;
    const isCorrect = word.includes(letter);
    const newGuessed = isCorrect ? [...guessed, letter] : guessed;
    const newWrong = isCorrect ? wrongGuesses : [...wrongGuesses, letter];
    const won = word.split('').every((l: string) => newGuessed.includes(l));
    const lost = newWrong.length >= maxWrong;
    const done = won || lost;
    await saveState({
      ...state,
      guessed: newGuessed,
      wrongGuesses: newWrong,
      winner: won ? profile?.id : lost ? state.setterId : null,
      phase: done ? 'finished' : 'playing',
    }, done);
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-4 text-center">
        <p className="font-bold theme-text">How do you want to play?</p>
        <p className="text-sm" style={{color:'var(--color-text-muted)'}}>One of you writes the word, the other one guesses it letter by letter.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => chooseRole('write')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">✏️</span><span className="font-black text-sm theme-text">Write the word</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>You choose it, they guess</span>
          </button>
          <button onClick={() => chooseRole('guess')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">🔍</span><span className="font-black text-sm theme-text">Guess</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>They write it, you guess</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    if (iAmSetter) {
      return (
        <div className="space-y-4 text-center">
          <p className="font-bold theme-text">Write a word for your friend to guess 🔡</p>
          <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Letters only, 3–15 letters. Your friend will not see it until they guess it!</p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <input type="text" value={wordInput} onChange={e=>setWordInput(e.target.value.replace(/[^a-zA-Z]/g, ''))} onKeyDown={e=>e.key==='Enter'&&setWord()}
              placeholder="e.g. butterfly" maxLength={15} className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
            <button onClick={setWord} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Set word</button>
          </div>
        </div>
      );
    }
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Your friend is writing a word… 🤫</p></div>;
  }

  // Playing / finished: everyone sees the SAME progress — letters are
  // revealed only when the guesser gets them right. The setter watches
  // this exact view live (their own word is shown in small text below).
  // The full word is revealed to all when the game ends.
  const displayWord = word.split('').map((l: string) => (guessed.includes(l) || finished) ? l : '_').join(' ');
  const remaining = maxWrong - wrongGuesses.length;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

  return (
    <div className="space-y-4 text-center">
      <div className="p-4 rounded-2xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
        <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>
          {`Wrong guesses: ${wrongGuesses.length}/${maxWrong} · Remaining: ${remaining}`}
        </p>
        <div className="text-2xl font-black tracking-widest theme-text my-3">{displayWord}</div>
        {wrongGuesses.length > 0 && <p className="text-sm" style={{color:'#FF6B6B'}}>❌ {wrongGuesses.join(', ')}</p>}
        {!finished && iAmSetter && <p className="text-xs mt-2 font-semibold" style={{color:'var(--color-text-muted)'}}>Your word: {word}</p>}
        {!finished && iAmSetter && <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>You are watching — your friend is guessing 👀</p>}
      </div>
      {isWon ? <div className="p-4 rounded-2xl font-black text-lg theme-text" style={{background:`${accentColor}22`}}>🎉 {state.winner === profile?.id ? 'You got it!' : 'Your friend got it!'} The word was &quot;{word}&quot;! Tap Restart above to play again.</div>
        : isLost ? <div className="p-4 rounded-2xl font-black text-lg" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>💀 Game over! The word was &quot;{word}&quot;. Tap Restart above to try again.</div>
        : iAmGuesser ? (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {alphabet.map(l => (
              <button key={l} onClick={() => guessLetter(l)} disabled={guessed.includes(l) || wrongGuesses.includes(l)}
                className="w-9 h-9 rounded-xl text-sm font-bold transition-all hover:scale-110"
                style={{background:guessed.includes(l)?`${accentColor}44`:wrongGuesses.includes(l)?'rgba(255,107,107,0.2)':'rgba(var(--color-overlay-rgb),0.8)',color:guessed.includes(l)?accentColor:wrongGuesses.includes(l)?'#FF6B6B':'var(--color-text)',border:`1px solid ${accentColor}33`,opacity:guessed.includes(l)||wrongGuesses.includes(l)?0.5:1}}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-bold theme-text">Waiting for your friend to guess…</p>
        )
      }
    </div>
  );
}


// Draw & Guess — one player draws a secret word on a canvas, the other
// guesses it before the 60s timer runs out. 4 rounds, roles swap every
// round, each player draws twice. A correct guess scores +10 for the
// guesser and +5 for the drawer; a timeout scores nothing. The word
// lives in synced state but the UI hides it from the guesser (same
// honesty note as Hangman). Strokes sync when the drawer finishes each
// stroke (lifts the pen / mouse).
const DRAW_COLORS = ['#2B2B2B', '#E63946', '#2563EB', '#2E9E5B', '#F4A259', '#8E44AD', '#FFFFFF'];
const DRAW_SIZES = [3, 6, 10];
// Eraser hit radius in canvas units: a stroke counts as erased when any
// of its points comes this close to the pointer.
const ERASE_RADIUS = 24;

export function DrawGuess({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [guessInput, setGuessInput] = useState('');
  const [savingGuess, setSavingGuess] = useState(false);
  const [color, setColor] = useState('#2B2B2B');
  const [brush, setBrush] = useState(6);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const erasingRef = useRef(false);
  const erasedRef = useRef(false);
  const strokeRef = useRef<number[][]>([]);
  const strokesRef = useRef<any[]>([]);
  const armedRef = useRef(-1);
  const timeoutRef = useRef(-1);
  const advanceRef = useRef('');
  // Latest synced state, for writes. Every save must spread THIS, not the
  // render closure's `state`: the other player's writes (guesses, strokes)
  // land between renders, and spreading a stale snapshot wipes them.
  const stateRef = useRef(state);
  stateRef.current = state;

  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const iAmDrawer = state.drawerId === profile?.id;
  const round = state.round || 1;
  const totalRounds = state.totalRounds || 4;
  const wordObj = (state.words || [])[round - 1] || { w: '', hint: '' };
  const word: string = wordObj.w || '';
  const strokes: any[] = state.strokes || [];
  const guesses: any[] = state.guesses || [];
  const scores: Record<string, number> = state.scores || {};
  const myScore = scores[profile?.id] || 0;
  const theirScore = otherId ? (scores[otherId] || 0) : 0;
  const phase = state.phase || 'playing';
  const finished = phase === 'finished';
  const roundEndsAt: number | null = state.roundEndsAt || null;
  const remaining = roundEndsAt ? Math.max(0, Math.ceil((roundEndsAt - now) / 1000)) : 60;

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done && newState.winner && newState.winner !== 'draw' ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  // Local clock for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Arm the 60s round timer once both players are in (either client may
  // arm it; the writes are identical, so a double-write is harmless).
  useEffect(() => {
    if (!canPlay || phase !== 'playing' || roundEndsAt || armedRef.current === round) return;
    armedRef.current = round;
    void saveState({ ...stateRef.current, roundEndsAt: Date.now() + 60000 }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, phase, roundEndsAt, round]);

  // End the round when the timer runs out (either client; same result).
  useEffect(() => {
    if (!canPlay || phase !== 'playing' || !roundEndsAt || now <= roundEndsAt || timeoutRef.current === round) return;
    timeoutRef.current = round;
    const cur = stateRef.current;
    const curWord = ((cur.words || [])[(cur.round || 1) - 1] || {}).w || word;
    void saveState({ ...cur, phase: 'roundEnd', roundEndsAt: null, roundResult: { outcome: 'timeout', word: curWord } }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, phase, roundEndsAt, now, round]);

  // Redraw the canvas from synced strokes whenever they change.
  useEffect(() => {
    strokesRef.current = strokes;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStrokeOn(ctx, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, phase, round]);

  // A new round (or a new drawer) always starts back on the brush, so
  // nobody opens a round with the eraser still armed by mistake.
  useEffect(() => { setTool('brush'); }, [round, state.drawerId]);

  function canvasPoint(e: RPointerEvent<HTMLCanvasElement>): number[] {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [Math.round((e.clientX - rect.left) * (canvas.width / rect.width)), Math.round((e.clientY - rect.top) * (canvas.height / rect.height))];
  }

  // Real eraser: removes whole strokes whose points pass near the
  // pointer, from the synced stroke list — nothing is painted over, so
  // the removal shows on the guesser's screen too once saved. Repaints
  // immediately for the drawer; the save happens once per drag, on
  // pointer-up, so a long erase drag is a single write.
  function eraseAt(p: number[]) {
    const cur = strokesRef.current;
    const kept = cur.filter((s: any) => {
      const pts: number[][] = s.points || [];
      for (const q of pts) {
        const dx = q[0] - p[0], dy = q[1] - p[1];
        if (dx * dx + dy * dy <= ERASE_RADIUS * ERASE_RADIUS) return false;
      }
      return true;
    });
    if (kept.length === cur.length) return;
    strokesRef.current = kept;
    erasedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of kept) drawStrokeOn(ctx, s);
    }
  }

  function onPointerDown(e: RPointerEvent<HTMLCanvasElement>) {
    if (!iAmDrawer || phase !== 'playing') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'eraser') {
      erasingRef.current = true;
      eraseAt(canvasPoint(e));
      return;
    }
    drawingRef.current = true;
    strokeRef.current = [canvasPoint(e)];
    const ctx = canvasRef.current?.getContext('2d');
    const p0 = strokeRef.current[0];
    if (ctx) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p0[0], p0[1], brush / 2, 0, Math.PI * 2); ctx.fill(); }
  }

  function onPointerMove(e: RPointerEvent<HTMLCanvasElement>) {
    if (!iAmDrawer) return;
    if (erasingRef.current) { e.preventDefault(); eraseAt(canvasPoint(e)); return; }
    if (!drawingRef.current) return;
    e.preventDefault();
    const pts = strokeRef.current;
    const p = canvasPoint(e);
    const prev = pts[pts.length - 1];
    pts.push(p);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && prev) {
      ctx.strokeStyle = color; ctx.lineWidth = brush; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    }
  }

  async function onPointerUp() {
    if (erasingRef.current) {
      erasingRef.current = false;
      if (!erasedRef.current) return;
      erasedRef.current = false;
      await saveState({ ...stateRef.current, strokes: strokesRef.current }, false);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = strokeRef.current;
    strokeRef.current = [];
    if (pts.length === 0) return;
    // Update the mirror immediately so a fast next stroke never loses
    // this one, and spread the freshest state so guesses never get wiped.
    const next = [...strokesRef.current, { color, size: brush, points: pts }];
    strokesRef.current = next;
    await saveState({ ...stateRef.current, strokes: next }, false);
  }

  async function clearCanvas() {
    if (!iAmDrawer) return;
    strokesRef.current = [];
    await saveState({ ...stateRef.current, strokes: [] }, false);
  }

  async function submitGuess() {
    const g = guessInput.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!g || iAmDrawer || phase !== 'playing' || savingGuess || !word) return;
    setSavingGuess(true);
    try {
      // Build the write from the freshest state: spreading the render
      // snapshot here used to wipe the drawer's strokes.
      const cur = stateRef.current;
      const curWord = ((cur.words || [])[(cur.round || 1) - 1] || {}).w || word;
      const correct = g === curWord.toLowerCase();
      const newGuesses = [...(cur.guesses || []), { player: profile?.id, text: guessInput.trim(), correct }];
      if (correct) {
        const curScores = cur.scores || {};
        const newScores = { ...curScores, [profile.id]: (curScores[profile.id] || 0) + 10, [cur.drawerId]: (curScores[cur.drawerId] || 0) + 5 };
        await saveState({ ...cur, guesses: newGuesses, scores: newScores, phase: 'roundEnd', roundEndsAt: null, roundResult: { outcome: 'guessed', word: curWord, by: profile?.id } }, false);
      } else {
        await saveState({ ...cur, guesses: newGuesses }, false);
      }
      setGuessInput('');
    } finally {
      setSavingGuess(false);
    }
  }

  async function advance() {
    const key = `${round}-roundEnd`;
    if (advanceRef.current === key) return;
    advanceRef.current = key;
    const cur = stateRef.current;
    const curRound = cur.round || round;
    const curScores = cur.scores || {};
    if (curRound >= totalRounds) {
      const ids = [game.created_by, otherId].filter(Boolean);
      const s0 = curScores[ids[0]] || 0;
      const s1 = curScores[ids[1]] || 0;
      const winner = s0 === s1 ? 'draw' : (s0 > s1 ? ids[0] : ids[1]);
      await saveState({ ...cur, phase: 'finished', winner }, true);
    } else {
      // Swap the drawer: the next drawer is whoever is NOT the current
      // drawer. (Must be computed from the current drawer, not from the
      // tapping player — either player may tap Next round.)
      const nextDrawer = (players || []).find((p: any) => p.user_id !== cur.drawerId)?.user_id || otherId || cur.drawerId;
      await saveState({ ...cur, phase: 'playing', round: curRound + 1, drawerId: nextDrawer, strokes: [], guesses: [], roundResult: null, roundEndsAt: null }, false);
    }
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  const blanks = word ? word.split('').map(() => '_').join(' ') : '';

  if (finished) {
    const winnerText = state.winner === 'draw' ? "It's a tie! 🤝" : state.winner === profile?.id ? '🏆 You win!' : '🏆 Your friend wins!';
    return (
      <div className="space-y-4 text-center">
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{winnerText}</p>
          <p className="text-sm mt-1 font-bold theme-text">Final score — You: {myScore} · Them: {theirScore}</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Tap Restart above to play again with new words.</p>
        </div>
      </div>
    );
  }

  if (phase === 'roundEnd' && state.roundResult) {
    const r = state.roundResult;
    const lastRound = round >= totalRounds;
    return (
      <div className="space-y-4 text-center">
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">
            {r.outcome === 'guessed'
              ? `🎉 ${r.by === profile?.id ? 'You guessed it!' : 'Your friend guessed it!'} The word was "${r.word}"`
              : `⏰ Time's up! The word was "${r.word}"`}
          </p>
          <p className="text-sm mt-1 font-bold theme-text">Score — You: {myScore} · Them: {theirScore}</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>{r.outcome === 'guessed' ? 'Guesser +10, drawer +5.' : 'No points this round.'}</p>
        </div>
        {/* Show the final drawing on the round-end screen (read-only), so
            both players can see what was drawn — the guesser never saw it
            otherwise. The redraw effect paints this canvas from the synced
            strokes, same as the playing canvas. */}
        <canvas ref={canvasRef} width={640} height={520} className="w-full rounded-2xl"
          style={{ background: '#FFFFFF', border: `2px solid ${accentColor}33` }} />
        <button onClick={advance} className="theme-btn px-6 py-3 text-sm" style={{background:accentColor}}>
          {lastRound ? 'See results 🏆' : 'Next round →'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-bold theme-text">
        <span>Round {round} of {totalRounds} 🎨</span>
        <span style={{color: remaining <= 10 ? '#FF6B6B' : 'var(--color-text)'}}>⏱ {remaining}s</span>
        <span>You: {myScore} · Them: {theirScore}</span>
      </div>
      {iAmDrawer ? (
        <p className="text-center font-bold theme-text">Your word: <span style={{color:accentColor}}>{word}</span> <span className="text-xs font-semibold" style={{color:'var(--color-text-muted)'}}>({wordObj.hint}) — draw it, don&apos;t write it!</span></p>
      ) : (
        <div className="text-center">
          <p className="text-xl font-black tracking-widest theme-text">{blanks}</p>
          <p className="text-xs font-semibold" style={{color:'var(--color-text-muted)'}}>Hint: {wordObj.hint} · {word.length} letters · Your friend is drawing… 👀</p>
        </div>
      )}
      <canvas ref={canvasRef} width={640} height={520} className="w-full rounded-2xl"
        style={{ background: '#FFFFFF', border: `2px solid ${accentColor}33`, touchAction: 'none', cursor: iAmDrawer ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'default' }}
        onPointerDown={iAmDrawer ? onPointerDown : undefined}
        onPointerMove={iAmDrawer ? onPointerMove : undefined}
        onPointerUp={iAmDrawer ? onPointerUp : undefined}
        onPointerLeave={iAmDrawer ? onPointerUp : undefined}
      />
      {iAmDrawer ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 justify-center flex-wrap">
            {DRAW_COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('brush'); }} title={c}
                className="rounded-full transition-all hover:scale-110"
                style={{ width: 28, height: 28, background: c, border: tool === 'brush' && color === c ? `3px solid ${accentColor}` : '2px solid rgba(0,0,0,0.15)' }} />
            ))}
          </div>
          <div className="flex items-center gap-2 justify-center">
            {DRAW_SIZES.map(s => (
              <button key={s} onClick={() => setBrush(s)}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{ background: brush === s ? accentColor : 'rgba(var(--color-overlay-rgb),0.8)', color: brush === s ? '#fff' : 'var(--color-text)' }}>
                {s === 3 ? 'Thin' : s === 6 ? 'Medium' : 'Thick'}
              </button>
            ))}
            <button onClick={() => setTool(tool === 'eraser' ? 'brush' : 'eraser')} title="Eraser — drag over a stroke to remove it"
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1"
              style={{ background: tool === 'eraser' ? accentColor : 'rgba(var(--color-overlay-rgb),0.8)', color: tool === 'eraser' ? '#fff' : 'var(--color-text)' }}>
              <Eraser size={13} /> Eraser
            </button>
            <button onClick={clearCanvas} className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(var(--color-overlay-rgb),0.8)', color: 'var(--color-text)' }}>Clear 🧹</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input type="text" value={guessInput} onChange={e=>setGuessInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitGuess()}
            placeholder="What is it? Type your guess…" maxLength={30} className="theme-input flex-1 py-3 px-4 text-sm"/>
          <button onClick={submitGuess} disabled={savingGuess} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Guess!</button>
        </div>
      )}
      {guesses.length > 0 && (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {[...guesses].reverse().map((g: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
              <span className="font-bold text-sm theme-text">{g.text}</span>
              <span className="text-sm" style={{color: g.correct ? '#4ADE80' : 'var(--color-text-muted)'}}>{g.correct ? '✅ Correct!' : '❌ Not it'}</span>
              <span className="text-xs ml-auto" style={{color:'var(--color-text-muted)'}}>{g.player === profile?.id ? 'You' : 'Them'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Trivia Duel — the same 5 questions for both players, answered at the
// same time, 15s per question. A correct answer scores 10 + the seconds
// left on the clock (fast = more points); wrong or timeout scores 0.
// After each question both players see the correct answer and the scores.
export function TriviaDuel({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [now, setNow] = useState(() => Date.now());
  const armedRef = useRef(-1);
  const revealRef = useRef(-1);
  const advanceRef = useRef('');
  // Latest synced state, for writes. Every save must spread THIS, not the
  // render closure's `state`: the other player's answer lands between
  // renders, and spreading a stale snapshot wipes it (same race as the
  // Draw & Guess stroke wipe).
  const stateRef = useRef(state);
  stateRef.current = state;

  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const qi = state.qi || 0;
  const questions: any[] = state.questions || [];
  const q = questions[qi] || null;
  const answers: Record<string, any> = state.answers || {};
  const scores: Record<string, number> = state.scores || {};
  const lastPoints: Record<string, number> = state.lastPoints || {};
  const myScore = scores[profile?.id] || 0;
  const theirScore = otherId ? (scores[otherId] || 0) : 0;
  const phase = state.phase || 'playing';
  const finished = phase === 'finished';
  const questionEndsAt: number | null = state.questionEndsAt || null;
  const remaining = questionEndsAt ? Math.max(0, Math.ceil((questionEndsAt - now) / 1000)) : 15;
  const myAnswer = answers[profile?.id];
  const theirAnswer = otherId ? answers[otherId] : null;
  const playerIds = (players || []).map((p: any) => p.user_id);
  const bothAnswered = playerIds.length >= 2 ? playerIds.every((id: string) => answers[id]) : Object.keys(answers).length >= 2;

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done && newState.winner && newState.winner !== 'draw' ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  // Local clock for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Arm the 15s question timer once both players are in (either client
  // may arm it; the writes are identical, so a double-write is harmless).
  useEffect(() => {
    if (!canPlay || phase !== 'playing' || questionEndsAt || armedRef.current === qi) return;
    armedRef.current = qi;
    void saveState({ ...stateRef.current, questionEndsAt: Date.now() + 15000 }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, phase, questionEndsAt, qi]);

  // Reveal when both players answered or time runs out (either client
  // may compute it; both compute the same result from the same state).
  useEffect(() => {
    if (!canPlay || phase !== 'playing' || !questionEndsAt || !q || revealRef.current === qi) return;
    const expired = now > questionEndsAt;
    if (!bothAnswered && !expired) return;
    revealRef.current = qi;
    // Score from the freshest state so a just-arrived answer is counted.
    const cur = stateRef.current;
    const curAnswers: Record<string, any> = cur.answers || {};
    const curQ = (cur.questions || [])[cur.qi || 0] || q;
    const curEndsAt: number = cur.questionEndsAt || questionEndsAt || Date.now();
    const newScores = { ...(cur.scores || {}) };
    const pts: Record<string, number> = {};
    for (const id of Object.keys(curAnswers)) {
      const a = curAnswers[id];
      if (a.option === curQ.answer) {
        const bonus = Math.max(0, Math.floor((curEndsAt - a.at) / 1000));
        pts[id] = 10 + bonus;
        newScores[id] = (newScores[id] || 0) + pts[id];
      } else {
        pts[id] = 0;
      }
    }
    void saveState({ ...cur, scores: newScores, lastPoints: pts, phase: 'reveal' }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, phase, questionEndsAt, now, qi, bothAnswered, q]);

  async function answer(option: number) {
    if (phase !== 'playing' || myAnswer || !questionEndsAt || now > questionEndsAt) return;
    const cur = stateRef.current;
    if ((cur.answers || {})[profile.id]) return;
    await saveState({ ...cur, answers: { ...(cur.answers || {}), [profile.id]: { option, at: Date.now() } } }, false);
  }

  async function advance() {
    const key = `${qi}-reveal`;
    if (advanceRef.current === key) return;
    advanceRef.current = key;
    const cur = stateRef.current;
    const curQi = cur.qi ?? qi;
    const curQuestions: any[] = cur.questions || questions;
    const curScores: Record<string, number> = cur.scores || {};
    if (curQi >= curQuestions.length - 1) {
      const ids = [game.created_by, otherId].filter(Boolean);
      const s0 = curScores[ids[0]] || 0;
      const s1 = curScores[ids[1]] || 0;
      const winner = s0 === s1 ? 'draw' : (s0 > s1 ? ids[0] : ids[1]);
      await saveState({ ...cur, phase: 'finished', winner }, true);
    } else {
      await saveState({ ...cur, phase: 'playing', qi: curQi + 1, answers: {}, lastPoints: {}, questionEndsAt: null }, false);
    }
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  if (!q) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Loading questions… 🧠</p></div>;
  }

  if (finished) {
    const winnerText = state.winner === 'draw' ? "It's a tie! 🤝" : state.winner === profile?.id ? '🏆 You win!' : '🏆 Your friend wins!';
    return (
      <div className="space-y-4 text-center">
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{winnerText}</p>
          <p className="text-sm mt-1 font-bold theme-text">Final score — You: {myScore} · Them: {theirScore}</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Tap Restart above for a fresh duel with new questions.</p>
        </div>
      </div>
    );
  }

  const myPoints = lastPoints[profile?.id];
  const theirPoints = otherId ? lastPoints[otherId] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-bold theme-text">
        <span>Question {qi + 1} of {questions.length} 🧠</span>
        <span className="px-2 py-0.5 rounded-full text-xs" style={{background:`${accentColor}22`, color:accentColor}}>{q.cat}</span>
        <span style={{color: remaining <= 5 && phase === 'playing' ? '#FF6B6B' : 'var(--color-text)'}}>⏱ {phase === 'playing' ? `${remaining}s` : 'Done!'}</span>
        <span>You: {myScore} · Them: {theirScore}</span>
      </div>
      <p className="font-black text-base theme-text text-center">{q.q}</p>
      <div className="space-y-2">
        {q.options.map((opt: string, i: number) => {
          const isCorrect = i === q.answer;
          const iPicked = myAnswer?.option === i;
          const theyPicked = theirAnswer?.option === i;
          let bg = 'rgba(var(--color-overlay-rgb),0.8)';
          let border = `${accentColor}33`;
          if (phase === 'reveal') {
            if (isCorrect) { bg = 'rgba(74,222,128,0.18)'; border = '#4ADE80'; }
            else if (iPicked || theyPicked) { bg = 'rgba(255,107,107,0.12)'; border = '#FF6B6B'; }
          } else if (iPicked) {
            bg = `${accentColor}22`; border = accentColor;
          }
          return (
            <button key={i} onClick={() => answer(i)} disabled={phase !== 'playing' || !!myAnswer}
              className="w-full text-left p-3 rounded-2xl text-sm font-bold transition-all hover:scale-[1.01]"
              style={{ background: bg, border: `2px solid ${border}`, color: 'var(--color-text)', opacity: phase === 'playing' && myAnswer && !iPicked ? 0.6 : 1 }}>
              <span className="flex items-center gap-2">
                <span>{opt}</span>
                {phase === 'reveal' && isCorrect && <span className="ml-auto">✅ Correct</span>}
                {phase === 'reveal' && iPicked && !isCorrect && <span className="ml-auto text-xs">You picked this</span>}
                {phase === 'reveal' && theyPicked && !isCorrect && <span className="ml-auto text-xs">They picked this</span>}
                {phase === 'playing' && iPicked && <span className="ml-auto text-xs">Your pick ✓</span>}
              </span>
            </button>
          );
        })}
      </div>
      {phase === 'playing' && (
        <p className="text-xs text-center font-semibold" style={{color:'var(--color-text-muted)'}}>
          {myAnswer
            ? (bothAnswered ? 'Both answered — revealing…' : 'Locked in! Waiting for your friend…')
            : 'Faster correct answers score more: 10 points + 1 per second left. Wrong or timeout = 0.'}
        </p>
      )}
      {phase === 'reveal' && (
        <div className="space-y-3 text-center">
          <p className="text-sm font-bold theme-text">
            {myPoints !== undefined ? `You earned +${myPoints}` : 'You didn\u2019t answer'} · {theirPoints !== undefined ? `They earned +${theirPoints}` : 'They didn\u2019t answer'}
          </p>
          <button onClick={advance} className="theme-btn px-6 py-3 text-sm" style={{background:accentColor}}>
            {qi >= questions.length - 1 ? 'See results 🏆' : 'Next question →'}
          </button>
        </div>
      )}
    </div>
  );
}

// Dots & Boxes: 5x5 dots, 16 boxes. Tap an edge to draw a line; complete
// a box to claim it (your colour + initial) and earn an extra turn. Most
// boxes when the grid fills wins. Turn-gated, so only one player can
// legally move at a time; writes still go through the stateRef mirror.
const DOTS_SPAN = 80;
const DOTS_PAD = 40;
const DOTS_OPP = '#9B8AFB';
function dotsEdgeEnds(id: string): [[number, number], [number, number]] {
  const [kind, r, c] = id.split('-');
  const ri = Number(r), ci = Number(c);
  const p = (i: number) => DOTS_PAD + i * DOTS_SPAN;
  if (kind === 'h') return [[p(ci), p(ri)], [p(ci + 1), p(ri)]];
  return [[p(ci), p(ri)], [p(ci), p(ri + 1)]];
}
function dotsBoxesForEdge(id: string): string[] {
  const [kind, r, c] = id.split('-');
  const ri = Number(r), ci = Number(c);
  if (kind === 'h') {
    const out: string[] = [];
    if (ri > 0) out.push(`${ri - 1}-${ci}`);
    if (ri < 4) out.push(`${ri}-${ci}`);
    return out;
  }
  const out: string[] = [];
  if (ci > 0) out.push(`${ri}-${ci - 1}`);
  if (ci < 4) out.push(`${ri}-${ci}`);
  return out;
}
function dotsBoxEdges(boxKey: string): string[] {
  const [r, c] = boxKey.split('-').map(Number);
  return [`h-${r}-${c}`, `h-${r + 1}-${c}`, `v-${r}-${c}`, `v-${r}-${c + 1}`];
}
const DOTS_ALL_EDGES: string[] = (() => {
  const list: string[] = [];
  for (let r = 0; r <= 4; r++) for (let c = 0; c < 4; c++) list.push(`h-${r}-${c}`);
  for (let r = 0; r < 4; r++) for (let c = 0; c <= 4; c++) list.push(`v-${r}-${c}`);
  return list;
})();

export function DotsBoxes({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const phase = state.phase || 'playing';
  const finished = phase === 'finished';
  const edges: Record<string, string> = state.edges || {};
  const boxes: Record<string, string> = state.boxes || {};
  const scores: Record<string, number> = state.scores || {};
  const myScore = scores[profile?.id] || 0;
  const theirScore = otherId ? (scores[otherId] || 0) : 0;
  const myTurn = state.turn === profile?.id;
  const myInitial = ((profile?.display_name || profile?.username || 'Y')[0] || 'Y').toUpperCase();
  const claimedCount = Object.keys(boxes).length;
  const lastClaimed: number = state.lastClaimed || 0;
  const lastMoveBy: string | null = state.lastMoveBy || null;

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done && newState.winner && newState.winner !== 'draw' ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  async function claimEdge(edgeId: string) {
    if (phase !== 'playing' || !canPlay) return;
    const cur = stateRef.current;
    if (cur.turn !== profile.id) return;
    const curEdges: Record<string, string> = { ...(cur.edges || {}) };
    if (curEdges[edgeId]) return;
    curEdges[edgeId] = profile.id;
    const curBoxes: Record<string, string> = { ...(cur.boxes || {}) };
    let claimed = 0;
    for (const b of dotsBoxesForEdge(edgeId)) {
      if (curBoxes[b]) continue;
      if (dotsBoxEdges(b).every(e => curEdges[e])) { curBoxes[b] = profile.id; claimed++; }
    }
    const curScores: Record<string, number> = { ...(cur.scores || {}) };
    curScores[profile.id] = (curScores[profile.id] || 0) + claimed;
    const total = Object.keys(curBoxes).length;
    const next: any = { ...cur, edges: curEdges, boxes: curBoxes, scores: curScores, lastMoveBy: profile.id, lastClaimed: claimed };
    if (total >= 16) {
      const otherScore = curScores[otherId] || 0;
      next.phase = 'finished';
      next.winner = curScores[profile.id] === otherScore ? 'draw' : (curScores[profile.id] > otherScore ? profile.id : otherId);
      await saveState(next, true);
    } else {
      // Completing a box earns an extra turn; otherwise the turn passes.
      next.turn = claimed > 0 ? profile.id : (otherId || profile.id);
      await saveState(next, false);
    }
  }

  const winnerText = !finished ? '' : state.winner === 'draw' ? "It's a draw! ♡" : state.winner === profile?.id ? 'You win! 🎉' : 'Your friend wins!';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="px-3 py-1.5 rounded-full font-black" style={{ background: `${accentColor}22`, color: accentColor }}>You · {myScore}</span>
        <span className="px-3 py-1.5 rounded-full font-black" style={{ background: `${DOTS_OPP}22`, color: DOTS_OPP }}>Friend · {theirScore}</span>
        <span className="ml-auto text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>{claimedCount}/16 boxes</span>
      </div>
      {!finished && (
        <p className="text-center font-black theme-text">
          {canPlay ? (myTurn ? 'Your turn — tap an edge ♡' : "Friend's turn…") : 'Waiting for your friend to join…'}
        </p>
      )}
      {!finished && lastClaimed > 0 && lastMoveBy && (
        <p className="text-center text-xs font-bold -mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {lastMoveBy === profile?.id ? `You claimed ${lastClaimed === 1 ? 'a box' : lastClaimed + ' boxes'} — go again!` : `Friend claimed ${lastClaimed === 1 ? 'a box' : lastClaimed + ' boxes'} — they go again.`}
        </p>
      )}
      <div className="rounded-3xl p-3" style={{ background: 'rgba(var(--color-overlay-rgb),0.8)' }}>
        <svg viewBox="0 0 400 400" className="w-full h-auto select-none" style={{ touchAction: 'manipulation' }}>
          {Object.entries(boxes).map(([key, pid]) => {
            const [r, c] = key.split('-').map(Number);
            const col = pid === profile?.id ? accentColor : DOTS_OPP;
            return (
              <g key={key}>
                <rect x={DOTS_PAD + c * DOTS_SPAN} y={DOTS_PAD + r * DOTS_SPAN} width={DOTS_SPAN} height={DOTS_SPAN} fill={`${col}33`} />
                <text x={DOTS_PAD + c * DOTS_SPAN + DOTS_SPAN / 2} y={DOTS_PAD + r * DOTS_SPAN + DOTS_SPAN / 2 + 12} textAnchor="middle" fontSize={32} fontWeight={900} fill={col}>{pid === profile?.id ? myInitial : 'F'}</text>
              </g>
            );
          })}
          {DOTS_ALL_EDGES.map(id => {
            const [[x1, y1], [x2, y2]] = dotsEdgeEnds(id);
            const owner = edges[id];
            return owner ? (
              <line key={id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={owner === profile?.id ? accentColor : DOTS_OPP} strokeWidth={7} strokeLinecap="round" />
            ) : (
              <line key={id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-border)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
            );
          })}
          {DOTS_ALL_EDGES.map(id => {
            const [[x1, y1], [x2, y2]] = dotsEdgeEnds(id);
            const claimed = !!edges[id];
            return <line key={'hit-' + id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={26} strokeLinecap="round" style={{ cursor: claimed ? 'default' : 'pointer' }} onClick={() => claimEdge(id)} />;
          })}
          {[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => (
            <circle key={`${r}-${c}`} cx={DOTS_PAD + c * DOTS_SPAN} cy={DOTS_PAD + r * DOTS_SPAN} r={7} fill={accentColor} />
          )))}
        </svg>
      </div>
      <div className="flex items-center justify-center gap-4 text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: accentColor }} /> You ({myInitial})</span>
        <span><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ background: DOTS_OPP }} /> Friend (F)</span>
      </div>
      {finished && (
        <div className="text-center space-y-2">
          <p className="text-xl font-black theme-text">{winnerText}</p>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>Final score — You: {myScore} · Friend: {theirScore}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Tap Restart above for a rematch ♡</p>
        </div>
      )}
      {!finished && (
        <p className="text-xs text-center font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          Tap an edge between two dots to draw a line. Complete a box to claim it — and take another turn!
        </p>
      )}
    </div>
  );
}


export function CrazyEights({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const [suitFor, setSuitFor] = useState<string | null>(null);
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const phase = state.phase || 'playing';
  const finished = phase === 'finished';
  const hands: Record<string, string[]> = state.hands || {};
  const myHand: string[] = hands[profile?.id] || [];
  const theirHand: string[] = otherId ? (hands[otherId] || []) : [];
  const discard: string[] = state.discard || [];
  const top = discard[discard.length - 1] || null;
  const deck: string[] = state.deck || [];
  const myTurn = state.turn === profile?.id;
  const currentSuit: string = state.currentSuit || (top ? ceSuit(top) : 'S');

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done && newState.winner && newState.winner !== 'draw' ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  // The other player, from the player list or from the hands in state.
  function otherPlayerId(cur: any): string {
    if (otherId) return otherId;
    return Object.keys(cur.hands || {}).find((id: string) => id !== profile.id) || profile.id;
  }

  function playable(card: string): boolean {
    return !!top && cePlayable(card, top, currentSuit);
  }

  async function commitPlay(card: string, suit: string) {
    const cur = stateRef.current;
    if (cur.phase !== 'playing' || !canPlay) return;
    if (cur.turn !== profile.id) return;
    const curHands: Record<string, string[]> = { ...(cur.hands || {}) };
    const hand = [...(curHands[profile.id] || [])];
    const idx = hand.indexOf(card);
    if (idx < 0) return;
    const curDiscard: string[] = [...(cur.discard || [])];
    const curTop = curDiscard[curDiscard.length - 1];
    if (!cePlayable(card, curTop, cur.currentSuit)) return;
    hand.splice(idx, 1);
    curHands[profile.id] = hand;
    curDiscard.push(card);
    const next: any = { ...cur, hands: curHands, discard: curDiscard, currentSuit: suit };
    if (hand.length === 0) {
      next.phase = 'finished';
      next.winner = profile.id;
      await saveState(next, true);
    } else {
      next.turn = otherPlayerId(cur);
      await saveState(next, false);
    }
  }

  async function playCard(card: string) {
    if (!canPlay || !myTurn || finished) return;
    if (!playable(card)) return;
    // 8s are wild: pick the next suit first, then commit the move.
    if (ceRank(card) === '8') { setSuitFor(card); return; }
    await commitPlay(card, ceSuit(card));
  }

  async function pickSuit(suit: string) {
    const card = suitFor;
    setSuitFor(null);
    if (!card) return;
    await commitPlay(card, suit);
  }

  async function drawCard() {
    const cur = stateRef.current;
    if (cur.phase !== 'playing' || !canPlay) return;
    if (cur.turn !== profile.id) return;
    let deckNow: string[] = [...(cur.deck || [])];
    let discardNow: string[] = [...(cur.discard || [])];
    if (deckNow.length === 0) {
      // Reshuffle everything but the top discard back into the deck.
      const topCard = discardNow[discardNow.length - 1];
      deckNow = shuffled(discardNow.slice(0, -1));
      discardNow = [topCard];
      if (deckNow.length === 0) return;
    }
    const drawn = deckNow.shift()!;
    const curHands: Record<string, string[]> = { ...(cur.hands || {}) };
    curHands[profile.id] = [...(curHands[profile.id] || []), drawn];
    const next: any = { ...cur, deck: deckNow, discard: discardNow, hands: curHands };
    // If the drawn card can be played, the turn stays with you so you
    // can play it right away; otherwise the turn passes to your friend.
    const curTop = discardNow[discardNow.length - 1];
    next.turn = cePlayable(drawn, curTop, cur.currentSuit) ? profile.id : otherPlayerId(cur);
    await saveState(next, false);
  }

  function cardFace(card: string, opts?: { dimmed?: boolean; onClick?: () => void; disabled?: boolean }) {
    const red = ceIsRed(card);
    const color = red ? '#DC2626' : '#1F2937';
    return (
      <button key={card} onClick={opts?.onClick} disabled={opts?.disabled}
        className="w-12 h-[68px] rounded-xl flex flex-col items-center justify-center transition-all hover:scale-105 shrink-0"
        style={{ background: '#FFFFFF', border: `2px solid ${opts?.dimmed ? '#E5E7EB' : accentColor}`, color, opacity: opts?.dimmed ? 0.45 : 1 }}>
        <span className="text-sm font-black leading-none">{ceRank(card)}</span>
        <span className="text-xl leading-none mt-0.5">{CE_SUIT_SYMBOL[ceSuit(card)]}</span>
      </button>
    );
  }

  const winnerText = !finished ? '' : state.winner === profile?.id ? 'You win! 🎉' : "Your friend wins!";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="px-3 py-1.5 rounded-full font-black" style={{ background: `${accentColor}22`, color: accentColor }}>You · {myHand.length} cards</span>
        <span className="px-3 py-1.5 rounded-full font-black" style={{ background: 'var(--color-secondary)', color: 'var(--color-text-muted)' }}>Friend · {theirHand.length} cards</span>
        <span className="ml-auto text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>{deck.length} in deck</span>
      </div>

      {!finished && (
        <p className="text-center font-black theme-text">
          {canPlay ? (myTurn ? 'Your turn — play a matching card ♡' : "Friend's turn…") : 'Waiting for your friend to join…'}
        </p>
      )}

      {/* Table: discard pile + deck */}
      <div className="rounded-3xl p-4 flex items-center justify-center gap-6" style={{ background: 'rgba(var(--color-overlay-rgb),0.8)' }}>
        <div className="text-center">
          {top ? cardFace(top, { disabled: true }) : <div className="w-12 h-[68px] rounded-xl" style={{ background: 'var(--color-secondary)' }} />}
          <p className="text-[11px] font-bold mt-1.5" style={{ color: 'var(--color-text-muted)' }}>Top card</p>
        </div>
        <div className="text-center">
          <p className="text-sm font-black theme-text">Suit in play</p>
          <p className="text-2xl mt-0.5" style={{ color: (currentSuit === 'H' || currentSuit === 'D') ? '#DC2626' : '#1F2937' }}>{CE_SUIT_SYMBOL[currentSuit]} {CE_SUIT_NAME[currentSuit]}</p>
          <p className="text-[11px] font-bold mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Match the suit or the rank — or play an 8</p>
        </div>
        <div className="text-center">
          <button onClick={drawCard} disabled={!canPlay || !myTurn || finished}
            className="w-12 h-[68px] rounded-xl flex flex-col items-center justify-center transition-all hover:scale-105"
            style={{ background: accentColor, color: '#FFFFFF', opacity: (!canPlay || !myTurn || finished) ? 0.45 : 1 }}>
            <span className="text-lg font-black leading-none">🂠</span>
            <span className="text-[10px] font-black mt-0.5">DRAW</span>
          </button>
          <p className="text-[11px] font-bold mt-1.5" style={{ color: 'var(--color-text-muted)' }}>Draw a card</p>
        </div>
      </div>

      {/* Friend's hand: face-down backs, count only — their cards stay secret. */}
      <div>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-muted)' }}>Friend&apos;s hand ({theirHand.length})</p>
        <div className="flex gap-1.5 flex-wrap min-h-[68px] items-center">
          {theirHand.length === 0 && <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>No cards yet — they join when the game starts.</p>}
          {theirHand.slice(0, 7).map((_: string, i: number) => (
            <div key={i} className="w-12 h-[68px] rounded-xl flex items-center justify-center text-lg" style={{ background: accentColor, color: '#FFFFFF', opacity: 0.55 }}>🂠</div>
          ))}
          {theirHand.length > 7 && <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>+{theirHand.length - 7} more</span>}
        </div>
      </div>

      {/* Suit picker for a wild 8 */}
      {suitFor && (
        <div className="rounded-2xl p-4 text-center space-y-2" style={{ background: `${accentColor}22` }}>
          <p className="font-black text-sm theme-text">You played an 8 — it&apos;s wild! Pick the next suit:</p>
          <div className="flex justify-center gap-2">
            {(['S','H','D','C'] as const).map(s => (
              <button key={s} onClick={() => pickSuit(s)}
                className="px-4 py-2.5 rounded-xl font-black text-lg transition-all hover:scale-105"
                style={{ background: '#FFFFFF', border: `2px solid ${accentColor}`, color: s === 'H' || s === 'D' ? '#DC2626' : '#1F2937' }}>
                {CE_SUIT_SYMBOL[s]} {CE_SUIT_NAME[s]}
              </button>
            ))}
          </div>
          <button onClick={() => setSuitFor(null)} className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>Cancel</button>
        </div>
      )}

      {/* My hand */}
      <div>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-muted)' }}>Your hand ({myHand.length}) — tap a glowing card to play it</p>
        <div className="flex gap-1.5 flex-wrap">
          {myHand.length === 0 && <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Your hand is empty — the game will deal you in when your friend joins.</p>}
          {myHand.map((card: string) => cardFace(card, { dimmed: !playable(card) || !myTurn, disabled: !canPlay || !myTurn || finished || !playable(card), onClick: () => playCard(card) }))}
        </div>
      </div>

      {finished && (
        <div className="text-center space-y-2">
          <p className="text-xl font-black theme-text">{winnerText}</p>
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>Final cards — You: {myHand.length} · Friend: {theirHand.length}</p>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>Tap Restart above for a rematch ♡</p>
        </div>
      )}
      {!finished && (
        <p className="text-xs text-center font-semibold" style={{ color: 'var(--color-text-muted)' }}>
          8s are wild — play one, then pick the next suit. Can&apos;t play? Draw a card: if it matches, you can play it right away, otherwise your turn passes. First to empty your hand wins!
        </p>
      )}
    </div>
  );
}


// Fresh state for a rematch: same rules as the room restart — Tic Tac
// Toe keeps its X/O seats, Rock Paper Scissors bumps the round, every
// other game restarts from its initial state.
export function restartStateFor(game: any, gameState: any): any {
  const fresh = initialStateFor(game.type, game.created_by);
  if (game.type === 'tictactoe' && gameState) {
    fresh.playerX = gameState.playerX || game.created_by;
    fresh.playerO = gameState.playerO || null;
    fresh.currentPlayer = fresh.playerX;
  }
  if (game.type === 'rps' && gameState) fresh.round = (gameState.round || 1) + 1;
  if (game.type === 'crazy-eights' && gameState) {
    // Re-deal the second player from the fresh deck, as the room restart does.
    const prevHands = (gameState.hands || {}) as Record<string, string[]>;
    let next = fresh;
    for (const pid of Object.keys(prevHands)) {
      if (pid !== game.created_by) next = dealCrazyEights(next, pid);
    }
    return next;
  }
  return fresh;
}

'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room, RoomMember, Message, Game } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import {
  ArrowLeft, Send, Users, Gamepad2, Settings, Copy, Check, Hash, Lock,
  Crown, Shield, LogOut, Trash2, X, Share2
} from 'lucide-react';
import Link from 'next/link';

const PRESETS: Record<string,{bg:string;accent:string;emoji:string}> = {
  'cloudy-blue':{bg:'#DCEBFF',accent:'#7CA8E8',emoji:'☁️'},
  'strawberry-milk':{bg:'#FCE3EE',accent:'#E99ABD',emoji:'🍓'},
  'lavender-dreams':{bg:'#EDE7F6',accent:'#9575CD',emoji:'💜'},
  'peachy':{bg:'#FFF3E0',accent:'#FF8A65',emoji:'🍑'},
  'minty-fresh':{bg:'#E8F5E9',accent:'#66BB6A',emoji:'🌿'},
  'cotton-candy':{bg:'#FCE4EC',accent:'#F48FB1',emoji:'🩷'},
};

type Tab = 'chat' | 'members' | 'games' | 'settings';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const [profile, setProfile] = useState<Profile|null>(null);
  const [room, setRoom] = useState<Room|null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myRole, setMyRole] = useState<'owner'|'moderator'|'member'>('member');
  const [tab, setTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof) { router.replace('/login'); return; }
    setProfile(prof);
    document.documentElement.setAttribute('data-theme', prof.theme||'blue');

    const { data: rm } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!rm) { router.replace('/rooms'); return; }
    setRoom(rm);

    const { data: mems } = await supabase.from('room_members').select('*,profile:profiles(*)').eq('room_id', roomId);
    setMembers(mems||[]);
    const myMembership = (mems||[]).find(m=>m.user_id===user.id);
    if (!myMembership) { router.replace('/rooms'); return; }
    setMyRole(myMembership.role);

    const { data: msgs } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .eq('room_id', roomId).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(100);
    setMessages(msgs||[]);
    setLoading(false);

    // Realtime
    const channel = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
        const { data: full } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').eq('id', payload.new.id).single();
        if (full) setMessages(m=>[...m, full]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, roomId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !profile) return;
    const supabase = createClient();
    await supabase.from('messages').insert({ room_id: roomId, sender_id: profile.id, content: input.trim(), type: 'text' });
    setInput('');
  }

  async function leaveRoom() {
    if (!confirm('Leave this room?')) return;
    const supabase = createClient();
    await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', profile!.id);
    router.replace('/rooms');
  }

  async function deleteRoom() {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    const supabase = createClient();
    await supabase.from('rooms').delete().eq('id', roomId);
    router.replace('/rooms');
  }

  function copyInviteCode() {
    if (room) { navigator.clipboard.writeText(room.invite_code); setCopied(true); setTimeout(()=>setCopied(false),2000); }
  }

  if (loading) return <Loading/>;
  if (!room) return null;

  const preset = room.preset ? PRESETS[room.preset] : null;
  const accentColor = preset?.accent || room.accent_color || 'var(--color-accent)';

  return (
    <div className="flex flex-col h-screen" style={{background:preset?.bg||'var(--color-bg)'}}>
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(255,255,255,0.4)'}}>
        <Link href="/rooms" className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}><ArrowLeft size={18} style={{color:accentColor}}/></Link>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style={{background:'rgba(255,255,255,0.7)'}}>{preset?.emoji||room.name[0].toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm theme-text truncate">{room.name}</p>
          <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{members.length} members · {members.filter(m=>(m.profile as Profile)?.is_online).length} online</p>
        </div>
        {/* Share */}
        <button onClick={copyInviteCode} className="p-2 rounded-xl transition-all" style={{background:'rgba(255,255,255,0.7)'}}>
          {copied?<Check size={16} style={{color:'#4ADE80'}}/>:<Share2 size={16} style={{color:accentColor}}/>}
        </button>
      </header>

      {/* Tab bar */}
      <div className="flex px-4 pt-3 gap-1 flex-shrink-0" style={{background:'rgba(255,255,255,0.7)'}}>
        {(['chat','members','games','settings'] as Tab[]).filter(t=>t!=='settings'||myRole==='owner'||myRole==='moderator').map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className="px-4 py-2 rounded-t-xl text-xs font-bold capitalize transition-all"
            style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?accentColor:'var(--color-text-muted)',borderBottom:tab===t?`2px solid ${accentColor}`:undefined}}>
            {t==='chat'?'💬 Chat':t==='members'?`👥 (${members.length})`:t==='games'?'🎮 Games':'⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab==='chat' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* Welcome message */}
              {room.welcome_message && messages.length===0 && (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">{preset?.emoji||'🏠'}</div>
                  <p className="text-sm font-bold" style={{color:accentColor}}>{room.welcome_message}</p>
                </div>
              )}
              {messages.map(msg=>{
                const mine = msg.sender_id===profile?.id;
                const sender = msg.sender as Profile;
                return (
                  <div key={msg.id} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'}`}>
                    {!mine && <Avatar profile={sender||{}} size={28}/>}
                    <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-0.5`}>
                      {!mine && <span className="text-xs font-bold px-1" style={{color:accentColor}}>{sender?.display_name||sender?.username}</span>}
                      <div className="px-4 py-2.5 rounded-2xl text-sm"
                        style={{background:mine?accentColor+22:'rgba(255,255,255,0.9)',border:`1px solid ${accentColor}33`,borderRadius:mine?'20px 20px 4px 20px':'20px 20px 20px 4px',color:'var(--color-text)'}}>
                        {msg.content}
                      </div>
                      <span className="text-xs px-1" style={{color:'var(--color-text-muted)'}}>{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef}/>
            </div>
            <form onSubmit={sendMessage} className="flex items-end gap-2 p-4 safe-bottom flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',backdropFilter:'blur(8px)',borderTop:`1px solid ${accentColor}22`}}>
              <textarea value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px';}}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
                placeholder="Say something nice... ♡" rows={1}
                className="flex-1 py-3 px-4 rounded-2xl resize-none text-sm"
                style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`,outline:'none',minHeight:44,maxHeight:100,fontFamily:"'Nunito',sans-serif"}}/>
              <button type="submit" disabled={!input.trim()} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-110" style={{background:accentColor,color:'white'}}>
                <Send size={16}/>
              </button>
            </form>
          </>
        )}

        {tab==='members' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {members.map(m=>{
              const mp = m.profile as Profile;
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{background:'rgba(255,255,255,0.7)'}}>
                  <div className="relative"><Avatar profile={mp||{}} size={40}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:mp?.is_online?'#4ADE80':'#9CA3AF'}}/></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm theme-text flex items-center gap-1.5">
                      {mp?.display_name||mp?.username}
                      {m.role==='owner'&&<Crown size={12} style={{color:'#FFD97D'}}/>}
                      {m.role==='moderator'&&<Shield size={12} style={{color:accentColor}}/>}
                    </p>
                    <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{mp?.username} · {mp?.is_online?'Online':'Offline'}</p>
                  </div>
                  <span className="text-xs capitalize px-2.5 py-1 rounded-full font-semibold"
                    style={{background:`${accentColor}22`,color:accentColor}}>{m.role}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab==='games' && <GamesTab roomId={roomId} profile={profile} accentColor={accentColor}/>}

        {tab==='settings' && (myRole==='owner'||myRole==='moderator') && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(255,255,255,0.8)'}}>
              <h3 className="font-black theme-text">Room Info</h3>
              <div>
                <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>Invite Code</p>
                <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm" style={{background:'var(--color-secondary)'}}>
                  <span className="flex-1 font-bold tracking-widest">{room.invite_code}</span>
                  <button onClick={copyInviteCode} className="p-1.5 rounded-lg" style={{background:accentColor,color:'white'}}>
                    {copied?<Check size={14}/>:<Copy size={14}/>}
                  </button>
                </div>
              </div>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Share this code with your friends so they can join!</p>
            </div>
            <div className="space-y-2">
              {myRole!=='owner' && (
                <button onClick={leaveRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.08)',color:'#FF6B6B'}}>
                  <LogOut size={16}/>Leave Room
                </button>
              )}
              {myRole==='owner' && (
                <button onClick={deleteRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>
                  <Trash2 size={16}/>Delete Room
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// GAMES TAB — All 4 games inline
// ============================================================
function GamesTab({ roomId, profile, accentColor }: { roomId: string; profile: Profile|null; accentColor: string }) {
  const [gameType, setGameType] = useState<string|null>(null);
  const [game, setGame] = useState<Game|null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);

  async function startGame(type: string) {
    if (!profile) return;
    const supabase = createClient();
    let initialState: any = {};
    if (type==='tictactoe') initialState = { board: Array(9).fill(null), currentPlayer: profile.id, playerX: profile.id, playerO: null, winner: null };
    if (type==='rps') initialState = { choices: {}, winner: null, round: 1 };
    if (type==='number-guess') initialState = { secret: Math.floor(Math.random()*100)+1, guesses: [], winner: null };
    if (type==='hangman') {
      const words = ['elephant','rainbow','friendship','butterfly','adventure','discovery','telescope','waterfall'];
      const word = words[Math.floor(Math.random()*words.length)];
      initialState = { word, guessed: [], wrongGuesses: [], winner: null, maxWrong: 6 };
    }
    const { data: g } = await supabase.from('games').insert({ room_id: roomId, type, status: 'active', state: initialState, created_by: profile.id }).select().single();
    if (g) { setGame(g); setGameState(initialState); setGameType(type); await supabase.from('game_players').insert({ game_id: g.id, user_id: profile.id }); }
  }

  if (!gameType) return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-sm font-bold mb-4 theme-text">Choose a game to play with your friends!</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { type:'tictactoe', emoji:'⭕', name:'Tic Tac Toe', desc:'2 players' },
          { type:'rps', emoji:'✊', name:'Rock Paper Scissors', desc:'2 players' },
          { type:'number-guess', emoji:'🔢', name:'Number Guess', desc:'Multiplayer' },
          { type:'hangman', emoji:'🔡', name:'Hangman', desc:'Multiplayer' },
        ].map(g=>(
          <button key={g.type} onClick={()=>startGame(g.type)}
            className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]"
            style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">{g.emoji}</span>
            <span className="font-black text-sm theme-text">{g.name}</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>{g.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={()=>{setGameType(null);setGame(null);}} className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}>
          <ArrowLeft size={16} style={{color:accentColor}}/>
        </button>
        <span className="font-black theme-text">{gameType==='tictactoe'?'Tic Tac Toe':gameType==='rps'?'Rock Paper Scissors':gameType==='number-guess'?'Number Guess':'Hangman'}</span>
      </div>
      {gameType==='tictactoe' && game && <TicTacToe game={game} state={gameState} profile={profile} accentColor={accentColor} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='rps' && game && <RPS game={game} state={gameState} profile={profile} accentColor={accentColor} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='number-guess' && game && <NumberGuess game={game} state={gameState} profile={profile} accentColor={accentColor} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='hangman' && game && <Hangman game={game} state={gameState} profile={profile} accentColor={accentColor} onUpdate={(s: any)=>setGameState(s)}/>}
    </div>
  );
}

function TicTacToe({ game, state, profile, accentColor, onUpdate }: any) {
  async function makeMove(idx: number) {
    if (!profile || state.board[idx] || state.winner) return;
    if (state.currentPlayer !== profile.id) return;
    const newBoard = [...state.board];
    const symbol = state.playerX === profile.id ? 'X' : 'O';
    newBoard[idx] = { player: profile.id, symbol };
    const winner = checkWinner(newBoard);
    const nextPlayer = state.playerO && state.currentPlayer===state.playerX ? state.playerO : state.playerX;
    const newState = { ...state, board: newBoard, currentPlayer: nextPlayer, winner };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active', winner_id: winner?.player||null }).eq('id', game.id);
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
        </div>
      ) : (
        <p className="text-sm font-bold text-center theme-text">{myTurn?'Your turn! ✨':'Waiting for other player...'}</p>
      )}
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {state.board.map((cell: any, i: number)=>(
          <button key={i} onClick={()=>makeMove(i)}
            className="aspect-square rounded-2xl text-3xl font-black flex items-center justify-center transition-all hover:scale-105"
            style={{background:cell?`${accentColor}22`:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`,color:accentColor}}>
            {cell?.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

function RPS({ game, state, profile, accentColor, onUpdate }: any) {
  async function choose(choice: string) {
    if (!profile || state.choices[profile.id]) return;
    const newChoices = { ...state.choices, [profile.id]: choice };
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
    const newState = { ...state, choices: newChoices, winner };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active' }).eq('id', game.id);
    onUpdate(newState);
  }
  const myChoice = profile && state.choices[profile.id];
  return (
    <div className="space-y-4 text-center">
      {state.winner ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{state.winner==='draw'?'Draw! 🤝':'Winner decided! 🎉'}</p>
          <div className="mt-2 space-y-1 text-sm">
            {Object.entries(state.choices).map(([pid,c]:any)=>(
              <p key={pid} style={{color:'var(--color-text-muted)'}}>{pid===profile?.id?'You':'Them'}: {c==='rock'?'✊':c==='paper'?'✋':'✌️'} {c}</p>
            ))}
          </div>
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
                style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`}}>
                {opt.e}<span className="text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{opt.v}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NumberGuess({ game, state, profile, accentColor, onUpdate }: any) {
  const [guess, setGuess] = useState('');
  async function makeGuess() {
    const n = parseInt(guess);
    if (isNaN(n)||n<1||n>100) return;
    const isCorrect = n===state.secret;
    const newGuesses = [...state.guesses, { player: profile?.id, value: n, correct: isCorrect, hint: n<state.secret?'Too low!':'Too high!' }];
    const newState = { ...state, guesses: newGuesses, winner: isCorrect?profile?.id:null };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: isCorrect?'finished':'active' }).eq('id', game.id);
    onUpdate(newState);
    setGuess('');
  }
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold theme-text text-center">Guess the number between 1 and 100!</p>
      {state.winner ? (
        <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">🎉 Correct! The number was {state.secret}!</p>
        </div>
      ) : (
        <div className="flex gap-2">
          <input type="number" min="1" max="100" value={guess} onChange={e=>setGuess(e.target.value)} onKeyDown={e=>e.key==='Enter'&&makeGuess()}
            placeholder="1–100" className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
          <button onClick={makeGuess} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Guess!</button>
        </div>
      )}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {[...state.guesses].reverse().map((g:any,i:number)=>(
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}>
            <span className="font-black text-lg" style={{color:g.correct?'#4ADE80':accentColor}}>{g.value}</span>
            <span className="text-sm" style={{color:g.correct?'#4ADE80':'var(--color-text-muted)'}}>{g.correct?'✅ Correct!':g.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hangman({ game, state, profile, accentColor, onUpdate }: any) {
  const word: string = state.word||'';
  const guessed: string[] = state.guessed||[];
  const wrongGuesses: string[] = state.wrongGuesses||[];
  const maxWrong = state.maxWrong||6;
  const isWon = word.split('').every((l:string)=>guessed.includes(l));
  const isLost = wrongGuesses.length>=maxWrong;

  async function guessLetter(letter: string) {
    if (guessed.includes(letter)||state.winner||isLost||isWon) return;
    const isCorrect = word.includes(letter);
    const newGuessed = isCorrect?[...guessed,letter]:guessed;
    const newWrong = isCorrect?wrongGuesses:[...wrongGuesses,letter];
    const won = word.split('').every((l:string)=>newGuessed.includes(l));
    const newState = { ...state, guessed: newGuessed, wrongGuesses: newWrong, winner: won?profile?.id:null };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: (won||newWrong.length>=maxWrong)?'finished':'active' }).eq('id', game.id);
    onUpdate(newState);
  }

  const displayWord = word.split('').map((l:string)=>guessed.includes(l)?l:'_').join(' ');
  const remaining = maxWrong-wrongGuesses.length;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

  return (
    <div className="space-y-4 text-center">
      <div className="p-4 rounded-2xl" style={{background:'rgba(255,255,255,0.7)'}}>
        <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>Wrong guesses: {wrongGuesses.length}/{maxWrong} · Remaining: {remaining}</p>
        <div className="text-2xl font-black tracking-widest theme-text my-3">{displayWord}</div>
        {wrongGuesses.length>0 && <p className="text-sm" style={{color:'#FF6B6B'}}>❌ {wrongGuesses.join(', ')}</p>}
      </div>
      {isWon ? <div className="p-4 rounded-2xl font-black text-lg theme-text" style={{background:`${accentColor}22`}}>🎉 You got it! The word was "{word}"!</div>
        : isLost ? <div className="p-4 rounded-2xl font-black text-lg" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>💀 Game over! The word was "{word}"</div>
        : (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {alphabet.map(l=>(
              <button key={l} onClick={()=>guessLetter(l)} disabled={guessed.includes(l)||wrongGuesses.includes(l)}
                className="w-9 h-9 rounded-xl text-sm font-bold transition-all hover:scale-110"
                style={{background:guessed.includes(l)?`${accentColor}44`:wrongGuesses.includes(l)?'rgba(255,107,107,0.2)':'rgba(255,255,255,0.8)',color:guessed.includes(l)?accentColor:wrongGuesses.includes(l)?'#FF6B6B':'var(--color-text)',border:`1px solid ${accentColor}33`,opacity:guessed.includes(l)||wrongGuesses.includes(l)?0.5:1}}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )
      }
    </div>
  );
}

function Loading() {
  return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;
}


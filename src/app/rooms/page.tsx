'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room } from '@/types';
import { DesktopNav, MobileNav } from '@/components/layout/AppLayout';
import { Hash, Plus, Search, Lock, Globe, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const PRESETS = [
  { id:'cloudy-blue', name:'Cloudy Blue', bg:'#DCEBFF', accent:'#7CA8E8', emoji:'☁️' },
  { id:'strawberry-milk', name:'Strawberry Milk', bg:'#FCE3EE', accent:'#E99ABD', emoji:'🍓' },
  { id:'lavender-dreams', name:'Lavender Dreams', bg:'#EDE7F6', accent:'#9575CD', emoji:'💜' },
  { id:'peachy', name:'Peachy', bg:'#FFF3E0', accent:'#FF8A65', emoji:'🍑' },
  { id:'minty-fresh', name:'Minty Fresh', bg:'#E8F5E9', accent:'#66BB6A', emoji:'🌿' },
  { id:'cotton-candy', name:'Cotton Candy', bg:'#FCE4EC', accent:'#F48FB1', emoji:'🩷' },
];

function RoomsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create'|'join'|null>(sp.get('action') as any||null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [preset, setPreset] = useState('cloudy-blue');
  const [maxMembers, setMaxMembers] = useState(50);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof) { router.replace('/login'); return; }
    setProfile(prof);
    document.documentElement.setAttribute('data-theme', prof.theme||'blue');
    const { data: memberOf } = await supabase.from('room_members').select('room_id').eq('user_id', user.id);
    if (memberOf && memberOf.length > 0) {
      const { data: roomData } = await supabase.from('rooms').select('*').in('id', memberOf.map(m=>m.room_id)).order('updated_at', {ascending:false});
      setRooms(roomData||[]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setCreateError('Room name is required.'); return; }
    setCreating(true); setCreateError('');
    const supabase = createClient();
    const selectedPreset = PRESETS.find(p=>p.id===preset);
    const { data: room, error } = await supabase.from('rooms').insert({
      name: name.trim(), description: desc.trim()||null,
      is_private: isPrivate, preset, accent_color: selectedPreset?.accent,
      max_members: maxMembers, owner_id: profile!.id,
      welcome_message: `Welcome to ${name.trim()}! ♡`
    }).select().single();
    if (error || !room) { setCreateError(error?.message||'Failed to create room.'); setCreating(false); return; }
    await supabase.from('room_members').insert({ room_id: room.id, user_id: profile!.id, role: 'owner' });
    setModal(null); setName(''); setDesc('');
    router.push(`/rooms/${room.id}`);
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) { setJoinError('Enter an invite code.'); return; }
    setJoining(true); setJoinError('');
    const supabase = createClient();
    const { data: room } = await supabase.from('rooms').select('*').eq('invite_code', inviteCode.trim().toUpperCase()).single();
    if (!room) { setJoinError('Invalid invite code. Double-check and try again!'); setJoining(false); return; }
    const { data: existing } = await supabase.from('room_members').select('id').eq('room_id', room.id).eq('user_id', profile!.id).single();
    if (existing) { router.push(`/rooms/${room.id}`); return; }
    await supabase.from('room_members').insert({ room_id: room.id, user_id: profile!.id, role: 'member' });
    setModal(null); setInviteCode('');
    router.push(`/rooms/${room.id}`);
  }

  if (loading) return <Loading/>;

  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/rooms"/>
      <main className="md:ml-60 pb-24 md:pb-8">
        <header className="sticky top-0 z-30 px-4 py-4 md:px-8 flex items-center justify-between" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <h1 className="text-lg font-black theme-text flex items-center gap-2"><Hash size={20} style={{color:'var(--color-accent)'}}/>My Rooms</h1>
          <div className="flex gap-2">
            <button onClick={()=>setModal('join')} className="theme-btn-outline px-3 py-2 text-sm flex items-center gap-1.5" style={{borderColor:'var(--color-border)',color:'var(--color-text-muted)'}}>
              <Search size={14}/>Join
            </button>
            <button onClick={()=>setModal('create')} className="theme-btn px-3 py-2 text-sm flex items-center gap-1.5">
              <Plus size={14}/>Create
            </button>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-4xl mx-auto">
          {rooms.length===0 ? (
            <div className="theme-card p-10 text-center space-y-4">
              <div className="text-5xl">🏠</div>
              <p className="font-black text-lg theme-text">No rooms yet!</p>
              <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Create a cozy little room for you and your friends. ♡</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <button onClick={()=>setModal('create')} className="theme-btn px-5 py-2.5 text-sm flex items-center gap-2"><Plus size={15}/>Create Room</button>
                <button onClick={()=>setModal('join')} className="theme-btn-outline px-5 py-2.5 text-sm flex items-center gap-2" style={{borderColor:'var(--color-accent)',color:'var(--color-accent)'}}><Search size={15}/>Join Room</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map(room=>{
                const p = PRESETS.find(x=>x.id===room.preset);
                return (
                  <Link key={room.id} href={`/rooms/${room.id}`}
                    className="theme-card overflow-hidden hover:scale-[1.02] transition-all block"
                    style={{background:p?p.bg:'var(--color-secondary)'}}>
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'rgba(255,255,255,0.6)'}}>
                          {p?.emoji||room.name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm theme-text truncate">{room.name}</p>
                          <p className="text-xs flex items-center gap-1" style={{color:'var(--color-text-muted)'}}>
                            {room.is_private?<><Lock size={10}/>Private</>:<><Globe size={10}/>Public</>}
                          </p>
                        </div>
                        <ArrowRight size={16} style={{color:'var(--color-text-muted)'}}/>
                      </div>
                      {room.description && <p className="text-xs line-clamp-2" style={{color:'var(--color-text-muted)'}}>{room.description}</p>}
                      <div className="mt-2 text-xs font-mono px-2 py-1 rounded-lg inline-block" style={{background:'rgba(255,255,255,0.5)',color:'var(--color-text-muted)'}}>
                        #{room.invite_code}
                      </div>
                    </div>
                  </Link>
                );
              })}
              <button onClick={()=>setModal('create')} className="theme-card border-2 border-dashed p-5 flex flex-col items-center justify-center gap-3 hover:scale-[1.02] transition-all" style={{borderColor:'var(--color-border)',minHeight:140}}>
                <Plus size={24} style={{color:'var(--color-text-muted)'}}/>
                <span className="text-sm font-bold" style={{color:'var(--color-text-muted)'}}>New Room</span>
              </button>
            </div>
          )}
        </div>
      </main>
      <MobileNav active="/rooms"/>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.3)',backdropFilter:'blur(4px)'}}>
          <div className="theme-card w-full max-w-md p-6 space-y-4" style={{maxHeight:'90vh',overflowY:'auto'}}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black theme-text">{modal==='create'?'Create a Room ♡':'Join a Room'}</h2>
              <button onClick={()=>setModal(null)} className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><X size={16}/></button>
            </div>

            {modal==='create' && (
              <form onSubmit={createRoom} className="space-y-4">
                {createError && <div className="p-3 rounded-xl text-sm font-medium" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>{createError}</div>}
                <input type="text" placeholder="Room name *" value={name} onChange={e=>setName(e.target.value)} className="theme-input w-full py-3 px-4 text-sm"/>
                <textarea placeholder="Description (optional)" value={desc} onChange={e=>setDesc(e.target.value)} className="theme-input w-full py-3 px-4 text-sm resize-none" rows={2}/>
                <div>
                  <label className="text-xs font-bold mb-2 block" style={{color:'var(--color-text-muted)'}}>Room Theme</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESETS.map(p=>(
                      <button key={p.id} type="button" onClick={()=>setPreset(p.id)}
                        className="p-3 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all"
                        style={{background:p.bg,border:`2px solid ${preset===p.id?p.accent:'transparent'}`,transform:preset===p.id?'scale(1.05)':'scale(1)'}}>
                        <span className="text-lg">{p.emoji}</span>
                        <span style={{color:p.accent}}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  {[{v:true,l:'🔒 Private',d:'Invite only'},{v:false,l:'🌐 Public',d:'Anyone can join'}].map(opt=>(
                    <button key={String(opt.v)} type="button" onClick={()=>setIsPrivate(opt.v)}
                      className="flex-1 p-3 rounded-xl text-sm font-bold transition-all"
                      style={{background:isPrivate===opt.v?'var(--color-secondary)':'transparent',border:`2px solid ${isPrivate===opt.v?'var(--color-accent)':'var(--color-border)'}`,color:isPrivate===opt.v?'var(--color-accent)':'var(--color-text-muted)'}}>
                      <div>{opt.l}</div><div className="text-xs font-normal mt-0.5">{opt.d}</div>
                    </button>
                  ))}
                </div>
                <button type="submit" disabled={creating} className="theme-btn w-full py-3 text-sm">{creating?'Creating..':'Create Room ♡'}</button>
              </form>
            )}

            {modal==='join' && (
              <form onSubmit={joinRoom} className="space-y-4">
                {joinError && <div className="p-3 rounded-xl text-sm font-medium" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>{joinError}</div>}
                <div>
                  <p className="text-sm mb-3" style={{color:'var(--color-text-muted)'}}>Enter the room invite code you received from a friend.</p>
                  <input type="text" placeholder="Invite code (e.g. AB12CD34)" value={inviteCode}
                    onChange={e=>setInviteCode(e.target.value.toUpperCase())}
                    className="theme-input w-full py-3 px-4 text-sm font-mono text-center tracking-widest uppercase" maxLength={8}/>
                </div>
                <button type="submit" disabled={joining||inviteCode.length<4} className="theme-btn w-full py-3 text-sm">{joining?'Joining..':'Join Room'}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Loading() {
  return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;
}

export default function RoomsPage() {
  return (
    <Suspense fallback={<Loading/>}>
      <RoomsContent/>
    </Suspense>
  );
}

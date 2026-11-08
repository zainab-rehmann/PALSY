'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Friendship, FriendRequest } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import { Search, UserPlus, Check, X, Users, MessageCircle, UserMinus } from 'lucide-react';
import Link from 'next/link';

type Tab = 'friends' | 'search' | 'requests';

function FriendsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab)||'friends');
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof) { router.replace('/login'); return; }
    setProfile(prof);
    document.documentElement.setAttribute('data-theme', prof.theme||'blue');

    const { data: fships } = await supabase.from('friendships').select('*,friend:profiles!friend_id(*)').eq('user_id', user.id);
    setFriends((fships||[]).map(f=>f.friend as Profile));

    const { data: reqs } = await supabase.from('friend_requests').select('*,sender:profiles!sender_id(*)').eq('receiver_id', user.id).eq('status','pending');
    setRequests(reqs||[]);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function search() {
    if (!searchQuery.trim() || searchQuery.length < 2) return;
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('*').or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`).neq('id', profile?.id).limit(20);
    setSearchResults(data||[]);
    setSearching(false);
  }

  async function sendRequest(toId: string) {
    const supabase = createClient();
    await supabase.from('friend_requests').insert({ sender_id: profile!.id, receiver_id: toId });
    await supabase.from('notifications').insert({
      user_id: toId, type: 'friend_request',
      title: 'New friend request!',
      body: `${profile?.display_name||profile?.username} wants to be your friend ♡`,
      data: { sender_id: profile!.id }
    });
    setSearchResults(r => r.filter(p => p.id !== toId));
  }

  async function respond(reqId: string, senderId: string, accept: boolean) {
    const supabase = createClient();
    await supabase.from('friend_requests').update({ status: accept?'accepted':'rejected' }).eq('id', reqId);
    if (accept) {
      await supabase.from('friendships').insert([
        { user_id: profile!.id, friend_id: senderId },
        { user_id: senderId, friend_id: profile!.id }
      ]);
    }
    load();
  }

  async function removeFriend(friendId: string) {
    const supabase = createClient();
    await supabase.from('friendships').delete().or(`and(user_id.eq.${profile!.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${profile!.id})`);
    load();
  }

  if (loading) return <LoadingScreen/>;

  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/friends"/>
      <main className="md:ml-60 pb-24 md:pb-8">
        <header className="sticky top-0 z-30 px-4 py-4 md:px-8 flex items-center gap-4" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <h1 className="text-lg font-black theme-text flex items-center gap-2"><Users size={20} style={{color:'var(--color-accent)'}}/>Friends</h1>
        </header>

        <div className="px-4 md:px-8 pt-4">
          <div className="flex gap-2 p-1 rounded-2xl mb-5" style={{background:'var(--color-secondary)'}}>
            {(['friends','search','requests'] as Tab[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className="flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-all"
                style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?'var(--color-accent)':'var(--color-text-muted)',boxShadow:tab===t?'0 2px 8px var(--color-primary-alpha)':undefined}}>
                {t==='requests'?`Requests${requests.length>0?` (${requests.length})`:''}`:(t==='search'?'Find':t.charAt(0).toUpperCase()+t.slice(1))}
              </button>
            ))}
          </div>

          {tab==='friends' && (
            <div>
              {friends.length===0 ? (
                <EmptyState icon="👥" title="No friends yet" desc="No friends here yet. Let's find your people! ♡" action={<button onClick={()=>setTab('search')} className="theme-btn px-5 py-2.5 text-sm flex items-center gap-2"><UserPlus size={15}/>Find Friends</button>}/>
              ) : (
                <div className="space-y-2">
                  {friends.map(f=>(
                    <div key={f.id} className="theme-card p-4 flex items-center gap-3">
                      <div className="relative"><Avatar profile={f} size={44}/><div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{background:f.is_online?'#4ADE80':'#9CA3AF'}}/></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm theme-text">{f.display_name||f.username}</p>
                        <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{f.username} · {f.is_online?'Online':'Offline'}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/messages/${f.id}`} className="p-2 rounded-xl transition-all" style={{background:'var(--color-secondary)'}}>
                          <MessageCircle size={16} style={{color:'var(--color-accent)'}}/>
                        </Link>
                        <button onClick={()=>removeFriend(f.id)} className="p-2 rounded-xl transition-all" style={{background:'rgba(255,107,107,0.08)'}}>
                          <UserMinus size={16} style={{color:'#FF6B6B'}}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab==='search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
                  <input type="text" placeholder="Search by username or name..." value={searchQuery}
                    onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()}
                    className="theme-input w-full py-3 pl-10 pr-4 text-sm"/>
                </div>
                <button onClick={search} disabled={searching} className="theme-btn px-5 py-3 text-sm">{searching?'..':'Search'}</button>
              </div>
              {searchResults.length>0 && (
                <div className="space-y-2">
                  {searchResults.map(u=>(
                    <div key={u.id} className="theme-card p-4 flex items-center gap-3">
                      <Avatar profile={u} size={44}/>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm theme-text">{u.display_name||u.username}</p>
                        <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{u.username}</p>
                      </div>
                      {friends.some(f=>f.id===u.id) ? (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)'}}>Friends ♡</span>
                      ) : (
                        <button onClick={()=>sendRequest(u.id)} className="theme-btn px-3 py-1.5 text-xs flex items-center gap-1.5">
                          <UserPlus size={13}/>Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {searchQuery && searchResults.length===0 && !searching && (
                <EmptyState icon="🔍" title="No users found" desc={`No results for "${searchQuery}". Try a different username!`}/>
              )}
            </div>
          )}

          {tab==='requests' && (
            <div>
              {requests.length===0 ? (
                <EmptyState icon="📬" title="No pending requests" desc="All caught up! No friend requests waiting. ♡"/>
              ) : (
                <div className="space-y-2">
                  {requests.map(req=>{
                    const sender = req.sender as Profile;
                    return (
                      <div key={req.id} className="theme-card p-4 flex items-center gap-3">
                        <Avatar profile={sender||{}} size={44}/>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm theme-text">{sender?.display_name||sender?.username}</p>
                          <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{sender?.username} wants to be your friend ♡</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>respond(req.id,req.sender_id,true)} className="theme-btn p-2 rounded-xl"><Check size={16}/></button>
                          <button onClick={()=>respond(req.id,req.sender_id,false)} className="p-2 rounded-xl" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}><X size={16}/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <MobileNav active="/friends"/>
    </div>
  );
}

function EmptyState({ icon, title, desc, action }: { icon:string; title:string; desc:string; action?: React.ReactNode }) {
  return (
    <div className="theme-card p-10 text-center space-y-3">
      <div className="text-5xl">{icon}</div>
      <p className="font-black theme-text">{title}</p>
      <p className="text-sm" style={{color:'var(--color-text-muted)'}}>{desc}</p>
      {action}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center theme-bg">
      <div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:i%2===0?'var(--color-primary)':'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<LoadingScreen/>}>
      <FriendsContent/>
    </Suspense>
  );
}

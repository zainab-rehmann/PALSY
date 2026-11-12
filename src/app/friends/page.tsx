'use client';
import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Friendship, FriendRequest } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import { Search, UserPlus, Check, X, Users, MessageCircle, UserMinus } from 'lucide-react';
import { isFreshOnline, presenceLabel } from '@/lib/presence';
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
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const profileRef = useRef<Profile|null>(null);
  profileRef.current = profile;

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

    const { data: sent } = await supabase.from('friend_requests').select('receiver_id').eq('sender_id', user.id).eq('status','pending');
    setPendingIds((sent||[]).map(r=>r.receiver_id));
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Live presence: refresh a friend's online/last-seen the moment it changes.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('friends-presence')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const upd = payload.new as Profile;
        setFriends(prev => prev.map(f => f.id === upd.id ? { ...f, is_online: upd.is_online, last_seen: upd.last_seen } : f));
        setSuggestions(prev => prev.map(f => f.id === upd.id ? { ...f, is_online: upd.is_online, last_seen: upd.last_seen } : f));
        setSearchResults(prev => prev.map(f => f.id === upd.id ? { ...f, is_online: upd.is_online, last_seen: upd.last_seen } : f));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Presence refresh: realtime can lag or drop, so re-read everyone's
  // status every 15s. The re-render is also what flips Online to
  // "last seen ..." once a heartbeat goes stale.
  useEffect(() => {
    const supabase = createClient();
    const t = setInterval(async () => {
      const { data } = await supabase.from('profiles').select('id,is_online,last_seen').limit(100);
      if (!data) return;
      const byId = new Map(data.map(p => [p.id, p]));
      const patch = (list: Profile[]) => list.map(f => {
        const u = byId.get(f.id);
        return u ? { ...f, is_online: u.is_online, last_seen: u.last_seen } : f;
      });
      setFriends(patch);
      setSuggestions(patch);
      setSearchResults(patch);
    }, 15000);
    return () => clearInterval(t);
  }, []);

  // People on PALSY: shown when the Find tab opens, so it is never blank.
  const loadSuggestions = useCallback(async () => {
    if (suggestionsLoaded || !profileRef.current) return;
    setSuggestionsLoaded(true);
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('*').neq('id', profileRef.current.id).order('username', { ascending: true }).limit(20);
    setSuggestions(data||[]);
  }, [suggestionsLoaded]);

  useEffect(() => { if (tab==='search') loadSuggestions(); }, [tab, loadSuggestions]);

  // PostgREST logic-tree characters ( , ( ) ) and LIKE wildcards break the
  // search filter and used to fail silently, showing nothing. Strip them.
  function cleanTerm(q: string) {
    return q.replace(/[,()%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const runSearch = useCallback(async (raw: string) => {
    const q = cleanTerm(raw);
    const me = profileRef.current;
    if (!me) return;
    if (q.length < 2) { setSearchResults([]); setSearched(false); setSearchError(''); return; }
    setSearching(true);
    setSearchError('');
    const supabase = createClient();
    const { data, error } = await supabase.from('profiles').select('*').or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).neq('id', me.id).limit(20);
    if (error) {
      setSearchError('Search could not run just now. Please try again.');
      setSearchResults([]);
    } else {
      setSearchResults(data||[]);
    }
    setSearched(true);
    setSearching(false);
  }, []);

  // Search as you type (debounced), as well as on Search / Enter.
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearched(false); setSearchError(''); return; }
    const t = setTimeout(() => { runSearch(searchQuery); }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, runSearch]);

  async function search() {
    runSearch(searchQuery);
  }

  async function sendRequest(toId: string) {
    const supabase = createClient();
    const me = profileRef.current;
    if (!me) return;
    // Don't send the same request twice.
    const { data: existing } = await supabase.from('friend_requests').select('id').eq('sender_id', me.id).eq('receiver_id', toId).eq('status','pending').limit(1);
    if (existing && existing.length > 0) {
      setPendingIds(ids => [...ids, toId]);
      return;
    }
    const { error } = await supabase.from('friend_requests').insert({ sender_id: me.id, receiver_id: toId });
    if (error) return;
    await supabase.from('notifications').insert({
      user_id: toId, type: 'friend_request',
      title: 'New friend request!',
      body: `${me.display_name||me.username} wants to be your friend ♡`,
      data: { sender_id: me.id }
    });
    // Keep the row visible with a "Requested" badge (removing it made
    // search show "No users found" right after tapping Add).
    setPendingIds(ids => [...ids, toId]);
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

  function userRow(u: Profile) {
    const isFriend = friends.some(f=>f.id===u.id);
    const pending = pendingIds.includes(u.id);
    return (
      <div key={u.id} className="theme-card p-4 flex items-center gap-3">
        <div className="relative"><Avatar profile={u} size={44}/><div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{background:isFreshOnline(u)?'#4ADE80':'#9CA3AF'}}/></div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm theme-text">{u.display_name||u.username}</p>
          <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{u.username} · {presenceLabel(u)}</p>
        </div>
        {isFriend ? (
          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)'}}>Friends ♡</span>
        ) : pending ? (
          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)'}}>Requested</span>
        ) : (
          <button onClick={()=>sendRequest(u.id)} className="theme-btn px-3 py-1.5 text-xs flex items-center gap-1.5">
            <UserPlus size={13}/>Add
          </button>
        )}
      </div>
    );
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
                      <div className="relative"><Avatar profile={f} size={44}/><div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{background:isFreshOnline(f)?'#4ADE80':'#9CA3AF'}}/></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm theme-text">{f.display_name||f.username}</p>
                        <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{f.username} · {presenceLabel(f)}</p>
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
              {searchError && (
                <p className="text-sm text-center font-semibold" style={{color:'#FF6B6B'}}>{searchError}</p>
              )}
              {searchResults.length>0 && (
                <div className="space-y-2">
                  {searchResults.map(u=>userRow(u))}
                </div>
              )}
              {searched && searchResults.length===0 && !searching && !searchError && (
                <EmptyState icon="🔍" title="No users found" desc={`No results for "${searchQuery}". Try a different username!`}/>
              )}
              {!searchQuery.trim() && !searched && suggestions.length>0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold theme-text pt-1">People on PALSY ♡</p>
                  {suggestions.map(u=>userRow(u))}
                </div>
              )}
              {!searchQuery.trim() && !searched && suggestions.length===0 && (
                <EmptyState icon="🔍" title="Find your friends" desc="Type a username or name above — results appear as you type."/>
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

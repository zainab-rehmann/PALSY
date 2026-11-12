'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Friendship } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import { MessageCircle, Search, ChevronRight } from 'lucide-react';
import { isFreshOnline, presenceLabel } from '@/lib/presence';
import Link from 'next/link';

export default function MessagesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) { router.replace('/login'); return; }
      setProfile(prof);
      document.documentElement.setAttribute('data-theme', prof.theme||'blue');
      const { data: fships } = await supabase.from('friendships').select('*,friend:profiles!friend_id(*)').eq('user_id', user.id);
      setFriends((fships||[]).map(f=>f.friend as Profile));
      const { data: un } = await supabase.from('messages').select('sender_id').eq('receiver_id', user.id).is('read_at', null).eq('is_deleted', false);
      const counts: Record<string, number> = {};
      (un||[]).forEach(r=>{ counts[r.sender_id] = (counts[r.sender_id]||0)+1; });
      setUnread(counts);
      setLoading(false);
    })();
  }, [router]);

  // Live presence: refresh each friend's online / last-seen as it changes.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('messages-presence')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const upd = payload.new as Profile;
        setFriends(prev => prev.map(f => f.id === upd.id ? { ...f, is_online: upd.is_online, last_seen: upd.last_seen } : f));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <Loading/>;

  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/messages"/>
      <main className="md:ml-60 pb-24 md:pb-8">
        <header className="sticky top-0 z-30 px-4 py-4 md:px-8 flex items-center" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <h1 className="text-lg font-black theme-text flex items-center gap-2"><MessageCircle size={20} style={{color:'var(--color-accent)'}}/>Messages</h1>
        </header>
        <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-2">
          {friends.length===0 ? (
            <div className="theme-card p-10 text-center space-y-3">
              <div className="text-5xl">💬</div>
              <p className="font-black theme-text">No conversations yet</p>
              <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Add friends to start chatting! ♡</p>
              <Link href="/friends?tab=search" className="theme-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">Find Friends</Link>
            </div>
          ) : friends.map(f=>(
            <Link key={f.id} href={`/messages/${f.id}`} className="theme-card p-4 flex items-center gap-3 hover:scale-[1.01] transition-all">
              <div className="relative"><Avatar profile={f} size={48}/><div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{background:isFreshOnline(f)?'#4ADE80':'#9CA3AF'}}/></div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm theme-text">{f.display_name||f.username}</p>
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{isFreshOnline(f)?'🟢 Online':presenceLabel(f)}</p>
              </div>
              {unread[f.id] ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{background:'var(--color-accent)',color:'#fff'}}>{unread[f.id]} new</span> : null}
              <ChevronRight size={16} style={{color:'var(--color-text-muted)'}}/>
            </Link>
          ))}
        </div>
      </main>
      <MobileNav active="/messages"/>
    </div>
  );
}
function Loading() {
  return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;
}


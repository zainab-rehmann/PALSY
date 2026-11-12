'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room, FriendRequest, Notification } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import NotificationBell from '@/components/NotificationBell';
import { PalsyLogo } from '@/components/branding/PalsyLogo';
import {
  Plus, Hash, MessageCircle, Users, Sparkles, ChevronRight,
  Gamepad2, UserPlus, Circle, Search, Compass
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof) { router.replace('/login'); return; }
    setProfile(prof);

    // Apply theme
    document.documentElement.setAttribute('data-theme', prof.theme || 'blue');

    // Update online status
    await supabase.from('profiles').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id);

    // Load rooms
    const { data: memberOf } = await supabase.from('room_members').select('room_id').eq('user_id', user.id);
    if (memberOf && memberOf.length > 0) {
      const roomIds = memberOf.map(m => m.room_id);
      const { data: roomData } = await supabase.from('rooms').select('*').in('id', roomIds).limit(6);
      setRooms(roomData || []);
    }

    // Load pending friend requests
    const { data: reqs } = await supabase.from('friend_requests').select('*,sender:profiles!sender_id(*)').eq('receiver_id', user.id).eq('status', 'pending');
    setPendingRequests(reqs || []);


    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center theme-bg">
      <div className="text-center space-y-4">
        <PalsyLogo iconSize={56} textSize={40}/>
        <div className="flex gap-2 justify-center">
          {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:i%2===0?'var(--color-primary)':'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}
        </div>
      </div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );


  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/dashboard"/>

      {/* Main content */}
      <main className="md:ml-60 pb-24 md:pb-8">
        {/* Header */}
        <header className="sticky top-0 z-30 px-4 py-3 md:px-8 md:py-5 flex items-center justify-between"
          style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)',backdropFilter:'blur(8px)'}}>
          <div className="md:hidden"><PalsyLogo iconSize={34} textSize={22} colorful/></div>
          <div className="hidden md:block">
            <h1 className="text-xl font-black theme-text">
              Hey, {profile?.display_name || profile?.username}! ♡
            </h1>
            <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Welcome back to your little corner</p>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            {/* Notifications bell */}
            <NotificationBell variant="icon"/>
            <Link href="/settings">
              <Avatar profile={profile||{}} size={36}/>
            </Link>
          </div>
        </header>

        <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
          {/* Mobile greeting */}
          <div className="md:hidden">
            <h1 className="text-xl font-black theme-text">Hey, {profile?.display_name||profile?.username}! ♡</h1>
            <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Welcome back to your little corner</p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href:'/rooms?action=create', icon:Plus, label:'Create Room', color:'var(--color-accent)', bg:'var(--color-secondary)' },
              { href:'/rooms?action=join', icon:Compass, label:'Join Room', color:'var(--color-text)', bg:'var(--color-secondary)' },
              { href:'/friends?tab=search', icon:Search, label:'Find Friends', color:'var(--color-text)', bg:'var(--color-secondary)' },
              { href:'/games', icon:Gamepad2, label:'Play Games', color:'var(--color-text)', bg:'var(--color-secondary)' },
            ].map(({href,icon:Icon,label,color,bg})=>(
              <Link key={href} href={href}
                className="flex items-center gap-3 p-4 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02]"
                style={{background:bg,color,boxShadow:'0 2px 12px var(--color-primary-alpha)'}}>
                <div className="p-2 rounded-xl" style={{background:'var(--color-primary-alpha)'}}><Icon size={18} style={{color:'var(--color-accent)'}}/></div>
                {label}
              </Link>
            ))}
          </div>

          {/* Pending friend requests */}
          {pendingRequests.length > 0 && (
            <div className="theme-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={18} style={{color:'var(--color-accent)'}}/>
                <h2 className="font-black text-sm theme-text">Friend Requests ({pendingRequests.length})</h2>
              </div>
              <div className="space-y-3">
                {pendingRequests.slice(0,3).map((req)=>(
                  <FriendRequestCard key={req.id} request={req} onAction={load}/>
                ))}
              </div>
              {pendingRequests.length > 3 && (
                <Link href="/friends?tab=requests" className="text-xs font-bold mt-3 block text-center" style={{color:'var(--color-accent)'}}>
                  View all {pendingRequests.length} requests →
                </Link>
              )}
            </div>
          )}

          {/* My Rooms */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black text-base theme-text flex items-center gap-2"><Hash size={16} style={{color:'var(--color-accent)'}}/>My Rooms</h2>
              <Link href="/rooms" className="text-xs font-bold" style={{color:'var(--color-accent)'}}>See all</Link>
            </div>
            {rooms.length === 0 ? (
              <div className="theme-card p-8 text-center space-y-3">
                <div className="text-4xl">🏠</div>
                <p className="font-bold theme-text">No rooms yet!</p>
                <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Create a room for you and your friends. ♡</p>
                <Link href="/rooms?action=create" className="theme-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">
                  <Plus size={15}/> Create a Room
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rooms.map(room=><RoomCard key={room.id} room={room}/>)}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link href="/friends" className="theme-card p-4 flex items-center gap-4 hover:scale-[1.01] transition-all">
              <div className="p-3 rounded-2xl" style={{background:'var(--color-secondary)'}}><Users size={22} style={{color:'var(--color-accent)'}}/></div>
              <div>
                <p className="font-bold theme-text">Friends</p>
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Find & connect with people</p>
              </div>
              <ChevronRight size={16} className="ml-auto" style={{color:'var(--color-text-muted)'}}/>
            </Link>
            <Link href="/messages" className="theme-card p-4 flex items-center gap-4 hover:scale-[1.01] transition-all">
              <div className="p-3 rounded-2xl" style={{background:'var(--color-secondary)'}}><MessageCircle size={22} style={{color:'var(--color-accent)'}}/></div>
              <div>
                <p className="font-bold theme-text">Messages</p>
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Private conversations</p>
              </div>
              <ChevronRight size={16} className="ml-auto" style={{color:'var(--color-text-muted)'}}/>
            </Link>
          </div>
        </div>
      </main>

      <MobileNav active="/dashboard"/>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

function FriendRequestCard({ request, onAction }: { request: FriendRequest; onAction: () => void }) {
  const sender = request.sender as Profile;
  async function respond(accept: boolean) {
    const supabase = createClient();
    await supabase.from('friend_requests').update({ status: accept ? 'accepted' : 'rejected' }).eq('id', request.id);
    if (accept) {
      await supabase.from('friendships').insert([
        { user_id: request.sender_id, friend_id: request.receiver_id },
        { user_id: request.receiver_id, friend_id: request.sender_id },
      ]);
    }
    onAction();
  }
  return (
    <div className="flex items-center gap-3">
      <Avatar profile={sender||{}} size={40}/>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm theme-text">{sender?.display_name||sender?.username}</p>
        <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{sender?.username}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>respond(true)} className="theme-btn px-3 py-1.5 text-xs">Accept</button>
        <button onClick={()=>respond(false)} className="theme-btn-outline px-3 py-1.5 text-xs" style={{borderColor:'var(--color-border)',color:'var(--color-text-muted)'}}>Decline</button>
      </div>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const presetColors: Record<string,string> = {
    'cloudy-blue':'#DCEBFF','strawberry-milk':'#FCE3EE','lavender-dreams':'#EDE7F6',
    'peachy':'#FFF3E0','minty-fresh':'#E8F5E9','cotton-candy':'#FCE4EC',
  };
  const bg = room.preset ? presetColors[room.preset] : (room.accent_color ? `${room.accent_color}22` : 'var(--color-secondary)');
  return (
    <Link href={`/rooms/${room.id}`}
      className="theme-card overflow-hidden hover:scale-[1.02] transition-all block"
      style={{background:bg}}>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg" style={{background:'rgba(255,255,255,0.6)'}}>
            {room.avatar_url ? <img src={room.avatar_url} alt={room.name} className="w-10 h-10 rounded-xl object-cover"/> : room.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm theme-text truncate">{room.name}</p>
            <p className="text-xs" style={{color:'var(--color-text-muted)'}}>
              {room.is_private ? '🔒 Private' : '🌐 Public'}
            </p>
          </div>
        </div>
        {room.description && <p className="text-xs line-clamp-2" style={{color:'var(--color-text-muted)'}}>{room.description}</p>}
      </div>
    </Link>
  );
}


'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room, FriendRequest } from '@/types';
import { PalsyLogo } from '@/components/branding/PalsyLogo';
import NotificationBell from '@/components/NotificationBell';
import {
  Home, Users, MessageCircle, Hash, Gamepad2, Settings, Bell, Plus, LogOut,
  Compass, UserPlus, ChevronRight, Circle, Moon
} from 'lucide-react';

function Avatar({ profile, size=36 }: { profile: Partial<Profile>; size?: number }) {
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt={profile.display_name||''} className="rounded-full object-cover" style={{width:size,height:size}}/>;
  }
  const initials = (profile.display_name||profile.username||'?').slice(0,2).toUpperCase();
  const colors = ['#A9C9F5','#F2BBD2','#C5DEFF','#FCE3EE','#E8F4FF','#FDE8F0'];
  const color = colors[(profile.username||'a').charCodeAt(0) % colors.length];
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0"
      style={{width:size,height:size,background:color,color:'#34445C',fontSize:size*0.35}}>
      {initials}
    </div>
  );
}

function MobileNav({ active }: { active: string }) {
  const links = [
    { href:'/dashboard', icon:Home, label:'Home' },
    { href:'/friends', icon:Users, label:'Friends' },
    { href:'/messages', icon:MessageCircle, label:'Chat' },
    { href:'/rooms', icon:Hash, label:'Rooms' },
    { href:'/games', icon:Gamepad2, label:'Games' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 safe-bottom md:hidden" style={{background:'var(--color-surface)',borderTop:'1px solid var(--color-border)'}}>
      <div className="flex">
        {links.map(({href,icon:Icon,label})=>(
          <Link key={href} href={href} className="flex-1 flex flex-col items-center py-2.5 gap-1 transition-all"
            style={{color:active===href?'var(--color-accent)':'var(--color-text-muted)'}}>
            <Icon size={20}/>
            <span className="text-xs font-semibold">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function DesktopNav({ profile, active }: { profile: Profile|null; active: string }) {
  const router = useRouter();
  const links = [
    { href:'/dashboard', icon:Home, label:'Home' },
    { href:'/friends', icon:Users, label:'Friends' },
    { href:'/messages', icon:MessageCircle, label:'Messages' },
    { href:'/rooms', icon:Hash, label:'My Rooms' },
    { href:'/games', icon:Gamepad2, label:'Games' },
    { href:'/settings', icon:Settings, label:'Settings' },
  ];

  async function logout() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 w-60 py-6 px-4 gap-2"
      style={{background:'var(--color-surface)',borderRight:'1px solid var(--color-border)',boxShadow:'2px 0 20px var(--color-primary-alpha)'}}>
      <div className="px-2 mb-6"><PalsyLogo iconSize={32} textSize={24}/></div>
      <div className="flex-1 space-y-1">
        {links.map(({href,icon:Icon,label})=>(
          <Link key={href} href={href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background:active===href?'var(--color-secondary)':'transparent',
              color:active===href?'var(--color-accent)':'var(--color-text)',
            }}>
            <Icon size={18}/>{label}
          </Link>
        ))}
        <NotificationBell variant="navRow"/>
      </div>
      {profile && (
        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:'var(--color-secondary)'}}>
            <Avatar profile={profile} size={36}/>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate theme-text">{profile.display_name||profile.username}</p>
              <p className="text-xs truncate" style={{color:'var(--color-text-muted)'}}>@{profile.username}</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 px-3 py-2 rounded-xl w-full text-sm font-semibold transition-all hover:opacity-80"
            style={{color:'#FF6B6B',background:'rgba(255,107,107,0.08)'}}>
            <LogOut size={16}/> Log Out
          </button>
        </div>
      )}
    </aside>
  );
}

export { Avatar, MobileNav, DesktopNav };


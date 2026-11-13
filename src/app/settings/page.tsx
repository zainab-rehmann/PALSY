'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import { Settings, Palette, User, LogOut, Trash2, Eye, EyeOff, Lock, Bell, Globe, ImagePlus, Check } from 'lucide-react';
import { WALLPAPERS, wallpaperStyle, isCustomWallpaper } from '@/lib/wallpapers';

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<''|'checking'|'available'|'taken'|'invalid'>('');
  const [usernameMsg, setUsernameMsg] = useState('');
  const [bio, setBio] = useState('');
  const [theme, setTheme] = useState<'blue'|'pink'>('blue');
  const [wallpaper, setWallpaper] = useState<string>('default');
  const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [tab, setTab] = useState<'profile'|'appearance'|'notifications'|'account'>('profile');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>('unsupported');
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacySaved, setPrivacySaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) { router.replace('/login'); return; }
      setProfile(prof);
      setDisplayName(prof.display_name||'');
      setUsername(prof.username||'');
      setBio(prof.bio||'');
      setTheme(prof.theme||'blue');
      setWallpaper(prof.wallpaper||'default');
      setNotifEnabled(prof.notifications_enabled !== false);
      setIsPrivate(prof.is_private === true);
      document.documentElement.setAttribute('data-theme', prof.theme||'blue');
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    if ('Notification' in window) setNotifPermission(Notification.permission);
  }, [tab]);

  async function toggleNotifEnabled() {
    if (!profile) return;
    const next = !notifEnabled;
    setNotifEnabled(next);
    const supabase = createClient();
    await supabase.from('profiles').update({ notifications_enabled: next }).eq('id', profile.id);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2500);
  }

  async function askNotifPermission() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    setNotifPermission(result);
  }

  async function setPrivacy(next: boolean) {
    if (!profile || next === isPrivate) return;
    setIsPrivate(next);
    setProfile(p => p ? { ...p, is_private: next } : p);
    const supabase = createClient();
    await supabase.from('profiles').update({ is_private: next }).eq('id', profile.id);
    setPrivacySaved(true);
    setTimeout(() => setPrivacySaved(false), 2500);
  }

  // Username rules (same as signup): lowercase letters, numbers, underscores, 3–20 chars.
  function usernameError(u: string): string {
    if (u.length < 3) return 'Usernames need at least 3 characters.';
    if (u.length > 20) return 'Usernames can be at most 20 characters.';
    if (!/^[a-z0-9_]+$/.test(u)) return 'Only lowercase letters, numbers and underscores — no spaces.';
    return '';
  }

  // Live availability check as the user types (debounced).
  useEffect(() => {
    if (!profile) return;
    const u = username.trim();
    if (u === profile.username) { setUsernameStatus(''); setUsernameMsg(m => m === 'Username updated ✓' ? m : ''); return; }
    const err = usernameError(u);
    if (err) { setUsernameStatus('invalid'); setUsernameMsg(err); return; }
    setUsernameStatus('checking'); setUsernameMsg('Checking…');
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from('profiles').select('id').eq('username', u).neq('id', profile.id).limit(1);
      if (data && data.length > 0) { setUsernameStatus('taken'); setUsernameMsg('✗ That username is taken. Try another! ♡'); }
      else { setUsernameStatus('available'); setUsernameMsg('✓ Username available'); }
    }, 400);
    return () => clearTimeout(t);
  }, [username, profile]);

  async function saveProfile() {
    if (!profile) return;
    const u = username.trim();
    const usernameChanged = u !== profile.username;
    if (usernameChanged) {
      const err = usernameError(u);
      if (err) { setUsernameStatus('invalid'); setUsernameMsg(err); return; }
      // Re-check right before saving, so a name taken a moment ago is refused.
      const supabase = createClient();
      const { data: taken } = await supabase.from('profiles').select('id').eq('username', u).neq('id', profile.id).limit(1);
      if (taken && taken.length > 0) { setUsernameStatus('taken'); setUsernameMsg('✗ That username is taken. Try another! ♡'); return; }
    }
    setSaving(true);
    const supabase = createClient();
    const updates: Record<string, unknown> = { display_name: displayName, bio, theme, wallpaper, updated_at: new Date().toISOString() };
    if (usernameChanged) updates.username = u;
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    if (error) {
      // Race safety: the database unique rule is the final guard.
      if ((error as { code?: string }).code === '23505' || /duplicate|unique/i.test(error.message)) {
        setUsernameStatus('taken'); setUsernameMsg('✗ That username is taken. Try another! ♡');
      } else {
        setUsernameMsg('Could not save just now. Please try again.');
      }
      setSaving(false);
      return;
    }
    if (usernameChanged) {
      setProfile(p => p ? { ...p, username: u } : p);
      setUsernameStatus(''); setUsernameMsg('Username updated ✓');
    }
    document.documentElement.setAttribute('data-theme', theme);
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  }

  async function uploadWallpaper(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingWallpaper(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}/wallpaper-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (!error) {
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
      setWallpaper(pub.publicUrl);
    } else {
      alert('Upload failed. Please try again.');
    }
    setUploadingWallpaper(false);
    if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
  }

  async function changePassword() {
    if (!newPw || newPw.length < 8) return;
    setPwSaving(true);
    const supabase = createClient();
    await supabase.auth.updateUser({ password: newPw });
    setNewPw(''); setPwSaving(false);
    alert('Password updated! ♡');
  }

  async function logout() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').update({ is_online: false, last_seen: new Date().toISOString() }).eq('id', user.id);
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function deleteAccount() {
    if (!confirm('Delete your account? This cannot be undone!')) return;
    router.replace('/login');
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;

  return (
    <div className="min-h-screen theme-bg">
      <DesktopNav profile={profile} active="/settings"/>
      <main className="md:ml-60 pb-24 md:pb-8 max-w-2xl mx-auto">
        <header className="sticky top-0 z-30 px-4 py-4 md:px-8 flex items-center" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <h1 className="text-lg font-black theme-text flex items-center gap-2"><Settings size={20} style={{color:'var(--color-accent)'}}/>Settings</h1>
        </header>

        <div className="p-4 md:p-8 space-y-6">
          {/* Profile section */}
          <div className="flex items-center gap-4 theme-card p-5">
            <Avatar profile={profile||{}} size={56}/>
            <div>
              <p className="font-black theme-text">{profile?.display_name||profile?.username}</p>
              <p className="text-sm" style={{color:'var(--color-text-muted)'}}>@{profile?.username}</p>
              <p className="text-xs mt-0.5" style={{color:'var(--color-text-muted)'}}>{profile?.email}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-1 rounded-2xl" style={{background:'var(--color-secondary)'}}>
            {(['profile','appearance','notifications','account'] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className="flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-all"
                style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?'var(--color-accent)':'var(--color-text-muted)',boxShadow:tab===t?'0 2px 8px var(--color-primary-alpha)':undefined}}>
                {t==='profile'?'👤 Profile':t==='appearance'?'🎨 Theme':t==='notifications'?'🔔 Alerts':'🔒 Account'}
              </button>
            ))}
          </div>

          {tab==='profile' && (
            <div className="theme-card p-6 space-y-4">
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{color:'var(--color-text-muted)'}}>Username</label>
                <input type="text" value={username} maxLength={20}
                  onChange={e=>setUsername(e.target.value.toLowerCase().replace(/\s/g,''))}
                  className="theme-input w-full py-3 px-4 text-sm" placeholder="your_username"/>
                <p className="text-xs mt-1.5" style={{color:'var(--color-text-muted)'}}>Lowercase letters, numbers and underscores only, 3–20 characters, no spaces. Your friends, chats and rooms stay yours — only the name changes.</p>
                {usernameMsg && (
                  <p className="text-xs mt-1.5 font-bold" style={{color:usernameStatus==='available'||usernameMsg==='Username updated ✓'?'#22C55E':usernameStatus==='checking'?'var(--color-text-muted)':'#FF6B6B'}}>{usernameMsg}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{color:'var(--color-text-muted)'}}>Display Name</label>
                <input type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} className="theme-input w-full py-3 px-4 text-sm" placeholder="Your display name"/>
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block" style={{color:'var(--color-text-muted)'}}>Bio</label>
                <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} className="theme-input w-full py-3 px-4 text-sm resize-none" placeholder="Tell us about yourself... ♡"/>
              </div>
              <button onClick={saveProfile} disabled={saving} className="theme-btn w-full py-3 text-sm">{saved?'Saved! ♡':saving?'Saving...':'Save Changes'}</button>
            </div>
          )}

          {tab==='appearance' && (
            <div className="theme-card p-6 space-y-5">
              <div>
                <p className="font-bold mb-3 theme-text">Choose your theme ♡</p>
                <div className="grid grid-cols-2 gap-4">
                  {(['blue','pink'] as const).map(t=>(
                    <button key={t} onClick={()=>setTheme(t)}
                      className="p-5 rounded-2xl border-2 transition-all"
                      style={{
                        background: t==='blue'?'#DCEBFF':'#FCE3EE',
                        borderColor: theme===t?(t==='blue'?'#7CA8E8':'#E99ABD'):'transparent',
                        transform: theme===t?'scale(1.03)':'scale(1)',
                      }}>
                      <div className="text-3xl mb-2">{t==='blue'?'💙':'🩷'}</div>
                      <p className="font-black text-sm" style={{color:t==='blue'?'#34445C':'#614556'}}>{t==='blue'?'Soft Blue':'Soft Pink'}</p>
                      <div className="flex gap-1.5 mt-2 justify-center">
                        {(t==='blue'?['#A9C9F5','#DCEBFF','#7CA8E8']:['#F2BBD2','#FCE3EE','#E99ABD']).map(c=>(
                          <div key={c} className="w-5 h-5 rounded-full" style={{background:c}}/>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {/* Chat wallpaper — your own, only you see it */}
              <div>
                <p className="font-bold mb-1 theme-text">Chat wallpaper ♡</p>
                <p className="text-xs mb-3" style={{color:'var(--color-text-muted)'}}>Your own chat background, only you see it. Tap one to preview it below, then Apply.</p>
                <div className="grid grid-cols-3 gap-3">
                  {WALLPAPERS.map(w=>(
                    <button key={w.id} onClick={()=>setWallpaper(w.id)} className="rounded-2xl overflow-hidden border-2 transition-all" style={{borderColor: wallpaper===w.id?'var(--color-accent)':'transparent', transform: wallpaper===w.id?'scale(1.03)':'scale(1)'}}>
                      <div className="h-16 p-2 flex flex-col justify-end gap-1" style={w.id==='default' ? {background:'var(--color-secondary)'} : w.style}>
                        <div className="self-start px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:'rgba(255,255,255,0.9)',color:'var(--color-text-muted)'}}>hi ♡</div>
                        <div className="self-end px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:'var(--color-bubble-mine)',color:'var(--color-text)'}}>hello!</div>
                      </div>
                      <p className="text-[11px] font-bold py-1.5 flex items-center justify-center gap-1 theme-text">{w.emoji} {w.name}{wallpaper===w.id && <Check size={12} style={{color:'var(--color-accent)'}}/>}</p>
                    </button>
                  ))}
                  {/* Custom upload */}
                  <button onClick={()=>wallpaperInputRef.current?.click()} disabled={uploadingWallpaper} className="rounded-2xl overflow-hidden border-2 transition-all" style={{borderColor: isCustomWallpaper(wallpaper)?'var(--color-accent)':'var(--color-border)', borderStyle:'dashed'}}>
                    <div className="h-16 p-2 flex items-center justify-center" style={isCustomWallpaper(wallpaper) ? wallpaperStyle(wallpaper) : {background:'var(--color-secondary)'}}>
                      {uploadingWallpaper ? <span className="text-[11px] font-bold" style={{color:'var(--color-text-muted)'}}>Uploading…</span> : <ImagePlus size={22} style={{color:'var(--color-accent)'}}/>}
                    </div>
                    <p className="text-[11px] font-bold py-1.5 theme-text">🖼️ Your photo{isCustomWallpaper(wallpaper) && <Check size={12} className="inline ml-1" style={{color:'var(--color-accent)'}}/>}</p>
                  </button>
                </div>
                <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={uploadWallpaper}/>
                {/* Live preview */}
                <div className="mt-4 rounded-2xl overflow-hidden" style={{border:'1px solid var(--color-border)'}}>
                  <div className="px-4 py-3 space-y-2" style={wallpaperStyle(wallpaper)}>
                    <div className="flex"><span className="px-3 py-2 rounded-2xl text-xs" style={{background:'var(--color-bubble-other)',border:'1px solid var(--color-border)'}}>This is how your chats will look ♡</span></div>
                    <div className="flex justify-end"><span className="px-3 py-2 rounded-2xl text-xs" style={{background:'var(--color-bubble-mine)'}}>So cute! ✨</span></div>
                    <div className="flex justify-center"><span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)',border:'1px solid var(--color-border)'}}>Today</span></div>
                  </div>
                </div>
              </div>
              <button onClick={saveProfile} disabled={saving} className="theme-btn w-full py-3 text-sm">{saved?'Theme Applied! ♡':saving?'Applying...':'Apply Theme'}</button>
            </div>
          )}

          {tab==='notifications' && (
            <div className="space-y-4">
              <div className="theme-card p-6 space-y-4">
                <p className="font-bold theme-text flex items-center gap-2"><Bell size={16} style={{color:'var(--color-accent)'}}/>Pop-up notifications</p>
                <div className="flex items-center gap-3">
                  <button type="button" role="switch" aria-checked={notifEnabled} onClick={toggleNotifEnabled}
                    className="relative flex-shrink-0 rounded-full transition-all"
                    style={{width:52,height:30,background:notifEnabled?'var(--color-accent)':'var(--color-border)'}}>
                    <span className="absolute top-1 rounded-full bg-white transition-all" style={{width:22,height:22,left:notifEnabled?27:3,boxShadow:'0 1px 4px rgba(0,0,0,0.25)'}}/>
                  </button>
                  <div>
                    <p className="font-bold text-sm theme-text">{notifEnabled ? 'Pop-ups on ♡' : 'Pop-ups off'}</p>
                    <p className="text-xs" style={{color:'var(--color-text-muted)'}}>
                      {notifEnabled ? 'You will get a little pop-up on this device when a message or friend news arrives.' : 'No pop-ups. Your bell in the navigation still shows everything.'}
                    </p>
                  </div>
                </div>
                {notifSaved && <p className="text-xs font-bold" style={{color:'var(--color-accent)'}}>Saved ♡</p>}
                <div className="pt-3" style={{borderTop:'1px solid var(--color-border)'}}>
                  <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>Browser permission on this device</p>
                  {notifPermission === 'granted' && <p className="text-sm theme-text">✅ Pop-ups are allowed on this device ♡</p>}
                  {notifPermission === 'default' && (
                    <div className="flex items-center gap-3">
                      <p className="text-sm theme-text flex-1">Not decided yet — turn pop-ups on to be asked.</p>
                      <button onClick={askNotifPermission} className="theme-btn px-3 py-2 rounded-xl text-xs font-bold">Turn on</button>
                    </div>
                  )}
                  {notifPermission === 'denied' && (
                    <div>
                      <p className="text-sm theme-text">🚫 Pop-ups are blocked for this site in this browser.</p>
                      <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Tap the lock (or tune) icon in your browser&apos;s address bar → Site settings → Notifications → Allow, then come back and tap Check again.</p>
                      <button onClick={()=>{ if ('Notification' in window) setNotifPermission(Notification.permission); }} className="theme-btn px-3 py-2 rounded-xl text-xs font-bold mt-2">Check again</button>
                    </div>
                  )}
                  {notifPermission === 'unsupported' && <p className="text-sm theme-text">This browser doesn&apos;t support pop-up notifications — the bell still works.</p>}
                </div>
                <p className="text-xs pt-3" style={{color:'var(--color-text-muted)',borderTop:'1px solid var(--color-border)'}}>
                  Muted rooms never pop up and never add bell noise. You can mute or unmute a room in its Settings tab. The bell always keeps your latest notifications, even with pop-ups off.
                </p>
              </div>
            </div>
          )}

          {tab==='account' && (
            <div className="space-y-4">
              <div className="theme-card p-6 space-y-4">
                <p className="font-bold theme-text flex items-center gap-2"><Globe size={16} style={{color:'var(--color-accent)'}}/>Account privacy</p>
                <div className="flex gap-2 p-1 rounded-2xl" style={{background:'var(--color-secondary)'}}>
                  {([false, true] as const).map(v=>(
                    <button key={v?'private':'public'} onClick={()=>setPrivacy(v)}
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{background:isPrivate===v?'var(--color-surface)':'transparent',color:isPrivate===v?'var(--color-accent)':'var(--color-text-muted)',boxShadow:isPrivate===v?'0 2px 8px var(--color-primary-alpha)':undefined}}>
                      {v?'🔒 Private':'🌐 Public'}
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-relaxed" style={{color:'var(--color-text-muted)'}}>
                  {isPrivate
                    ? 'Private: only your friends can see your bio. Everyone can still find you by name and send you a friend request — and every request needs your approval.'
                    : 'Public: everyone can see your bio. Anyone can find you by name and send you a friend request.'}
                </p>
                <p className="text-xs leading-relaxed" style={{color:'var(--color-text-muted)'}}>
                  Your name, photo and online status are always visible, public or private. Privacy never hides your account — you always stay findable.
                </p>
                {privacySaved && <p className="text-xs font-bold" style={{color:'var(--color-accent)'}}>Saved ♡</p>}
              </div>
              <div className="theme-card p-6 space-y-4">
                <p className="font-bold theme-text flex items-center gap-2"><Lock size={16} style={{color:'var(--color-accent)'}}/>Change Password</p>
                <div className="relative">
                  <input type={showPw?'text':'password'} value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password" className="theme-input w-full py-3 px-4 pr-11 text-sm"/>
                  <button type="button" onClick={()=>setShowPw(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}>
                    {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
                  </button>
                </div>
                <button onClick={changePassword} disabled={pwSaving||newPw.length<8} className="theme-btn w-full py-2.5 text-sm">{pwSaving?'Updating...':'Update Password'}</button>
              </div>
              <button onClick={logout} className="w-full p-4 rounded-2xl flex items-center gap-3 font-bold text-sm theme-card" style={{color:'#FF6B6B'}}>
                <LogOut size={18}/>Log Out
              </button>
              <button onClick={deleteAccount} className="w-full p-4 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.08)',color:'#FF6B6B',border:'1px solid rgba(255,107,107,0.2)',borderRadius:16}}>
                <Trash2 size={18}/>Delete Account
              </button>
            </div>
          )}
        </div>
      </main>
      <MobileNav active="/settings"/>
    </div>
  );
}


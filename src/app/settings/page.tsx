'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import { DesktopNav, MobileNav, Avatar } from '@/components/layout/AppLayout';
import { Settings, Palette, User, LogOut, Trash2, Eye, EyeOff, Lock } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [theme, setTheme] = useState<'blue'|'pink'>('blue');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [tab, setTab] = useState<'profile'|'appearance'|'account'>('profile');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) { router.replace('/login'); return; }
      setProfile(prof);
      setDisplayName(prof.display_name||'');
      setBio(prof.bio||'');
      setTheme(prof.theme||'blue');
      document.documentElement.setAttribute('data-theme', prof.theme||'blue');
      setLoading(false);
    })();
  }, [router]);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('profiles').update({ display_name: displayName, bio, theme, updated_at: new Date().toISOString() }).eq('id', profile.id);
    document.documentElement.setAttribute('data-theme', theme);
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
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
            {(['profile','appearance','account'] as const).map(t=>(
              <button key={t} onClick={()=>setTab(t)}
                className="flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-all"
                style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?'var(--color-accent)':'var(--color-text-muted)',boxShadow:tab===t?'0 2px 8px var(--color-primary-alpha)':undefined}}>
                {t==='profile'?'👤 Profile':t==='appearance'?'🎨 Theme':'🔒 Account'}
              </button>
            ))}
          </div>

          {tab==='profile' && (
            <div className="theme-card p-6 space-y-4">
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
              <button onClick={saveProfile} disabled={saving} className="theme-btn w-full py-3 text-sm">{saved?'Theme Applied! ♡':saving?'Applying...':'Apply Theme'}</button>
            </div>
          )}

          {tab==='account' && (
            <div className="space-y-4">
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


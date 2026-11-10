'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Palette } from 'lucide-react';
import { PalsyLogo } from '@/components/branding/PalsyLogo';
import { PasswordStrength, validateEmail, isPasswordValid } from '@/lib/utils/password';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [theme, setTheme] = useState<'blue'|'pink'>('blue');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!email || !username || !password || !confirm) { setError('Please fill in all fields.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { setError('Username can only contain lowercase letters, numbers, and underscores.'); return; }
    if (!isPasswordValid(password)) { setError('Password does not meet all requirements.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const supabase = createClient();

    // Check username uniqueness
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).single();
    if (existing) { setError('This username is already taken. Try another! ♡'); setLoading(false); return; }
    const { data: signupData, error: signupErr } = await supabase.auth.signUp({
            email, password,
            options: {
                      data: { username, theme, display_name: username },
                      emailRedirectTo: `${window.location.origin}/auth/callback`,
            }
    });

        if (signupErr) {
                setError(signupErr.message === 'email rate limit exceeded'
                                 ? 'Too many tries just now — please wait a little while and try again ♡'
                                 : signupErr.message);
                setLoading(false);
                return;
        }
        if (signupData.session) {
                router.replace('/dashboard');
        } else {
                setSuccessMsg('Account created! Check your email to confirm your account, then come back and log in ♡');
                setLoading(false);
        }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'linear-gradient(135deg,#FFF9F0 0%,#FFF1E2 55%,#FFFE3EE100%)'}}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[{s:100,t:'8%',l:'5%',c:'rgba(169,201,245,0.15)',d:'6s'},{s:80,t:'80%',r:'3%',c:'rgba(242,187,210,0.18)',d:'5s'}].map((b,i)=>(
          <div key={i} className="absolute rounded-full" style={{width:b.s,height:b.s,top:b.t,left:(b as any).l,right:(b as any).r,background:b.c,animation:`float ${b.d} ease-in-out infinite`,animationDelay:`${i*0.5}s`}}/>
        ))}
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="flex justify-center mb-8">
          <PalsyLogo iconSize={44} textSize={32} showTagline />
        </div>

        <div className="theme-card p-7 space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-black theme-text">Join PALSY ♡</h1>
            <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Create your little corner</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl text-sm font-medium text-center" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B',border:'1px solid rgba(255,107,107,0.2)'}}>
              {error}
            </div>
          )}

          {successMsg && (
                  <div className="p-3 rounded-xl text-sm font-medium text-center" style={{background:'rgba(255,107,157,0.1)',color:'#D14D7E',border:'1px solid rgba(255,107,157,0.25)'}}>
                    {successMsg}
                  </div>
                )}

          {/* Theme picker */}
          <div>
            <label className="text-xs font-bold mb-2 block flex items-center gap-1.5" style={{color:'var(--color-text-muted)'}}>
              <Palette size={12}/> Choose your theme
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['blue','pink'] as const).map(t=>(
                <button key={t} type="button" onClick={()=>setTheme(t)}
                  className="p-3 rounded-2xl border-2 text-sm font-bold transition-all"
                  style={{
                    background: t==='blue'?'#DCEBFF':'#FCE3EE',
                    color: t==='blue'?'#34445C':'#614556',
                    borderColor: theme===t ? (t==='blue'?'#7CA8E8':'#E99ABD') : 'transparent',
                    transform: theme===t?'scale(1.02)':'scale(1)',
                    boxShadow: theme===t?`0 4px 12px ${t==='blue'?'rgba(169,201,245,0.4)':'rgba(242,187,210,0.4)'}`:undefined,
                  }}>
                  {t==='blue'?'💙 Soft Blue':'🩷 Soft Pink'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-3">
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
              <input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}
                className="theme-input w-full py-3 pl-10 pr-4 text-sm" autoComplete="email"/>
            </div>

            <div className="relative">
              <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
              <input type="text" placeholder="Username (e.g. sunny_girl)" value={username}
                onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                className="theme-input w-full py-3 pl-10 pr-4 text-sm" autoComplete="username"/>
            </div>

            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
              <input type={showPw?'text':'password'} placeholder="Create a password" value={password}
                onChange={e=>setPassword(e.target.value)}
                className="theme-input w-full py-3 pl-10 pr-11 text-sm" autoComplete="new-password"/>
              <button type="button" onClick={()=>setShowPw(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}>
                {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
              </button>
            </div>

            {password && <PasswordStrength password={password}/>}

            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
              <input type={showConfirm?'text':'password'} placeholder="Confirm password" value={confirm}
                onChange={e=>setConfirm(e.target.value)}
                className="theme-input w-full py-3 pl-10 pr-11 text-sm" autoComplete="new-password"/>
              <button type="button" onClick={()=>setShowConfirm(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}>
                {showConfirm?<EyeOff size={15}/>:<Eye size={15}/>}
              </button>
            </div>
            {confirm && password !== confirm && (
              <p className="text-xs" style={{color:'#FF6B6B'}}>Passwords do not match</p>
            )}

            <button type="submit" disabled={loading} className="theme-btn w-full py-3 text-sm flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <div className="flex gap-1.5">{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'white',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div>
              ) : (<><span>Create Account</span><ArrowRight size={15}/></>)}
            </button>
          </form>

          <p className="text-center text-sm" style={{color:'var(--color-text-muted)'}}>
            Already have an account?{' '}
            <Link href="/login" className="font-bold" style={{color:'var(--color-accent)'}}>Log in ♡</Link>
          </p>
        </div>
      </div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </div>
  );
}


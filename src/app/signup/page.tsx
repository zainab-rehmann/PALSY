'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
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
  const [theme, setTheme] = useState<'blue'|'pink'|'autumn'>('blue');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');

  // Username rules (same as Settings): lowercase letters, numbers, underscores, 3–20 chars.
  function usernameError(u: string): string {
    if (u.length < 3) return 'Usernames need at least 3 characters.';
    if (u.length > 20) return 'Usernames can be at most 20 characters.';
    if (!/^[a-z0-9_]+$/.test(u)) return 'Only lowercase letters, numbers and underscores — no spaces.';
    return '';
  }

  // An email must NEVER become a username. The input sanitizer strips @ and .
  // as you type, so a pasted/autofilled email used to slip through as a
  // username (e.g. "maya@gmail.com" -> "mayagmailcom"). Refuse any name
  // that is just the email (or its local part) with punctuation stripped.
  // The username box caps input at 20 characters, so an email pasted in is
  // silently truncated — an exact-equality check would miss it (proven live:
  // 'verifytest@example.com' became 'verifytestexamplec' and slipped past).
  // Flag the name when it equals the sanitized email or its local part,
  // equals either truncated to 20 chars, or is a prefix of the sanitized
  // email longer than the local part (local part + start of the domain).
  function emailDerivedName(u: string, em: string): boolean {
    if (!u || !em) return false;
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cEmail = clean(em);
    const local = clean(em.split('@')[0] || '');
    if (!cEmail) return false;
    if (u === cEmail || (local !== '' && u === local)) return true;
    if (u === cEmail.slice(0, 20) || (local !== '' && u === local.slice(0, 20))) return true;
    if (local !== '' && u.length > local.length && cEmail.startsWith(u)) return true;
    return false;
  }

  // Exact-match helper for the case-insensitive display-name check.
  function escapeIlike(s: string) {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  // Live availability check as the user types (debounced), like Settings.
  // The display name at signup is the username itself, so the name must be
  // free BOTH as a username and as a display name.
  useEffect(() => {
    const u = username.trim();
    if (!u) { setUsernameStatus(''); setUsernameMsg(''); return; }
    const err = usernameError(u);
    if (err) { setUsernameStatus('invalid'); setUsernameMsg(err); return; }
    if (emailDerivedName(u, email)) { setUsernameStatus('invalid'); setUsernameMsg("Please pick a username that isn't your email address ♡"); return; }
    setUsernameStatus('checking'); setUsernameMsg('Checking…');
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from('profiles').select('id').eq('username', u).limit(1);
      if (data && data.length > 0) { setUsernameStatus('taken'); setUsernameMsg('✗ That username is taken. Try another! ♡'); return; }
      const { data: nameTaken } = await supabase.from('profiles').select('id').ilike('display_name', escapeIlike(u)).limit(1);
      if (nameTaken && nameTaken.length > 0) { setUsernameStatus('taken'); setUsernameMsg('✗ That name is already used. Try another! ♡'); }
      else { setUsernameStatus('available'); setUsernameMsg('✓ Username available'); }
    }, 400);
    return () => clearTimeout(t);
  }, [username, email]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!email || !username || !password || !confirm) { setError('Please fill in all fields.'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (username.length > 20) { setError('Username can be at most 20 characters.'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { setError('Username can only contain lowercase letters, numbers, and underscores.'); return; }
    if (emailDerivedName(username, email)) { setError("Please pick a username that isn't your email address ♡"); return; }
    if (usernameStatus === 'taken') { setError('This username is already taken. Try another! ♡'); return; }
    if (!isPasswordValid(password)) { setError('Password does not meet all requirements.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const supabase = createClient();

    // Check username uniqueness (and display-name uniqueness — the display
    // name at signup is the username itself).
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).single();
    if (existing) { setError('This username is already taken. Try another! ♡'); setLoading(false); return; }
    const { data: nameTaken } = await supabase.from('profiles').select('id').ilike('display_name', escapeIlike(username)).limit(1);
    if (nameTaken && nameTaken.length > 0) { setError('That name is already used. Try another! ♡'); setLoading(false); return; }
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
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'blue', label: '💙 Soft Blue', bg: '#DCEBFF', color: '#34445C', border: '#7CA8E8', shadow: 'rgba(169,201,245,0.4)' },
                { id: 'pink', label: '🩷 Soft Pink', bg: '#FCE3EE', color: '#614556', border: '#E99ABD', shadow: 'rgba(242,187,210,0.4)' },
                { id: 'autumn', label: '🍂 Autumn Dark', bg: '#2E2018', color: '#F7EBDD', border: '#E07B39', shadow: 'rgba(224,123,57,0.4)' },
              ] as const).map(t=>(
                <button key={t.id} type="button" onClick={()=>setTheme(t.id)}
                  className="p-3 rounded-2xl border-2 text-sm font-bold transition-all"
                  style={{
                    background: t.bg,
                    color: t.color,
                    borderColor: theme===t.id ? t.border : 'transparent',
                    transform: theme===t.id?'scale(1.02)':'scale(1)',
                    boxShadow: theme===t.id?`0 4px 12px ${t.shadow}`:undefined,
                  }}>
                  {t.label}
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
              <input type="text" placeholder="Username (e.g. sunny_girl)" value={username} maxLength={20}
                onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))}
                className="theme-input w-full py-3 pl-10 pr-4 text-sm" autoComplete="off"/>
            </div>
            <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Lowercase letters, numbers and underscores only, 3–20 characters, no spaces. Pick your own name — never your email address.</p>
            {usernameMsg && (
              <p className="text-xs font-bold" style={{color:usernameStatus==='available'?'#22C55E':usernameStatus==='checking'?'var(--color-text-muted)':'#FF6B6B'}}>{usernameMsg}</p>
            )}

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


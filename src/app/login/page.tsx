'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { PalsyLogo } from '@/components/branding/PalsyLogo';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password. Try again! ♡' : err.message);
      setLoading(false);
    } else {
      router.replace('/dashboard');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#FFF9F0 0%,#FFF1E2 55%,#FFFE3EE100%)' }}>
      {/* Decorative floating elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[{ s: 120, t: '5%', l: '3%', c: 'rgba(169,201,245,0.15)', d: '7s' }, { s: 90, t: '75%', r: '2%', c: 'rgba(242,187,210,0.18)', d: '5s' }, { s: 60, t: '40%', r: '8%', c: 'rgba(220,235,255,0.2)', d: '8s' }].map((b, i) => (
          <div key={i} className="absolute rounded-full" style={{ width: b.s, height: b.s, top: b.t, left: (b as any).l, right: (b as any).r, background: b.c, animation: `float ${b.d} ease-in-out infinite`, animationDelay: `${i * 0.5}s` }} />
        ))}
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <PalsyLogo iconSize={48} textSize={36} showTagline />
        </div>

        {/* Card */}
        <div className="theme-card p-8 space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-black theme-text">Welcome back! ♡</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>Log in to your little corner</p>
          </div>

          {error && (
            <div className="p-3 rounded-xl text-sm font-medium text-center" style={{ background: 'rgba(255,107,107,0.1)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.2)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
                className="theme-input w-full py-3 pl-10 pr-4 text-sm"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                className="theme-input w-full py-3 pl-10 pr-11 text-sm"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Forgot password?</Link>
            </div>

            <button type="submit" disabled={loading} className="theme-btn w-full py-3 text-sm flex items-center justify-center gap-2">
              {loading ? (
                <div className="flex gap-1.5">{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'float 1s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />)}</div>
              ) : (<><span>Log In</span><ArrowRight size={16} /></>)}
            </button>
          </form>

          <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            New here?{' '}
            <Link href="/signup" className="font-bold" style={{ color: 'var(--color-accent)' }}>Create an account ♡</Link>
          </p>
        </div>

        <div className="flex justify-center mt-6 gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <Sparkles size={12} /> <span>Your little corner awaits.</span>
        </div>
      </div>

      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </div>
  );
}


'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft } from 'lucide-react';
import { PalsyLogo } from '@/components/branding/PalsyLogo';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email) { setError('Please enter your email.'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings/reset-password`
    });
    if (err) { setError(err.message); setLoading(false); } else { setSent(true); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'linear-gradient(135deg,#FFF7FA 0%,#F5F9FF 60%,#FCE3EE 100%)'}}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><PalsyLogo iconSize={44} textSize={32}/></div>
        <div className="theme-card p-7 space-y-5">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">📬</div>
              <h2 className="text-xl font-black theme-text">Check your inbox!</h2>
              <p className="text-sm" style={{color:'var(--color-text-muted)'}}>We sent a password reset link to <strong>{email}</strong>. Check your email and follow the link. ♡</p>
              <Link href="/login" className="theme-btn inline-flex items-center gap-2 px-6 py-2.5 text-sm">
                <ArrowLeft size={15}/> Back to Login
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-black theme-text">Reset Password</h1>
                <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Enter your email and we'll send a reset link</p>
              </div>
              {error && <div className="p-3 rounded-xl text-sm font-medium text-center" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{color:'var(--color-text-muted)'}}/>
                  <input type="email" placeholder="your@email.com" value={email} onChange={e=>setEmail(e.target.value)}
                    className="theme-input w-full py-3 pl-10 pr-4 text-sm"/>
                </div>
                <button type="submit" disabled={loading} className="theme-btn w-full py-3 text-sm">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
              <p className="text-center text-sm"><Link href="/login" className="font-bold flex items-center justify-center gap-1" style={{color:'var(--color-accent)'}}><ArrowLeft size={13}/> Back to Login</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


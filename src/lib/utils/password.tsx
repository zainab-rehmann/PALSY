'use client';
export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function validatePassword(pw: string) {
  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasLower: /[a-z]/.test(pw),
    hasNum: /[0-9]/.test(pw),
    hasSpecial: /[^A-Za-z0-9]/.test(pw),
  };
}
export function isPasswordValid(pw: string) {
  const v = validatePassword(pw);
  return Object.values(v).every(Boolean);
}
export function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  const v = validatePassword(pw);
  const passed = Object.values(v).filter(Boolean).length;
  if (passed <= 1) return { score: 20, label: 'Very Weak', color: '#FF6B6B' };
  if (passed === 2) return { score: 40, label: 'Weak', color: '#FFA07A' };
  if (passed === 3) return { score: 60, label: 'Fair', color: '#FFD97D' };
  if (passed === 4) return { score: 80, label: 'Strong', color: '#90EE90' };
  return { score: 100, label: 'Very Strong', color: '#7CA8E8' };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  const v = validatePassword(password);
  if (!password) return null;
  const reqs = [
    { label: 'At least 8 characters', met: v.minLength },
    { label: 'One uppercase letter', met: v.hasUpper },
    { label: 'One lowercase letter', met: v.hasLower },
    { label: 'One number', met: v.hasNum },
    { label: 'One special character', met: v.hasSpecial },
  ];
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:'rgba(169,201,245,0.2)'}}>
          <div style={{height:'100%',width:`${score}%`,background:color,transition:'all 0.4s ease',borderRadius:999}}/>
        </div>
        <span className="text-xs font-bold" style={{color,minWidth:70,textAlign:'right'}}>{label}</span>
      </div>
      <div className="space-y-1">
        {reqs.map((r,i)=>(
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-xs w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0"
              style={{background:r.met?'rgba(124,168,232,0.2)':'rgba(169,201,245,0.1)',color:r.met?'var(--color-accent)':'var(--color-text-muted)',fontSize:10}}>
              {r.met?'✓':'·'}
            </span>
            <span className="text-xs" style={{color:r.met?'var(--color-text)':'var(--color-text-muted)'}}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


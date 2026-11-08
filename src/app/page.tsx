'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const WelcomeScreen = dynamic(() => import('@/components/common/WelcomeScreen'), { ssr: false });

export default function HomePage() {
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const handleWelcomeDone = async () => {
    setShowWelcome(false);
    setIsChecking(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  };

  return (
    <div className="min-h-screen theme-bg">
      {showWelcome && <WelcomeScreen onComplete={handleWelcomeDone} />}
      {isChecking && !showWelcome && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex gap-2">
            {[0,1,2].map(i=>(
              <div key={i} style={{width:10,height:10,borderRadius:'50%',background:i%2===0?'var(--color-primary)':'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

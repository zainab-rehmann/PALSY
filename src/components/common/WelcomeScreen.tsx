'use client';
import { useEffect, useState, useCallback } from 'react';
import { PalsyLogoIcon } from '@/components/branding/PalsyLogo';

const MESSAGES = [
  'Making a little space for friendship...',
  'Gathering your happy moments...',
  'Your little corner is almost ready. ♡',
  'Sprinkling some joy...',
];

const BUBBLES = [
  { size: 160, top: '-5%', left: '-8%', color: 'rgba(169,201,245,0.18)', dur: '8s', delay: '0s' },
  { size: 120, top: '70%', right: '-5%', color: 'rgba(242,187,210,0.2)', dur: '6s', delay: '1s' },
  { size: 90,  top: '15%', right: '10%', color: 'rgba(220,235,255,0.25)', dur: '7s', delay: '0.5s' },
  { size: 70,  top: '60%', left: '5%',  color: 'rgba(252,227,238,0.3)', dur: '5s', delay: '1.5s' },
  { size: 50,  top: '40%', right: '5%', color: 'rgba(169,201,245,0.2)', dur: '9s', delay: '2s' },
  { size: 40,  top: '85%', left: '40%', color: 'rgba(242,187,210,0.25)', dur: '4s', delay: '0.3s' },
];

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(onComplete, 500);
  }, [onComplete]);

  useEffect(() => {
    const msgTimer = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1200);
    const progTimer = setInterval(() => setProgress(p => { if (p >= 100) { clearInterval(progTimer); return 100; } return p + 2.5; }), 50);
    const doneTimer = setTimeout(finish, 2500);
    return () => { clearInterval(msgTimer); clearInterval(progTimer); clearTimeout(doneTimer); };
  }, [finish]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #FFF7FA 0%, #F5F9FF 50%, #FCE3EE 100%)',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}
    >
      {/* Floating bubbles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {BUBBLES.map((b, i) => (
          <div key={i} className="absolute rounded-full" style={{
            width: b.size, height: b.size,
            top: b.top, left: (b as any).left, right: (b as any).right,
            background: b.color,
            animation: `float ${b.dur} ease-in-out infinite`,
            animationDelay: b.delay,
          }}/>
        ))}
        {['12%,20%','78%,65%','45%,80%','88%,15%'].map((pos,i)=>{
          const [t,l]=pos.split(',');
          return <div key={i} className="absolute text-2xl" style={{top:t,left:l,animation:`float ${3+i}s ease-in-out infinite`,animationDelay:`${i*0.4}s`,opacity:0.4}}>♡</div>;
        })}
        {['30%,10%','65%,88%','20%,70%','90%,45%'].map((pos,i)=>{
          const [t,l]=pos.split(',');
          return <div key={i} className="absolute text-sm" style={{top:t,left:l,animation:`float ${2.5+i*0.5}s ease-in-out infinite`,animationDelay:`${i*0.3}s`,opacity:0.5,color:'var(--color-accent)'}}>✦</div>;
        })}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center">
        <div className="animate-pop-in"><PalsyLogoIcon size={110}/></div>

        <div style={{animation:'slideUp 0.5s ease-out 0.3s both',fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:'3rem',color:'#34445C',letterSpacing:'-1px'}}>
          palsy
        </div>

        <div style={{animation:'slideUp 0.5s ease-out 0.5s both',fontWeight:500,fontSize:'0.95rem',color:'#7CA8E8',letterSpacing:'0.5px',marginTop:-16}}>
          your little corner of friendship. ♡
        </div>

        <div key={msgIdx} style={{animation:'fadeIn 0.4s ease-out',fontWeight:500,fontSize:'0.9rem',color:'#6B7E9E',background:'rgba(255,255,255,0.75)',backdropFilter:'blur(8px)',border:'1px solid rgba(169,201,245,0.3)',borderRadius:16,padding:'10px 20px',marginTop:4,minWidth:260}}>
          {MESSAGES[msgIdx]}
        </div>

        {/* Progress */}
        <div style={{width:200,height:6,background:'rgba(169,201,245,0.2)',borderRadius:999,overflow:'hidden',animation:'fadeIn 0.5s ease-out 0.6s both'}}>
          <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,#A9C9F5,#F2BBD2)',borderRadius:999,transition:'width 0.1s linear'}}/>
        </div>

        {/* Dots */}
        <div className="flex gap-2" style={{animation:'fadeIn 0.5s ease-out 0.8s both'}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{width:8,height:8,borderRadius:'50%',background:i%2===0?'#A9C9F5':'#F2BBD2',animation:'float 1.2s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes popIn{0%{transform:scale(0) rotate(-10deg);opacity:0}70%{transform:scale(1.1) rotate(2deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
      `}</style>
    </div>
  );
}


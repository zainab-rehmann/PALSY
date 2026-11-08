'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Message } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { ArrowLeft, Send, Paperclip, Mic, Smile, X } from 'lucide-react';
import Link from 'next/link';

const EMOJI_LIST = ['❤️','😊','😂','🥺','✨','💕','😭','🔥','👍','🎉'];

export default function DMPage() {
  const router = useRouter();
  const params = useParams();
  const friendId = params.friendId as string;
  const [profile, setProfile] = useState<Profile|null>(null);
  const [friend, setFriend] = useState<Profile|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reactionMsg, setReactionMsg] = useState<string|null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) { router.replace('/login'); return; }
      setProfile(prof);
      document.documentElement.setAttribute('data-theme', prof.theme||'blue');

      const { data: fr } = await supabase.from('profiles').select('*').eq('id', friendId).single();
      setFriend(fr);

      // Load messages
      const { data: msgs } = await supabase.from('messages')
        .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages(msgs||[]);
      setLoading(false);

      // Realtime subscription
      const channel = supabase.channel(`dm-${[user.id, friendId].sort().join('-')}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const msg = payload.new as Message;
          if ((msg.sender_id===user.id&&msg.receiver_id===friendId)||(msg.sender_id===friendId&&msg.receiver_id===user.id)) {
            const { data: full } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').eq('id', msg.id).single();
            if (full) setMessages(m=>[...m, full]);
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    })();
  }, [router, friendId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !profile || sending) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: input.trim(), type: 'text'
    });
    if (!error) setInput('');
    setSending(false);
  }

  async function addReaction(msgId: string, emoji: string) {
    const supabase = createClient();
    await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: profile!.id, emoji });
    setReactionMsg(null);
    // Reload messages
    const { data: msgs } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .or(`and(sender_id.eq.${profile!.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile!.id})`)
      .order('created_at', { ascending: true }).limit(100);
    setMessages(msgs||[]);
  }

  async function deleteMessage(msgId: string) {
    const supabase = createClient();
    await supabase.from('messages').update({ is_deleted: true, content: null }).eq('id', msgId).eq('sender_id', profile!.id);
    setMessages(m=>m.map(msg=>msg.id===msgId?{...msg,is_deleted:true,content:null}:msg));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;

  return (
    <div className="flex flex-col h-screen theme-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
        <Link href="/messages" className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><ArrowLeft size={18} style={{color:'var(--color-accent)'}}/></Link>
        {friend && (
          <>
            <div className="relative"><Avatar profile={friend} size={38}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:friend.is_online?'#4ADE80':'#9CA3AF'}}/></div>
            <div>
              <p className="font-black text-sm theme-text">{friend.display_name||friend.username}</p>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{friend.is_online?'🟢 Online':'⚫ Offline'}</p>
            </div>
          </>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg=>{
          const mine = msg.sender_id === profile?.id;
          if (msg.is_deleted) return (
            <div key={msg.id} className={`flex ${mine?'justify-end':'justify-start'}`}>
              <span className="text-xs italic px-3 py-1.5 rounded-2xl" style={{color:'var(--color-text-muted)',background:'var(--color-secondary)'}}>Message deleted</span>
            </div>
          );
          return (
            <div key={msg.id} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'}`}>
              {!mine && <Avatar profile={(msg.sender as Profile)||{}} size={28}/>}
              <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-1`}>
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm relative group cursor-pointer"
                  style={{
                    background: mine?'var(--color-bubble-mine)':'var(--color-bubble-other)',
                    border: mine?undefined:'1px solid var(--color-border)',
                    borderRadius: mine?'20px 20px 4px 20px':'20px 20px 20px 4px',
                  }}
                  onContextMenu={e=>{e.preventDefault();setReactionMsg(msg.id);}}
                >
                  {msg.content}
                  {/* Reaction picker on hover */}
                  {reactionMsg===msg.id && (
                    <div className="absolute bottom-full mb-1 left-0 flex gap-1 p-2 rounded-2xl z-10" style={{background:'var(--color-surface)',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',border:'1px solid var(--color-border)'}}>
                      {EMOJI_LIST.map(e=><button key={e} onClick={()=>addReaction(msg.id,e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
                      <button onClick={()=>setReactionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                    </div>
                  )}
                </div>
                {/* Reactions display */}
                {msg.reactions && msg.reactions.length>0 && (
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(msg.reactions.reduce((acc:Record<string,number>,r:any)=>({...acc,[r.emoji]:(acc[r.emoji]||0)+1}),{})).map(([emoji,count])=>(
                      <button key={emoji} onClick={()=>addReaction(msg.id,emoji)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs" style={{background:'var(--color-secondary)',border:'1px solid var(--color-border)'}}>
                        {emoji} <span style={{color:'var(--color-text-muted)'}}>{count as number}</span>
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-xs" style={{color:'var(--color-text-muted)'}}>
                  {new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {mine && <button onClick={()=>deleteMessage(msg.id)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{color:'#FF6B6B'}}>Delete</button>}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="flex items-end gap-2 p-4 safe-bottom flex-shrink-0" style={{background:'var(--color-surface)',borderTop:'1px solid var(--color-border)'}}>
        <div className="flex-1 relative">
          <textarea
            value={input} onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';}}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
            placeholder="Say something nice... ♡" rows={1}
            className="theme-input w-full py-3 px-4 pr-10 text-sm resize-none"
            style={{minHeight:44,maxHeight:120}}
          />
          <button type="button" onClick={()=>setReactionMsg('picker')} className="absolute right-3 bottom-3" style={{color:'var(--color-text-muted)'}}><Smile size={16}/></button>
        </div>
        <button type="submit" disabled={!input.trim()||sending} className="theme-btn p-3 flex-shrink-0" style={{borderRadius:'50%'}}>
          <Send size={16}/>
        </button>
      </form>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}


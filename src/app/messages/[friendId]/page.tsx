'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Message } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { ArrowLeft, Send, Paperclip, Mic, Smile, X, Square, Play, Pause, Image as ImageIcon, FileText, Check, CheckCheck, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

import EmojiPicker from '@/components/EmojiPicker';
import { isFreshOnline, presenceLabel } from '@/lib/presence';

const EMOJI_LIST = ['❤️','😊','😂','🥺','✨','💕','😭','🔥','👍','🎉'];

export default function DMPage() {
  const router = useRouter();
  const params = useParams();
  const friendId = params.friendId as string;
  const [profile, setProfile] = useState<Profile|null>(null);
  const [friend, setFriend] = useState<Profile|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reactionMsg, setReactionMsg] = useState<string|null>(null);
  const [editing, setEditing] = useState<Message|null>(null);
  const [friendTyping, setFriendTyping] = useState(false);
  const [friendInChat, setFriendInChat] = useState(false);
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastTypingSentRef = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let liveChannels: any[] = [];
    (async () => {
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

      // Chat is open -> everything from this friend counts as read
      await supabase.from('messages')
        .update({ read_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
        .eq('receiver_id', user.id).eq('sender_id', friendId).is('read_at', null);

      // Realtime subscription
      const channel = supabase.channel(`dm-${[user.id, friendId].sort().join('-')}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const msg = payload.new as Message;
          if ((msg.sender_id===user.id&&msg.receiver_id===friendId)||(msg.sender_id===friendId&&msg.receiver_id===user.id)) {
            const { data: full } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').eq('id', msg.id).single();
            if (full && full.sender_id===friendId) {
              setFriendTyping(false);
              const now = new Date().toISOString();
              await supabase.from('messages').update({ read_at: now, delivered_at: now }).eq('id', full.id);
              full.read_at = now; full.delivered_at = now;
            }
            if (full) setMessages(m=>[...m, full]);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const upd = payload.new as Message;
          setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, delivered_at: upd.delivered_at, read_at: upd.read_at } : x));
        })
        .subscribe();

      // Typing indicator (ephemeral broadcast, no database writes)
      const tChan = supabase.channel(`typing-dm-${[user.id, friendId].sort().join('-')}`);
      tChan
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload.user_id === friendId) {
            setFriendTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setFriendTyping(false), 3000);
          }
        })
        .subscribe();
      typingChannelRef.current = tChan;

      // Live presence: refresh the friend's online / last-seen the moment
      // it changes, and learn whether they currently have this chat open.
      const profileChannel = supabase.channel(`dm-profile-${friendId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${friendId}` }, (payload) => {
          const upd = payload.new as Profile;
          setFriend(prev => prev ? { ...prev, is_online: upd.is_online, last_seen: upd.last_seen, display_name: upd.display_name } : prev);
        })
        .subscribe();
      const presenceChannel = supabase.channel(`presence-dm-${[user.id, friendId].sort().join('-')}`, { config: { presence: { key: user.id } } });
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const states = presenceChannel.presenceState();
          const others = Object.values(states).flat() as any[];
          setFriendInChat(others.some(o => o.user_id === friendId && o.in_chat));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await presenceChannel.track({ user_id: user.id, in_chat: true });
        });
      liveChannels = [channel, tChan, profileChannel, presenceChannel];
    })();
    return () => { liveChannels.forEach(c => { try { supabase.removeChannel(c); } catch {} }); };
  }, [router, friendId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop();
    const fileName = `${profile.id}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage.from('media').upload(fileName, file);
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
      let type: 'text' | 'image' | 'video' | 'audio' | 'file' = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      await supabase.from('messages').insert({
        sender_id: profile.id,
        receiver_id: friendId,
        content: file.name,
        media_url: publicUrl,
        type,
      });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return; // Too short
        setUploading(true);
        const supabase = createClient();
        const fileName = `${profile?.id}/voice_${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from('media').upload(fileName, audioBlob, { contentType: 'audio/webm' });
        if (!error && data && profile) {
          const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
          await supabase.from('messages').insert({
            sender_id: profile.id,
            receiver_id: friendId,
            content: 'Voice message',
            media_url: publicUrl,
            type: 'audio',
          });
        }
        setUploading(false);
      };

      recorder.start();
      setIsRecording(true);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordTime(t => t + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied or not available.');
    }
  }

  function stopRecording(send: boolean = true) {
    if (!mediaRecorderRef.current) return;
    clearInterval(recordIntervalRef.current);
    if (!send) {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    } else {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordTime(0);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !profile || sending) return;
    setShowEmojis(false);
    setSending(true);
    const supabase = createClient();
    if (editing) {
      const now = new Date().toISOString();
      const { error } = await supabase.from('messages')
        .update({ content: input.trim(), edited_at: now })
        .eq('id', editing.id).eq('sender_id', profile.id);
      if (!error) {
        setMessages(m=>m.map(x=>x.id===editing.id ? { ...x, content: input.trim(), edited_at: now } : x));
        setEditing(null);
        setInput('');
      }
      setSending(false);
      return;
    }
    const { error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: input.trim(), type: 'text'
    });
    if (!error) setInput('');
    setSending(false);
  }

  // Tap a reaction chip you already added to remove it; otherwise add it.
  async function toggleReaction(msgId: string, emoji: string) {
    const supabase = createClient();
    const msg = messages.find(m => m.id === msgId);
    const mine = msg?.reactions?.some((r: any) => r.user_id === profile!.id && r.emoji === emoji);
    if (mine) {
      await supabase.from('message_reactions').delete().eq('message_id', msgId).eq('user_id', profile!.id).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: profile!.id, emoji });
    }
    // Reload messages
    const { data: msgs } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .or(`and(sender_id.eq.${profile!.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile!.id})`)
      .order('created_at', { ascending: true }).limit(100);
    setMessages(msgs||[]);
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

  // Long-press (touch) opens the same menu as right-click
  const pressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  function startPress(id: string) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(()=>setReactionMsg(id), 450);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  function broadcastTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: profile?.id } });
  }
  function startEdit(msg: Message) {
    setEditing(msg);
    setInput(msg.content||'');
    setReactionMsg(null);
    setTimeout(()=>inputRef.current?.focus(), 50);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;

  return (
    <div className="flex flex-col h-screen theme-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
        <Link href="/messages" className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><ArrowLeft size={18} style={{color:'var(--color-accent)'}}/></Link>
        {friend && (
          <>
            <div className="relative"><Avatar profile={friend} size={38}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:isFreshOnline(friend)?'#4ADE80':'#9CA3AF'}}/></div>
            <div>
              <p className="font-black text-sm theme-text">{friend.display_name||friend.username}</p>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{friendTyping ? 'typing…' : friendInChat ? 'In this chat 💬' : isFreshOnline(friend) ? '🟢 Online' : presenceLabel(friend)}</p>
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
                  onTouchStart={()=>startPress(msg.id)} onTouchEnd={endPress} onTouchMove={endPress}
                >
                  {/* Media Content */}
                  {msg.type === 'image' && msg.media_url && (
                    <div className="mb-2 rounded-xl overflow-hidden max-w-xs">
                      <img src={msg.media_url} alt="shared image" className="w-full object-cover rounded-xl hover:scale-105 transition-transform" />
                    </div>
                  )}
                  {msg.type === 'video' && msg.media_url && (
                    <div className="mb-2 rounded-xl overflow-hidden max-w-xs">
                      <video src={msg.media_url} controls className="w-full rounded-xl" />
                    </div>
                  )}
                  {msg.type === 'audio' && msg.media_url && (
                    <div className="py-1">
                      <audio src={msg.media_url} controls className="h-8 max-w-[220px]" />
                    </div>
                  )}
                  {msg.type === 'file' && msg.media_url && (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-xs py-1">
                      <FileText size={16} /> {msg.content || 'Download Attachment'}
                    </a>
                  )}
                  {msg.type !== 'audio' && msg.type !== 'image' && msg.type !== 'video' && msg.content}
                  {/* Reaction picker on hover */}
                  {reactionMsg===msg.id && (
                    <div className="absolute bottom-full mb-1 left-0 flex flex-col gap-1 p-2 rounded-2xl z-10" style={{background:'var(--color-surface)',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',border:'1px solid var(--color-border)'}}>
                      <div className="flex gap-1">
                      {EMOJI_LIST.map(e=><button key={e} onClick={()=>addReaction(msg.id,e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
                      <button onClick={()=>setReactionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                      </div>
                      {mine && (
                        <div className="flex gap-1 pt-1" style={{borderTop:'1px solid var(--color-border)'}}>
                          {msg.type==='text' && (
                            <button onClick={()=>startEdit(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Pencil size={12}/> Edit</button>
                          )}
                          <button onClick={()=>{deleteMessage(msg.id); setReactionMsg(null);}} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}><Trash2 size={12}/> Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Reactions display */}
                {msg.reactions && msg.reactions.length>0 && (
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(msg.reactions.reduce((acc:Record<string,number>,r:any)=>({...acc,[r.emoji]:(acc[r.emoji]||0)+1}),{})).map(([emoji,count])=>(
                      <button key={emoji} onClick={()=>toggleReaction(msg.id,emoji)} title={msg.reactions?.some((r:any)=>r.user_id===profile?.id&&r.emoji===emoji) ? 'Tap to remove your reaction' : 'Tap to react'} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs" style={{background:'var(--color-secondary)',border:'1px solid var(--color-border)'}}>
                        {emoji} <span style={{color:'var(--color-text-muted)'}}>{count as number}</span>
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-xs" style={{color:'var(--color-text-muted)'}}>
                  {new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {mine && (msg.read_at
                    ? <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold" style={{color:'var(--color-accent)'}}><CheckCheck size={13}/> Seen</span>
                    : msg.delivered_at
                      ? <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><CheckCheck size={13}/></span>
                      : <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><Check size={13}/></span>)}
                  {mine && msg.edited_at && <span className="ml-1 italic">· edited</span>}
                  {mine && <button onClick={()=>deleteMessage(msg.id)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{color:'#FF6B6B'}}>Delete</button>}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
      />
      {friendTyping && (
        <div className="px-4 py-1.5 text-xs flex-shrink-0" style={{background:'var(--color-surface)',color:'var(--color-text-muted)'}}>
          <span className="font-semibold" style={{color:'var(--color-accent)'}}>{friend?.display_name || friend?.username || 'Your friend'}</span> is typing<span className="animate-pulse">…</span>
        </div>
      )}
      {/* Input / Voice Bar */}
      {isRecording ? (
        <div className="flex items-center justify-between p-4 safe-bottom flex-shrink-0 animate-pulse" style={{background:'var(--color-surface)',borderTop:'1px solid var(--color-border)'}}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <span className="text-sm font-bold theme-text">Recording voice note... {recordTime}s</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>stopRecording(false)} className="p-2.5 rounded-full" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>
              <X size={18} />
            </button>
            <button type="button" onClick={()=>stopRecording(true)} className="theme-btn p-2.5 rounded-full">
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={sendMessage} className="relative flex items-end gap-2 p-4 safe-bottom flex-shrink-0" style={{background:'var(--color-surface)',borderTop:'1px solid var(--color-border)'}}>
          {showEmojis && (
            <div className="absolute left-4 z-30" style={{bottom:'calc(100% + 8px)'}}>
              <EmojiPicker onPick={(e)=>{setInput(prev=>prev+e); inputRef.current?.focus();}} />
            </div>
          )}
          {editing && (
            <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2 text-xs z-20" style={{bottom:'100%',background:'var(--color-secondary)',borderTop:'1px solid var(--color-border)',color:'var(--color-text-muted)'}}>
              <Pencil size={12}/>
              <span className="flex-1 truncate">Editing your message</span>
              <button type="button" onClick={()=>{setEditing(null); setInput('');}}><X size={14}/></button>
            </div>
          )}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full transition-all hover:scale-105"
            style={{background:'var(--color-secondary)',color:'var(--color-accent)'}}
            title="Attach file"
          >
            <Paperclip size={18} />
          </button>

          <button
            type="button"
            disabled={uploading}
            onClick={startRecording}
            className="p-3 rounded-full transition-all hover:scale-105"
            style={{background:'var(--color-secondary)',color:'var(--color-accent)'}}
            title="Record voice message"
          >
            <Mic size={18} />
          </button>

          <button
            type="button"
            onClick={() => setShowEmojis(v=>!v)}
            className="p-3 rounded-full transition-all hover:scale-105"
            style={{background: showEmojis ? 'var(--color-accent)' : 'var(--color-secondary)', color: showEmojis ? '#fff' : 'var(--color-accent)'}}
            title="Add emoji"
          >
            <Smile size={18} />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input} onChange={e=>{setInput(e.target.value); broadcastTyping(); e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';}}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
              placeholder={uploading ? "Uploading media..." : "Say something nice... ♡"}
              disabled={uploading}
              rows={1}
              className="theme-input w-full py-3 px-4 text-sm resize-none"
              style={{minHeight:44,maxHeight:120}}
            />
          </div>

          <button type="submit" disabled={!input.trim()||sending||uploading} className="theme-btn p-3 flex-shrink-0" style={{borderRadius:'50%'}}>
            <Send size={16}/>
          </button>
        </form>
      )}
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}


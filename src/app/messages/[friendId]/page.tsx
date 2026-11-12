'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Message } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { ArrowLeft, Send, Paperclip, Mic, Smile, X, Square, Play, Pause, Image as ImageIcon, FileText, Check, CheckCheck, Pencil, Trash2, MoreVertical, Download, ListChecks } from 'lucide-react';
import Link from 'next/link';

import EmojiPicker from '@/components/EmojiPicker';
import { isFreshOnline, presenceLabel, sameDay, dayDividerLabel } from '@/lib/presence';
import { CHAT_PAGE_SIZE, buildTranscript, downloadTextFile, senderName } from '@/lib/chatTools';
import ConfirmDialog from '@/components/ConfirmDialog';

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
  const listRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'deleteSelected' | null>(null);
  const [sendError, setSendError] = useState('');

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

      // Load messages — NEWEST first, then display oldest-to-newest.
      // (The old query loaded the OLDEST 100, so recent messages vanished
      // after reload in any long chat.)
      const { data: msgs } = await supabase.from('messages')
        .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE_SIZE);
      const ordered = [...(msgs||[])].reverse();
      setMessages(ordered);
      setHasMore((msgs||[]).length === CHAT_PAGE_SIZE);
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
            // Dedupe: my own message may already be here via optimistic send.
            if (full) setMessages(m=> m.some(x=>x.id===full.id) ? m : [...m, full]);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const upd = payload.new as Message;
          if (upd.is_deleted) {
            setMessages(m=>m.filter(x=>x.id!==upd.id));
          } else {
            setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, delivered_at: upd.delivered_at, read_at: upd.read_at, content: upd.content, edited_at: upd.edited_at } : x));
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const old = payload.old as Message;
          if (old?.id) setMessages(m=>m.filter(x=>x.id!==old.id));
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

  // Scroll to bottom only when the newest message changes (a new arrival
  // or the first load) — never when older history is prepended.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.id !== lastMsgIdRef.current) {
      lastMsgIdRef.current = last.id;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Presence refresh: realtime can lag or drop, so re-read the friend's
  // status every 10s. The re-render is also what flips Online to
  // "last seen ..." once their heartbeat goes stale.
  useEffect(() => {
    const supabase = createClient();
    const t = setInterval(async () => {
      const { data } = await supabase.from('profiles').select('is_online,last_seen,display_name,username,avatar_url,theme').eq('id', friendId).single();
      if (data) setFriend(prev => (prev ? { ...prev, ...data } : prev));
    }, 10000);
    return () => clearInterval(t);
  }, [friendId]);

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

      const { error: insertErr } = await supabase.from('messages').insert({
        sender_id: profile.id,
        receiver_id: friendId,
        content: file.name,
        media_url: publicUrl,
        type,
      });
      if (insertErr) setSendError("Couldn't send that file. Please try again.");
    } else {
      setSendError("Upload failed. Please try again.");
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
          const { error: insertErr } = await supabase.from('messages').insert({
            sender_id: profile.id,
            receiver_id: friendId,
            content: 'Voice message',
            media_url: publicUrl,
            type: 'audio',
          });
          if (insertErr) setSendError("Couldn't send that voice message. Please try again.");
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
    setSendError('');
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
      } else {
        setSendError("Couldn't save that edit. Please try again.");
      }
      setSending(false);
      return;
    }
    const text = input.trim();
    // Optimistic: show the message instantly instead of waiting on realtime.
    const tempId = `temp-${Date.now()}`;
    const temp: Message = {
      id: tempId, room_id: null, sender_id: profile.id, receiver_id: friendId,
      content: text, media_url: null, delivered_at: null, read_at: null,
      edited_at: null, type: 'text', is_deleted: false, reply_to: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender: profile, reactions: [],
    };
    setMessages(m=>[...m, temp]);
    setInput('');
    const { data, error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: text, type: 'text'
    }).select().single();
    if (!error && data) {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
    } else {
      // Keep the message visible with a retry affordance — never silently lost.
      setMessages(m=>m.map(x=>x.id===tempId ? { ...x, failed: true } : x));
      setSendError("Message couldn't be sent. Tap it to retry.");
    }
    setSending(false);
  }

  async function retrySend(tempId: string) {
    const msg = messages.find(m=>m.id===tempId);
    if (!msg || !profile || !msg.content) return;
    setSendError('');
    const supabase = createClient();
    const { data, error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: msg.content, type: 'text'
    }).select().single();
    if (!error && data) {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
    } else {
      setSendError("Still couldn't send. Check your connection and try again.");
    }
  }

  // Load an older page of history, keeping the scroll position steady.
  async function loadOlder() {
    if (loadingOlder || !messages.length || !profile) return;
    setLoadingOlder(true);
    const supabase = createClient();
    const oldest = messages[0].created_at;
    const el = listRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    const { data } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`)
      .eq('is_deleted', false)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    const older = [...(data||[])].reverse();
    setMessages(m=>[...older, ...m]);
    setHasMore((data||[]).length === CHAT_PAGE_SIZE);
    setLoadingOlder(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  // --- Chat menu actions: export / clear / multi-select delete ---

  async function exportChat() {
    if (!profile) return;
    setShowChatMenu(false);
    const supabase = createClient();
    const all: Message[] = [];
    const PAGE = 200;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase.from('messages')
        .select('*,sender:profiles!sender_id(*)')
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...(data as Message[]));
      if (data.length < PAGE) break;
    }
    const title = `Chat with ${friend?.display_name || friend?.username || 'friend'}`;
    const text = buildTranscript(title, all, (m) => senderName(m, m.sender_id === profile.id ? 'You' : 'Friend'));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`palsy-chat-${friend?.username || 'friend'}-${stamp}.txt`, text);
  }

  async function clearChat() {
    if (!profile) return;
    const supabase = createClient();
    await supabase.from('messages').delete()
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`);
    setMessages([]);
    setHasMore(false);
    setConfirmAction(null);
  }

  async function deleteSelected() {
    if (!profile || selectedIds.size === 0) return;
    const supabase = createClient();
    const ids = [...selectedIds];
    await supabase.from('messages').delete().in('id', ids);
    setMessages(m=>m.filter(x=>!selectedIds.has(x.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
    setConfirmAction(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function refreshReactions(msgId: string) {
    const supabase = createClient();
    const { data } = await supabase.from('message_reactions').select('*').eq('message_id', msgId);
    setMessages(m=>m.map(x=>x.id===msgId ? { ...x, reactions: data||[] } : x));
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
    await refreshReactions(msgId);
  }
async function addReaction(msgId: string, emoji: string) {
    const supabase = createClient();
    await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: profile!.id, emoji });
    setReactionMsg(null);
    await refreshReactions(msgId);
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
      {selectMode ? (
        <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <button onClick={()=>{setSelectMode(false); setSelectedIds(new Set());}} className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><X size={18} style={{color:'var(--color-accent)'}}/></button>
          <p className="font-black text-sm theme-text flex-1">{selectedIds.size} selected</p>
          <button onClick={()=>setSelectedIds(new Set(messages.filter(m=>!m.is_deleted && !m.id.startsWith('temp-')).map(m=>m.id)))} className="text-xs font-bold px-3 py-2 rounded-xl" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}>Select all</button>
          <button onClick={()=>{ if (selectedIds.size>0) setConfirmAction('deleteSelected'); }} disabled={selectedIds.size===0} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white" style={{background:'#FF6B6B',opacity:selectedIds.size===0?0.5:1}}><Trash2 size={14}/> Delete</button>
        </header>
      ) : (
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
        <Link href="/messages" className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><ArrowLeft size={18} style={{color:'var(--color-accent)'}}/></Link>
        {friend && (
          <>
            <div className="relative"><Avatar profile={friend} size={38}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:isFreshOnline(friend)?'#4ADE80':'#9CA3AF'}}/></div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm theme-text">{friend.display_name||friend.username}</p>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{friendTyping ? 'typing…' : friendInChat ? 'In this chat 💬' : isFreshOnline(friend) ? '🟢 Online' : presenceLabel(friend)}</p>
            </div>
          </>
        )}
        <div className="relative">
          <button onClick={()=>setShowChatMenu(v=>!v)} className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}} title="Chat options"><MoreVertical size={18} style={{color:'var(--color-accent)'}}/></button>
          {showChatMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={()=>setShowChatMenu(false)}/>
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl p-2 z-40 space-y-1" style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 8px 30px rgba(0,0,0,0.12)'}}>
                <button onClick={exportChat} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Download size={16} style={{color:'var(--color-accent)'}}/> Export chat</button>
                <button onClick={()=>{setShowChatMenu(false); setSelectMode(true);}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ListChecks size={16} style={{color:'var(--color-accent)'}}/> Select messages</button>
                <button onClick={()=>{setShowChatMenu(false); setConfirmAction('clear');}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'#FF6B6B'}}><Trash2 size={16}/> Clear chat</button>
              </div>
            </>
          )}
        </div>
      </header>
      )}
      {sendError && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(255,107,107,0.12)',color:'#FF6B6B'}}>{sendError} <button onClick={()=>setSendError('')} className="underline ml-1">Dismiss</button></div>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasMore && messages.length > 0 && (
          <div className="flex justify-center pb-1">
            <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-bold px-4 py-2 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-accent)',border:'1px solid var(--color-border)'}}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</button>
          </div>
        )}
        {messages.map((msg, i)=>{
          const mine = msg.sender_id === profile?.id;
          // WhatsApp-style day divider: Today / Yesterday / full date.
          const prev = messages[i-1];
          const divider = (!prev || !sameDay(prev.created_at, msg.created_at)) ? (
            <div className="flex justify-center py-1">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)',border:'1px solid var(--color-border)'}}>{dayDividerLabel(msg.created_at)}</span>
            </div>
          ) : null;
          if (msg.is_deleted) return (
            <Fragment key={msg.id}>
              {divider}
              <div className={`flex ${mine?'justify-end':'justify-start'}`}>
                <span className="text-xs italic px-3 py-1.5 rounded-2xl" style={{color:'var(--color-text-muted)',background:'var(--color-secondary)'}}>Message deleted</span>
              </div>
            </Fragment>
          );
          const selected = selectedIds.has(msg.id);
          return (
            <Fragment key={msg.id}>
              {divider}
            <div className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'} ${selected?'rounded-2xl':''}`} style={selected?{background:'var(--color-secondary)'}:undefined} onClick={selectMode ? ()=>toggleSelect(msg.id) : undefined}>
              {selectMode && (
                <button onClick={(e)=>{e.stopPropagation(); toggleSelect(msg.id);}} className="self-center flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{borderColor:selected?'var(--color-accent)':'var(--color-border)',background:selected?'var(--color-accent)':'transparent',color:'#fff'}}>
                  {selected && <Check size={14}/>}
                </button>
              )}
              {!mine && <Avatar profile={(msg.sender as Profile)||{}} size={28}/>}
              <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-1`}>
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm relative group cursor-pointer"
                  style={{
                    background: mine?'var(--color-bubble-mine)':'var(--color-bubble-other)',
                    border: mine?undefined:'1px solid var(--color-border)',
                    borderRadius: mine?'20px 20px 4px 20px':'20px 20px 20px 4px',
                  }}
                  onContextMenu={e=>{if(selectMode) return; e.preventDefault();setReactionMsg(msg.id);}}
                  onTouchStart={()=>{if(!selectMode) startPress(msg.id);}} onTouchEnd={endPress} onTouchMove={endPress}
                  onClick={msg.failed ? ()=>retrySend(msg.id) : undefined}
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
                  {msg.failed && <button onClick={()=>retrySend(msg.id)} className="ml-1.5 font-bold" style={{color:'#FF6B6B'}}>Not sent · Tap to retry</button>}
                  {mine && !msg.failed && (msg.read_at
                    ? <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold" style={{color:'var(--color-accent)'}}><CheckCheck size={13}/> Seen</span>
                    : msg.delivered_at
                      ? <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><CheckCheck size={13}/></span>
                      : <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><Check size={13}/></span>)}
                  {mine && msg.edited_at && <span className="ml-1 italic">· edited</span>}
                  {mine && <button onClick={()=>deleteMessage(msg.id)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{color:'#FF6B6B'}}>Delete</button>}
                </span>
              </div>
            </div>
            </Fragment>
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
      {confirmAction === 'clear' && (
        <ConfirmDialog
          title="Clear this chat?"
          message="This will delete all messages in this chat for you and your friend. This cannot be undone."
          confirmLabel="Clear chat"
          onConfirm={clearChat}
          onCancel={()=>setConfirmAction(null)}
        />
      )}
      {confirmAction === 'deleteSelected' && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} message${selectedIds.size===1?'':'s'}?`}
          message="These messages will be deleted for everyone in this chat. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={deleteSelected}
          onCancel={()=>setConfirmAction(null)}
        />
      )}
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}


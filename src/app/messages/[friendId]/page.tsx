'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Message } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { ArrowLeft, Send, Paperclip, Mic, Smile, X, Square, Play, Pause, Image as ImageIcon, FileText, Check, CheckCheck, Pencil, Trash2, MoreVertical, Download, ListChecks, Reply, Pin, Star } from 'lucide-react';
import Link from 'next/link';

import EmojiPicker from '@/components/EmojiPicker';
import { isFreshOnline, presenceLabel, sameDay, dayDividerLabel } from '@/lib/presence';
import { CHAT_PAGE_SIZE, buildTranscript, downloadTextFile, senderName, quoteSnippet } from '@/lib/chatTools';
import ConfirmDialog from '@/components/ConfirmDialog';

const EMOJI_LIST = ['❤️','😊','😂','🥺','✨','💕','😭','🔥','👍','🎉','😍','🥰','😮','👏','🙏','💯'];

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
  // Reply / pin / star
  const [replyTo, setReplyTo] = useState<Message|null>(null);
  const [quotedMap, setQuotedMap] = useState<Record<string, Message | null>>({});
  const quotedFetchedRef = useRef<Set<string>>(new Set());
  const [pinnedList, setPinnedList] = useState<Message[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [showStarred, setShowStarred] = useState(false);
  const [starredMessages, setStarredMessages] = useState<Message[]>([]);
  const [highlightId, setHighlightId] = useState<string|null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [jumpNote, setJumpNote] = useState('');

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
            setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, delivered_at: upd.delivered_at, read_at: upd.read_at, content: upd.content, edited_at: upd.edited_at, is_pinned: upd.is_pinned, pinned_at: upd.pinned_at, reply_to_id: upd.reply_to_id } : x));
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

  // Reply quotes + pinned bar: refresh whenever the loaded messages change
  // (first load, realtime arrivals, pin updates from either side).
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const loaded = new Set(messages.map(m=>m.id));
    const missing = [...new Set(messages.map(m=>m.reply_to_id).filter((id): id is string => !!id && !loaded.has(id) && !quotedFetchedRef.current.has(id)))];
    if (missing.length) {
      missing.forEach(id=>quotedFetchedRef.current.add(id));
      supabase.from('messages').select('*,sender:profiles!sender_id(*)').in('id', missing).then(({ data }) => {
        const found = new Map((data||[]).map((m:any)=>[m.id, m as Message]));
        setQuotedMap(prev => { const next = { ...prev }; missing.forEach(id => { next[id] = found.get(id) ?? null; }); return next; });
      });
    }
    supabase.from('messages').select('*,sender:profiles!sender_id(*)')
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`)
      .eq('is_pinned', true).order('pinned_at', { ascending: false })
      .then(({ data }) => { setPinnedList((data||[]) as Message[]); setPinIndex(0); });
  }, [messages, profile, friendId]);

  // My own stars (private — only ever my own rows are readable).
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    supabase.from('message_stars').select('message_id').eq('user_id', profile.id).then(({ data }) => {
      setStarredIds(new Set((data||[]).map((r:any)=>r.message_id)));
    });
  }, [profile]);

  // Escape closes the message menu.
  useEffect(() => {
    if (!reactionMsg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReactionMsg(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reactionMsg]);

  // Jump highlight: scroll to the target message once it is in the DOM.
  useEffect(() => {
    if (!highlightId) return;
    let tries = 0;
    const t = setInterval(() => {
      const el = msgRefs.current[highlightId];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); clearInterval(t); }
      if (++tries > 12) clearInterval(t);
    }, 120);
    return () => clearInterval(t);
  }, [highlightId, messages]);

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
        reply_to_id: replyTo?.id ?? null,
      });
      if (insertErr) setSendError("Couldn't send that file. Please try again.");
    } else {
      setSendError("Upload failed. Please try again.");
    }
    setUploading(false);
    setReplyTo(null);
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
            reply_to_id: replyTo?.id ?? null,
          });
          setReplyTo(null);
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
      reply_to_id: replyTo?.id ?? null, is_pinned: false, pinned_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender: profile, reactions: [],
    };
    setMessages(m=>[...m, temp]);
    setInput('');
    setReplyTo(null);
    const { data, error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: text, type: 'text', reply_to_id: replyTo?.id ?? null
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
      content: msg.content, type: 'text', reply_to_id: msg.reply_to_id ?? null
    }).select().single();
    if (!error && data) {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
    } else {
      setSendError("Still couldn't send. Check your connection and try again.");
    }
  }

  // One older page of history (oldest-first). Shared by the Load-older
  // button and by jump-to-message, which pages until it finds its target.
  async function fetchOlderPage(before: string): Promise<Message[]> {
    const supabase = createClient();
    const { data } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .or(`and(sender_id.eq.${profile!.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile!.id})`)
      .eq('is_deleted', false)
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    return [...(data||[])].reverse() as Message[];
  }

  // Load an older page of history, keeping the scroll position steady.
  async function loadOlder() {
    if (loadingOlder || !messages.length || !profile) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    const older = await fetchOlderPage(messages[0].created_at);
    setMessages(m=>[...older, ...m]);
    setHasMore(older.length === CHAT_PAGE_SIZE);
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
    // Quoted originals, so replies keep their context in the export.
    const replyIds = [...new Set(all.map(m=>m.reply_to_id).filter(Boolean))] as string[];
    const quoteById = new Map<string, Message>();
    if (replyIds.length) {
      const { data: qd } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').in('id', replyIds);
      (qd||[]).forEach((q:any)=>quoteById.set(q.id, q as Message));
    }
    const title = `Chat with ${friend?.display_name || friend?.username || 'friend'}`;
    const text = buildTranscript(title, all, (m) => senderName(m, m.sender_id === profile.id ? 'You' : 'Friend'), (m) => {
      if (!m.reply_to_id) return null;
      const q = quoteById.get(m.reply_to_id);
      if (!q) return '↩ Replying to a deleted message';
      return `↩ Replying to ${senderName(q, q.sender_id === profile.id ? 'You' : 'Friend')}: ${quoteSnippet(q)}`;
    });
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
    setPinnedList([]);
    setReplyTo(null);
    setConfirmAction(null);
  }

  async function deleteSelected() {
    if (!profile || selectedIds.size === 0) return;
    const supabase = createClient();
    const ids = [...selectedIds];
    await supabase.from('messages').delete().in('id', ids);
    setMessages(m=>m.filter(x=>!selectedIds.has(x.id)));
    setReplyTo(null);
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
    setReplyTo(null);
    setTimeout(()=>inputRef.current?.focus(), 50);
  }

  function startReply(msg: Message) {
    setReplyTo(msg);
    setEditing(null);
    setReactionMsg(null);
    setTimeout(()=>inputRef.current?.focus(), 50);
  }

  async function togglePin(msg: Message) {
    setReactionMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('set_message_pinned', { p_message_id: msg.id, p_pin: !msg.is_pinned });
    if (error) { setSendError("Couldn't change that pin. Please try again."); return; }
    setMessages(m=>m.map(x=>x.id===msg.id ? { ...x, is_pinned: !msg.is_pinned, pinned_at: !msg.is_pinned ? new Date().toISOString() : null } : x));
  }

  async function toggleStar(msg: Message) {
    setReactionMsg(null);
    if (!profile) return;
    const supabase = createClient();
    if (starredIds.has(msg.id)) {
      await supabase.from('message_stars').delete().eq('user_id', profile.id).eq('message_id', msg.id);
      setStarredIds(prev => { const n = new Set(prev); n.delete(msg.id); return n; });
    } else {
      await supabase.from('message_stars').insert({ user_id: profile.id, message_id: msg.id });
      setStarredIds(prev => new Set(prev).add(msg.id));
    }
  }

  async function openStarred() {
    setShowChatMenu(false);
    if (!profile) return;
    const supabase = createClient();
    const { data: rows } = await supabase.from('message_stars').select('message_id').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(200);
    const ids = (rows||[]).map((r:any)=>r.message_id);
    if (!ids.length) { setStarredMessages([]); setShowStarred(true); return; }
    const { data } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').in('id', ids).order('created_at', { ascending: false });
    const mine = (data||[]).filter((m:any)=> (m.sender_id===profile.id&&m.receiver_id===friendId)||(m.sender_id===friendId&&m.receiver_id===profile.id));
    setStarredMessages(mine as Message[]);
    setShowStarred(true);
  }

  // Jump to a message (from a quote, the pinned bar, or Starred): load
  // older pages until it is on screen, then scroll + highlight it.
  async function jumpToMessage(id: string) {
    setJumpNote('');
    if (!messages.some(m=>m.id===id) && messages.length) {
      let cursor = messages[0].created_at;
      for (let i = 0; i < 10; i++) {
        const batch = await fetchOlderPage(cursor);
        if (!batch.length) break;
        setMessages(m=>[...batch, ...m]);
        setHasMore(batch.length === CHAT_PAGE_SIZE);
        if (batch.some(m=>m.id===id)) break;
        cursor = batch[0].created_at;
        if (batch.length < CHAT_PAGE_SIZE) break;
        await new Promise(r=>setTimeout(r, 60));
      }
    }
    await new Promise(r=>setTimeout(r, 120));
    setHighlightId(id);
    setTimeout(()=>setHighlightId(h=>h===id?null:h), 2400);
    setTimeout(()=>{
      if (!msgRefs.current[id]) setJumpNote("Couldn't find that message — it may have been deleted.");
    }, 1800);
  }

  // The quoted original for a reply: from loaded messages, else the
  // fetched cache (null = deleted or gone, undefined = still loading).
  function quotedOf(msg: Message): Message | null | undefined {
    if (!msg.reply_to_id) return undefined;
    const inList = messages.find(m=>m.id===msg.reply_to_id);
    if (inList) return inList;
    if (msg.reply_to_id in quotedMap) return quotedMap[msg.reply_to_id];
    return undefined;
  }

  const pinnedCurrent = pinnedList.length ? pinnedList[pinIndex % pinnedList.length] : null;


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
                <button onClick={openStarred} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Star size={16} style={{color:'var(--color-accent)'}}/> Starred messages</button>
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
      {jumpNote && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)'}}>{jumpNote} <button onClick={()=>setJumpNote('')} className="underline ml-1">Dismiss</button></div>
      )}
      {pinnedCurrent && (
        <button onClick={()=>{ jumpToMessage(pinnedCurrent.id); setPinIndex(i=>i+1); }} className="flex items-center gap-2 px-4 py-2 text-left flex-shrink-0" style={{background:'var(--color-secondary)',borderBottom:'1px solid var(--color-border)'}}>
          <Pin size={14} style={{color:'var(--color-accent)'}} className="flex-shrink-0"/>
          <span className="text-xs font-bold truncate" style={{color:'var(--color-text)'}}>{senderName(pinnedCurrent, pinnedCurrent.sender_id === profile?.id ? 'You' : 'Friend')}: <span className="font-normal" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(pinnedCurrent)}</span></span>
          {pinnedList.length > 1 && <span className="text-[11px] font-bold flex-shrink-0" style={{color:'var(--color-accent)'}}>{pinnedList.length} pinned · tap to cycle</span>}
        </button>
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
              <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex ${mine?'justify-end':'justify-start'}`} style={highlightId===msg.id?{outline:'2px solid var(--color-accent)',outlineOffset:2,borderRadius:16}:undefined}>
                <span className="text-xs italic px-3 py-1.5 rounded-2xl" style={{color:'var(--color-text-muted)',background:'var(--color-secondary)'}}>Message deleted</span>
              </div>
            </Fragment>
          );
          const selected = selectedIds.has(msg.id);
          return (
            <Fragment key={msg.id}>
              {divider}
            <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'} ${selected?'rounded-2xl':''}`} style={highlightId===msg.id?{background:'var(--color-secondary)',borderRadius:16,outline:'2px solid var(--color-accent)',outlineOffset:2}:selected?{background:'var(--color-secondary)'}:undefined} onClick={selectMode ? ()=>toggleSelect(msg.id) : undefined}>
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
                  {msg.reply_to_id && (() => {
                    const q = quotedOf(msg);
                    const gone = q === null || (q !== undefined && q !== null && q.is_deleted);
                    return (
                      <button onClick={(e)=>{ e.stopPropagation(); jumpToMessage(msg.reply_to_id!); }} className="block w-full text-left mb-1.5 px-2.5 py-1.5 rounded-xl" style={{background:'rgba(0,0,0,0.06)',borderLeft:'3px solid var(--color-accent)'}}>
                        {gone ? (
                          <span className="text-xs italic" style={{color:'var(--color-text-muted)'}}>Message deleted</span>
                        ) : q ? (
                          <>
                            <span className="block text-xs font-bold" style={{color:'var(--color-accent)'}}>↩ {senderName(q, q.sender_id === profile?.id ? 'You' : 'Friend')}</span>
                            <span className="block text-xs truncate" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(q)}</span>
                          </>
                        ) : (
                          <span className="text-xs" style={{color:'var(--color-text-muted)'}}>…</span>
                        )}
                      </button>
                    );
                  })()}
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
                    <>
                    <div className="fixed inset-0 z-[5]" onClick={()=>setReactionMsg(null)}/>
                    <div className={`absolute bottom-full mb-1 ${mine?'right-0':'left-0'} flex flex-col gap-1 p-2 rounded-2xl z-10`} style={{background:'var(--color-surface)',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',border:'1px solid var(--color-border)'}}>
                      <div className="flex gap-1" style={{flexWrap:'wrap',maxWidth:320}}>
                      {EMOJI_LIST.map(e=><button key={e} onClick={()=>addReaction(msg.id,e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
                      <button onClick={()=>setReactionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                      </div>
                      <div className="flex gap-1 pt-1" style={{borderTop:'1px solid var(--color-border)'}}>
                        <button onClick={()=>startReply(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Reply size={12}/> Reply</button>
                        <button onClick={()=>togglePin(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:msg.is_pinned?'var(--color-accent)':'var(--color-secondary)',color:msg.is_pinned?'#fff':'var(--color-text)'}}><Pin size={12}/> {msg.is_pinned?'Unpin':'Pin'}</button>
                        <button onClick={()=>toggleStar(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Star size={12}/> {starredIds.has(msg.id)?'Unstar':'Star'}</button>
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
                    </>
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
                  {msg.is_pinned && <Pin size={11} className="inline mr-1" style={{color:'var(--color-accent)'}}/>}
                  {starredIds.has(msg.id) && <Star size={11} className="inline mr-1" style={{color:'#F5B301'}}/>}
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
          {replyTo && !editing && (
            <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2 text-xs z-20" style={{bottom:'100%',background:'var(--color-secondary)',borderTop:'1px solid var(--color-border)',color:'var(--color-text-muted)'}}>
              <Reply size={12}/>
              <span className="flex-1 truncate">Replying to <b style={{color:'var(--color-text)'}}>{senderName(replyTo, replyTo.sender_id===profile?.id?'You':'Friend')}</b>: {quoteSnippet(replyTo)}</span>
              <button type="button" onClick={()=>setReplyTo(null)}><X size={14}/></button>
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
      {showStarred && (
        <>
          <div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.35)'}} onClick={()=>setShowStarred(false)}/>
          <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-3xl p-4 max-h-[70vh] overflow-y-auto" style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 12px 40px rgba(0,0,0,0.2)'}}>
            <div className="flex items-center gap-2 mb-3">
              <Star size={18} style={{color:'#F5B301'}}/>
              <p className="font-black text-sm theme-text flex-1">Starred messages</p>
              <button onClick={()=>setShowStarred(false)} className="p-1.5 rounded-full" style={{background:'var(--color-secondary)'}}><X size={14}/></button>
            </div>
            {starredMessages.length===0 ? (
              <p className="text-sm text-center py-6" style={{color:'var(--color-text-muted)'}}>No starred messages yet.<br/>Hold a message and tap Star ⭐ to keep it here — only you can see your stars.</p>
            ) : starredMessages.map(m=>(
              <button key={m.id} onClick={()=>{setShowStarred(false); jumpToMessage(m.id);}} className="w-full text-left px-3 py-2.5 rounded-2xl mb-1.5" style={{background:'var(--color-secondary)'}}>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-bold" style={{color:'var(--color-accent)'}}>{senderName(m, m.sender_id===profile?.id?'You':'Friend')}</span>
                  <span className="text-[11px]" style={{color:'var(--color-text-muted)'}}>{new Date(m.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </span>
                <span className="block text-sm truncate theme-text">{quoteSnippet(m)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}


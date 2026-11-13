'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room, RoomMember, Message, Game } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import {
  ArrowLeft, Send, Users, Gamepad2, Settings, Copy, Check, Hash, Lock,
  Crown, Shield, LogOut, Trash2, X, Share2, Smile, Pencil, Camera, Bell, BellOff, Paperclip, Mic, Square, FileText, RotateCcw, MoreVertical, Download, ListChecks, KeyRound, Dices, Reply, Pin, Star
} from 'lucide-react';
import Link from 'next/link';

import EmojiPicker from '@/components/EmojiPicker';
import { isFreshOnline, presenceLabel, sameDay, dayDividerLabel } from '@/lib/presence';
import { CHAT_PAGE_SIZE, buildTranscript, downloadTextFile, senderName, quoteSnippet } from '@/lib/chatTools';
import { notifyRoom, notifyGame } from '@/lib/notify';
import ConfirmDialog from '@/components/ConfirmDialog';
import EntryCodePrompt from '@/components/EntryCodePrompt';
import { normalizeEntryCode, isValidEntryCode, generateEntryCode } from '@/lib/entryCode';
import { wallpaperStyle } from '@/lib/wallpapers';

const PRESETS: Record<string,{bg:string;accent:string;emoji:string}> = {
  'cloudy-blue':{bg:'#DCEBFF',accent:'#7CA8E8',emoji:'☁️'},
  'strawberry-milk':{bg:'#FCE3EE',accent:'#E99ABD',emoji:'🍓'},
  'lavender-dreams':{bg:'#EDE7F6',accent:'#9575CD',emoji:'💜'},
  'peachy':{bg:'#FFF3E0',accent:'#FF8A65',emoji:'🍑'},
  'minty-fresh':{bg:'#E8F5E9',accent:'#66BB6A',emoji:'🌿'},
  'cotton-candy':{bg:'#FCE4EC',accent:'#F48FB1',emoji:'🩷'},
};

type Tab = 'chat' | 'members' | 'games' | 'settings';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const [profile, setProfile] = useState<Profile|null>(null);
  const [room, setRoom] = useState<Room|null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myRole, setMyRole] = useState<'owner'|'moderator'|'member'>('member');
  const [tab, setTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [actionMsg, setActionMsg] = useState<string|null>(null);
  const [editing, setEditing] = useState<Message|null>(null);
  const [myMuted, setMyMuted] = useState(false);
  const roomPicRef = useRef<HTMLInputElement>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingChannelRef = useRef<any>(null);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSentRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
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
  const [menuBelow, setMenuBelow] = useState(false);
  const [starredLoading, setStarredLoading] = useState(false);
  // Entry-code gate (non-members of coded rooms) + settings (owner)
  const [needsCode, setNeedsCode] = useState(false);
  const [gateError, setGateError] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [savedCode, setSavedCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!prof) { router.replace('/login'); return; }
    setProfile(prof);
    document.documentElement.setAttribute('data-theme', prof.theme||'blue');

    const { data: rm } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!rm) { router.replace('/rooms'); return; }
    setRoom(rm);

    const { data: mems } = await supabase.from('room_members').select('*,profile:profiles(*)').eq('room_id', roomId);
    setMembers(mems||[]);
    const myRow = (mems||[]).find(m=>m.user_id===user.id);
    if (myRow) setMyMuted(!!myRow.muted);

    // Typing indicator channel (ephemeral broadcast, no database writes)
    const tChan = supabase.channel(`typing-room-${roomId}`);
    tChan
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload.user_id || payload.user_id === user.id) return;
        setTypingUsers(prev => ({ ...prev, [payload.user_id]: payload.name || 'Someone' }));
        const prevTimer = typingTimeoutsRef.current.get(payload.user_id);
        if (prevTimer) clearTimeout(prevTimer);
        typingTimeoutsRef.current.set(payload.user_id, setTimeout(() => {
          setTypingUsers(prev => { const n = { ...prev }; delete n[payload.user_id]; return n; });
        }, 3000));
      })
      .subscribe();
    typingChannelRef.current = tChan;
    const myMembership = (mems||[]).find(m=>m.user_id===user.id);
    if (!myMembership) {
      if ((rm as Room).has_entry_code) {
        setNeedsCode(true);
        setLoading(false);
        return;
      }
      router.replace('/rooms'); return;
    }
    setMyRole(myMembership.role);

    const { data: msgs } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*)')
      .eq('room_id', roomId).eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    const ordered = [...(msgs||[])].reverse();
    setMessages(ordered);
    setHasMore((msgs||[]).length === CHAT_PAGE_SIZE);
    setLoading(false);

    // Realtime
    const channel = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
        const { data: full } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').eq('id', payload.new.id).single();
        if (full) setMessages(m=> m.some(x=>x.id===full.id) ? m : [...m, full]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const upd = payload.new as Message;
        if (upd.is_deleted) {
          setMessages(m=>m.filter(x=>x.id!==upd.id));
        } else {
          setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, content: upd.content, edited_at: upd.edited_at, is_pinned: upd.is_pinned, pinned_at: upd.pinned_at, reply_to_id: upd.reply_to_id } : x));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const old = payload.old as Message;
        if (old?.id) setMessages(m=>m.filter(x=>x.id!==old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, roomId]);

  useEffect(() => { load(); }, [load]);
  // Scroll to bottom only when the newest message changes — never when
  // older history is prepended.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.id !== lastMsgIdRef.current) {
      lastMsgIdRef.current = last.id;
      bottomRef.current?.scrollIntoView({behavior:'smooth'});
    }
  }, [messages]);

  // Members presence refresh: realtime can lag or drop, so re-read
  // members' status every 15s. The re-render is also what flips Online
  // to "last seen ..." once a heartbeat goes stale.
  useEffect(() => {
    const supabase = createClient();
    const t = setInterval(async () => {
      const { data: mems } = await supabase.from('room_members').select('*,profile:profiles(*)').eq('room_id', roomId);
      if (mems) setMembers(mems);
    }, 15000);
    return () => clearInterval(t);
  }, [roomId]);

  // Reply quotes + pinned bar: refresh whenever the loaded messages change.
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
      .eq('room_id', roomId).eq('is_pinned', true).order('pinned_at', { ascending: false })
      .then(({ data }) => { setPinnedList((data||[]) as Message[]); setPinIndex(0); });
  }, [messages, profile, roomId]);

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
    if (!actionMsg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActionMsg(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actionMsg]);

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

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !profile) return;
    const supabase = createClient();
    setShowEmojis(false);
    setSendError('');
    if (editing) {
      const now = new Date().toISOString();
      const { error } = await supabase.from('messages').update({ content: input.trim(), edited_at: now }).eq('id', editing.id).eq('sender_id', profile.id);
      if (!error) {
        setMessages(m=>m.map(x=>x.id===editing.id ? { ...x, content: input.trim(), edited_at: now } : x));
        setEditing(null);
        setInput('');
      } else {
        setSendError("Couldn't save that edit. Please try again.");
      }
      return;
    }
    const text = input.trim();
    // Optimistic: show the message instantly instead of waiting on realtime.
    const tempId = `temp-${Date.now()}`;
    const temp: Message = {
      id: tempId, room_id: roomId, sender_id: profile.id, receiver_id: null,
      content: text, media_url: null, delivered_at: null, read_at: null,
      edited_at: null, type: 'text', is_deleted: false, reply_to: null,
      reply_to_id: replyTo?.id ?? null, is_pinned: false, pinned_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender: profile, reactions: [],
    };
    setMessages(m=>[...m, temp]);
    setInput('');
    setReplyTo(null);
    const { data, error } = await supabase.from('messages').insert({ room_id: roomId, sender_id: profile.id, content: text, type: 'text', reply_to_id: replyTo?.id ?? null }).select().single();
    if (!error && data) {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
      if (room) void notifyRoom(supabase, profile, room, members, 'text', text);
    } else {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...x, failed: true } : x));
      setSendError("Message couldn't be sent. Tap it to retry.");
    }
  }

  async function retrySend(tempId: string) {
    const msg = messages.find(m=>m.id===tempId);
    if (!msg || !profile || !msg.content) return;
    setSendError('');
    const supabase = createClient();
    const { data, error } = await supabase.from('messages').insert({ room_id: roomId, sender_id: profile.id, content: msg.content, type: 'text', reply_to_id: msg.reply_to_id ?? null }).select().single();
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
      .eq('room_id', roomId).eq('is_deleted', false)
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    return [...(data||[])].reverse() as Message[];
  }

  // Load an older page of history, keeping the scroll position steady.
  async function loadOlder() {
    if (loadingOlder || !messages.length) return;
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

  async function exportRoomChat() {
    if (!profile) return;
    setShowChatMenu(false);
    const supabase = createClient();
    const all: Message[] = [];
    const PAGE = 200;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase.from('messages')
        .select('*,sender:profiles!sender_id(*)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...(data as Message[]));
      if (data.length < PAGE) break;
    }
    const replyIds = [...new Set(all.map(m=>m.reply_to_id).filter(Boolean))] as string[];
    const quoteById = new Map<string, Message>();
    if (replyIds.length) {
      const { data: qd } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').in('id', replyIds);
      (qd||[]).forEach((q:any)=>quoteById.set(q.id, q as Message));
    }
    const title = `Room: ${room?.name || 'room'}`;
    const text = buildTranscript(title, all, (m) => senderName(m, m.sender_id === profile.id ? 'You' : 'Member'), (m) => {
      if (!m.reply_to_id) return null;
      const q = quoteById.get(m.reply_to_id);
      if (!q) return '↩ Replying to a deleted message';
      return `↩ Replying to ${senderName(q, q.sender_id === profile.id ? 'You' : 'Member')}: ${quoteSnippet(q)}`;
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`palsy-room-${room?.name || 'room'}-${stamp}.txt`, text);
  }

  async function clearRoomChat() {
    const supabase = createClient();
    await supabase.from('messages').delete().eq('room_id', roomId);
    setMessages([]);
    setHasMore(false);
    setPinnedList([]);
    setReplyTo(null);
    setConfirmAction(null);
  }

  async function deleteRoomSelected() {
    if (selectedIds.size === 0) return;
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

  // Who may select a message: everyone may select their own; the room
  // owner and moderators may select any message.
  function canSelect(msg: Message): boolean {
    return msg.sender_id === profile?.id || myRole === 'owner' || myRole === 'moderator';
  }

  // Long-press (touch) or right-click on my own message opens Edit/Delete
  const pressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  function startPress(id: string, clientY?: number) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(()=>{ setMenuBelow((clientY ?? 999) < 240); setActionMsg(id); }, 450);
  }
  function endPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }
  function startEdit(msg: Message) {
    setEditing(msg);
    setInput(msg.content||'');
    setActionMsg(null);
    setReplyTo(null);
    setTimeout(()=>inputRef.current?.focus(), 50);
  }

  function startReply(msg: Message) {
    setReplyTo(msg);
    setEditing(null);
    setActionMsg(null);
    setTimeout(()=>inputRef.current?.focus(), 50);
  }

  async function togglePin(msg: Message) {
    setActionMsg(null);
    const supabase = createClient();
    const pinning = !msg.is_pinned;
    const { error } = await supabase.rpc('set_message_pinned', { p_message_id: msg.id, p_pin: pinning });
    if (error) { setSendError("Couldn't change that pin. Please try again."); return; }
    const stamped = { ...msg, is_pinned: pinning, pinned_at: pinning ? new Date().toISOString() : null };
    setMessages(m=>m.map(x=>x.id===msg.id ? stamped : x));
    setPinnedList(prev => pinning ? [stamped, ...prev.filter(x=>x.id!==msg.id)] : prev.filter(x=>x.id!==msg.id));
  }

  async function toggleStar(msg: Message) {
    setActionMsg(null);
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
    setShowStarred(true);
    setStarredLoading(true);
    setStarredMessages([]);
    const supabase = createClient();
    const { data: rows } = await supabase.from('message_stars').select('message_id').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(200);
    const ids = (rows||[]).map((r:any)=>r.message_id);
    if (!ids.length) { setStarredMessages([]); setStarredLoading(false); return; }
    const { data } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').in('id', ids).order('created_at', { ascending: false });
    const mine = (data||[]).filter((m:any)=>m.room_id===roomId);
    setStarredMessages(mine as Message[]);
    setStarredLoading(false);
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
  async function deleteRoomMessage(msgId: string) {
    const supabase = createClient();
    await supabase.from('messages').update({ is_deleted: true, content: null }).eq('id', msgId).eq('sender_id', profile!.id);
    setMessages(m=>m.filter(x=>x.id!==msgId));
    setActionMsg(null);
  }

  async function uploadRoomPic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile || !room) return;
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}/room-${roomId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (upErr) { alert('Upload failed. Please try again.'); return; }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
    const { error } = await supabase.from('rooms').update({ avatar_url: pub.publicUrl }).eq('id', roomId);
    if (error) { alert('Only the room owner can change the room picture.'); return; }
    setRoom({ ...room, avatar_url: pub.publicUrl });
  }

  async function setRoomTheme(key: string) {
    if (!room || myRole!=='owner') return;
    const p = PRESETS[key];
    const supabase = createClient();
    const { error } = await supabase.from('rooms').update({ preset: key, accent_color: p.accent }).eq('id', roomId);
    if (error) { alert('Only the room owner can change the theme.'); return; }
    setRoom({ ...room, preset: key, accent_color: p.accent });
  }

  async function toggleMute() {
    if (!profile) return;
    const supabase = createClient();
    const next = !myMuted;
    const { error } = await supabase.from('room_members').update({ muted: next }).eq('room_id', roomId).eq('user_id', profile.id);
    if (!error) setMyMuted(next);
  }

  // Entry-code gate: verify (server-side) then join as a member.
  async function submitGateCode(code: string) {
    if (!profile || !room) return;
    setGateBusy(true); setGateError('');
    const supabase = createClient();
    const { data: ok, error } = await supabase.rpc('verify_room_entry_code', { p_room_id: roomId, p_code: normalizeEntryCode(code) });
    if (error || !ok) {
      setGateError("That code doesn't match — try again ♡");
      setGateBusy(false);
      return;
    }
    const { data: existing } = await supabase.from('room_members').select('id').eq('room_id', roomId).eq('user_id', profile.id).single();
    if (!existing) {
      await supabase.from('room_members').insert({ room_id: roomId, user_id: profile.id, role: 'member' });
    }
    setNeedsCode(false);
    setGateBusy(false);
    setLoading(true);
    load();
  }

  // Owner settings: set / change / remove the entry code.
  async function saveEntryCode() {
    if (!room || myRole !== 'owner') return;
    const code = normalizeEntryCode(codeInput);
    if (!isValidEntryCode(code)) { setCodeMsg('Entry code must be 4–8 letters or digits.'); return; }
    setCodeBusy(true); setCodeMsg('');
    const supabase = createClient();
    const { error } = await supabase.rpc('set_room_entry_code', { p_room_id: roomId, p_code: code });
    setCodeBusy(false);
    if (error) { setCodeMsg('Could not save that code. Please try again.'); return; }
    setRoom({ ...room, has_entry_code: true });
    setSavedCode(code);
    setCodeInput('');
    setCodeMsg('Entry code saved ♡ Share it with friends you want in this room.');
  }

  async function removeEntryCode() {
    if (!room || myRole !== 'owner') return;
    setCodeBusy(true); setCodeMsg('');
    const supabase = createClient();
    const { error } = await supabase.rpc('remove_room_entry_code', { p_room_id: roomId });
    setCodeBusy(false);
    if (error) { setCodeMsg('Could not remove the code. Please try again.'); return; }
    setRoom({ ...room, has_entry_code: false });
    setSavedCode('');
    setCodeMsg('Entry code removed — this room is open to anyone with the invite code again.');
  }

  function copyEntryCode() {
    if (!savedCode) return;
    navigator.clipboard.writeText(savedCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function broadcastTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000 || !profile) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: profile.id, name: profile.display_name || profile.username } });
  }

  async function handleRoomFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      const { error: insertErr } = await supabase.from('messages').insert({ room_id: roomId, sender_id: profile.id, content: file.name, media_url: publicUrl, type, reply_to_id: replyTo?.id ?? null });
      setReplyTo(null);
      if (insertErr) setSendError("Couldn't send that file. Please try again.");
      else if (room) void notifyRoom(supabase, profile, room, members, type, file.name);
    } else {
      setSendError("Upload failed. Please try again.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function startRoomRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000 || !profile) return;
        setUploading(true);
        const supabase = createClient();
        const fileName = `${profile.id}/voice_${Date.now()}.webm`;
        const { data, error } = await supabase.storage.from('media').upload(fileName, audioBlob, { contentType: 'audio/webm' });
        if (!error && data) {
          const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
          const { error: insertErr } = await supabase.from('messages').insert({ room_id: roomId, sender_id: profile.id, content: 'Voice message', media_url: publicUrl, type: 'audio', reply_to_id: replyTo?.id ?? null });
          setReplyTo(null);
          if (insertErr) setSendError("Couldn't send that voice message. Please try again.");
          else if (room) void notifyRoom(supabase, profile, room, members, 'audio', 'Voice message');
        }
        setUploading(false);
      };
      recorder.start();
      setIsRecording(true);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch {
      alert('Microphone access denied. Please allow microphone access to send voice messages.');
    }
  }

  function stopRoomRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordIntervalRef.current) { clearInterval(recordIntervalRef.current); recordIntervalRef.current = null; }
  }

  async function leaveRoom() {
    if (!confirm('Leave this room?')) return;
    const supabase = createClient();
    await supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', profile!.id);
    router.replace('/rooms');
  }

  async function deleteRoom() {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    const supabase = createClient();
    await supabase.from('rooms').delete().eq('id', roomId);
    router.replace('/rooms');
  }

  function copyInviteCode() {
    if (room) { navigator.clipboard.writeText(room.invite_code); setCopied(true); setTimeout(()=>setCopied(false),2000); }
  }

  if (loading) return <Loading/>;
  if (!room) return null;

  const preset = room.preset ? PRESETS[room.preset] : null;
  const accentColor = preset?.accent || room.accent_color || 'var(--color-accent)';

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 theme-bg" style={{background:preset?.bg||'var(--color-bg)'}}>
        <EntryCodePrompt
          roomName={room.name}
          accentColor={accentColor}
          error={gateError}
          busy={gateBusy}
          onSubmit={submitGateCode}
          onCancel={()=>router.replace('/rooms')}
          submitLabel="Unlock & Join ♡"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{background:preset?.bg||'var(--color-bg)'}}>
      {/* Header */}
      {selectMode && tab==='chat' ? (
        <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(255,255,255,0.4)'}}>
          <button onClick={()=>{setSelectMode(false); setSelectedIds(new Set());}} className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}><X size={18} style={{color:accentColor}}/></button>
          <p className="font-black text-sm theme-text flex-1">{selectedIds.size} selected</p>
          <button onClick={()=>setSelectedIds(new Set(messages.filter(m=>!m.is_deleted && !m.id.startsWith('temp-') && canSelect(m)).map(m=>m.id)))} className="text-xs font-bold px-3 py-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)',color:'var(--color-text)'}}>Select all</button>
          <button onClick={()=>{ if (selectedIds.size>0) setConfirmAction('deleteSelected'); }} disabled={selectedIds.size===0} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white" style={{background:'#FF6B6B',opacity:selectedIds.size===0?0.5:1}}><Trash2 size={14}/> Delete</button>
        </header>
      ) : (
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(255,255,255,0.4)'}}>
        <Link href="/rooms" className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}><ArrowLeft size={18} style={{color:accentColor}}/></Link>
                  {room.avatar_url
? <img src={room.avatar_url} alt={room.name} className="w-9 h-9 rounded-xl object-cover"/>
: <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style={{background:'rgba(255,255,255,0.7)'}}>{preset?.emoji||room.name[0].toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm theme-text truncate flex items-center gap-1.5">{room.name}{room.has_entry_code && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{background:`${accentColor}22`,color:accentColor}}><KeyRound size={10}/>Entry code</span>}</p>
          <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{members.length} members · {members.filter(m=>isFreshOnline((m.profile as Profile)||null)).length} online</p>
        </div>
        {/* Share */}
        <button onClick={copyInviteCode} className="p-2 rounded-xl transition-all" style={{background:'rgba(255,255,255,0.7)'}}>
          {copied?<Check size={16} style={{color:'#4ADE80'}}/>:<Share2 size={16} style={{color:accentColor}}/>}
        </button>
        {tab==='chat' && (
          <div className="relative">
            <button onClick={()=>setShowChatMenu(v=>!v)} className="p-2 rounded-xl transition-all" style={{background:'rgba(255,255,255,0.7)'}} title="Chat options"><MoreVertical size={16} style={{color:accentColor}}/></button>
            {showChatMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={()=>setShowChatMenu(false)}/>
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl p-2 z-40 space-y-1" style={{background:'#fff',border:`1px solid ${accentColor}33`,boxShadow:'0 8px 30px rgba(0,0,0,0.12)'}}>
                  <button onClick={exportRoomChat} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Download size={16} style={{color:accentColor}}/> Export chat</button>
                  <button onClick={openStarred} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Star size={16} style={{color:accentColor}}/> Starred messages</button>
                  <button onClick={()=>{setShowChatMenu(false); setSelectMode(true);}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ListChecks size={16} style={{color:accentColor}}/> Select messages</button>
                  {(myRole==='owner'||myRole==='moderator') && (
                    <button onClick={()=>{setShowChatMenu(false); setConfirmAction('clear');}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'#FF6B6B'}}><Trash2 size={16}/> Clear chat</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>
      )}
      {sendError && tab==='chat' && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(255,107,107,0.12)',color:'#FF6B6B'}}>{sendError} <button onClick={()=>setSendError('')} className="underline ml-1">Dismiss</button></div>
      )}

      {/* Tab bar */}
      <div className="flex px-4 pt-3 gap-1 flex-shrink-0" style={{background:'rgba(255,255,255,0.7)'}}>
        {(['chat','members','games','settings'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className="px-4 py-2 rounded-t-xl text-xs font-bold capitalize transition-all"
            style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?accentColor:'var(--color-text-muted)',borderBottom:tab===t?`2px solid ${accentColor}`:undefined}}>
            {t==='chat'?'💬 Chat':t==='members'?`👥 (${members.length})`:t==='games'?'🎮 Games':'⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab==='chat' && (
          <>
            {jumpNote && (
              <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(255,255,255,0.85)',color:'var(--color-text-muted)'}}>{jumpNote} <button onClick={()=>setJumpNote('')} className="underline ml-1">Dismiss</button></div>
            )}
            {pinnedList.length > 0 && (
              <button onClick={()=>{ const next = (pinIndex + 1) % pinnedList.length; setPinIndex(next); jumpToMessage(pinnedList[next].id); }} className="flex items-center gap-2 px-4 py-2 text-left flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',borderBottom:`1px solid ${accentColor}33`}}>
                <Pin size={14} style={{color:accentColor}} className="flex-shrink-0"/>
                <span className="text-xs font-bold truncate" style={{color:'var(--color-text)'}}>{senderName(pinnedList[pinIndex % pinnedList.length], pinnedList[pinIndex % pinnedList.length].sender_id === profile?.id ? 'You' : 'Member')}: <span className="font-normal" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(pinnedList[pinIndex % pinnedList.length])}</span></span>
                {pinnedList.length > 1 && <span className="text-[11px] font-bold flex-shrink-0" style={{color:accentColor}}>{pinnedList.length} pinned · tap to cycle</span>}
              </button>
            )}
            {/* Messages — my own wallpaper, only I see it */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={wallpaperStyle(profile?.wallpaper)}>
              {hasMore && messages.length > 0 && (
                <div className="flex justify-center pb-1">
                  <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-bold px-4 py-2 rounded-full" style={{background:'rgba(255,255,255,0.9)',color:accentColor,border:`1px solid ${accentColor}33`}}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</button>
                </div>
              )}
              {/* Welcome message */}
              {room.welcome_message && messages.length===0 && (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">{preset?.emoji||'🏠'}</div>
                  <p className="text-sm font-bold" style={{color:accentColor}}>{room.welcome_message}</p>
                </div>
              )}
              {messages.map((msg, i)=>{
                const mine = msg.sender_id===profile?.id;
                const sender = msg.sender as Profile;
                // WhatsApp-style day divider: Today / Yesterday / full date.
                const prev = messages[i-1];
                const divider = (!prev || !sameDay(prev.created_at, msg.created_at)) ? (
                  <div className="flex justify-center py-1">
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{background:'rgba(255,255,255,0.9)',color:'var(--color-text-muted)',border:`1px solid ${accentColor}33`}}>{dayDividerLabel(msg.created_at)}</span>
                  </div>
                ) : null;
                const selected = selectedIds.has(msg.id);
                const selectable = canSelect(msg);
                return (
                  <Fragment key={msg.id}>
                    {divider}
                  <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'}`} style={highlightId===msg.id?{background:'rgba(255,255,255,0.6)',borderRadius:16,outline:`2px solid ${accentColor}`,outlineOffset:2}:selected?{background:'rgba(255,255,255,0.6)',borderRadius:16}:undefined} onClick={selectMode && selectable ? ()=>toggleSelect(msg.id) : undefined}>
                    {selectMode && selectable && (
                      <button onClick={(e)=>{e.stopPropagation(); toggleSelect(msg.id);}} className="self-center flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{borderColor:selected?accentColor:'rgba(0,0,0,0.25)',background:selected?accentColor:'transparent',color:'#fff'}}>
                        {selected && <Check size={14}/>}
                      </button>
                    )}
                    {!mine && <Avatar profile={sender||{}} size={28}/>}
                    <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-0.5`}>
                      {!mine && <span className="text-xs font-bold px-1" style={{color:accentColor}}>{sender?.display_name||sender?.username}</span>}
                      <div className="px-4 py-2.5 rounded-2xl text-sm relative cursor-pointer"
                        style={{background:mine?accentColor+22:'rgba(255,255,255,0.9)',border:`1px solid ${accentColor}33`,borderRadius:mine?'20px 20px 4px 20px':'20px 20px 20px 4px',color:'var(--color-text)'}}
                        onContextMenu={e=>{if(!selectMode){e.preventDefault();setMenuBelow(e.clientY < 240);setActionMsg(msg.id);}}}
                        onTouchStart={(e)=>{if(!selectMode) startPress(msg.id, e.touches[0]?.clientY);}} onTouchEnd={endPress} onTouchMove={endPress}
                        onClick={msg.failed ? ()=>retrySend(msg.id) : undefined}>
                        {msg.reply_to_id && (() => {
                          const q = quotedOf(msg);
                          const gone = q === null || (q !== undefined && q !== null && q.is_deleted);
                          return (
                            <button onClick={(e)=>{ e.stopPropagation(); jumpToMessage(msg.reply_to_id!); }} className="block w-full text-left mb-1.5 px-2.5 py-1.5 rounded-xl" style={{background:'rgba(0,0,0,0.06)',borderLeft:`3px solid ${accentColor}`}}>
                              {gone ? (
                                <span className="text-xs italic" style={{color:'var(--color-text-muted)'}}>Message deleted</span>
                              ) : q ? (
                                <>
                                  <span className="block text-xs font-bold" style={{color:accentColor}}>↩ {senderName(q, q.sender_id === profile?.id ? 'You' : 'Member')}</span>
                                  <span className="block text-xs truncate" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(q)}</span>
                                </>
                              ) : (
                                <span className="text-xs" style={{color:'var(--color-text-muted)'}}>…</span>
                              )}
                            </button>
                          );
                        })()}
                        {msg.type === 'image' && msg.media_url && (
                          <div className="mb-1 rounded-xl overflow-hidden max-w-xs">
                            <img src={msg.media_url} alt="shared image" className="w-full object-cover rounded-xl" />
                          </div>
                        )}
                        {msg.type === 'video' && msg.media_url && (
                          <div className="mb-1 rounded-xl overflow-hidden max-w-xs">
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
                        {actionMsg===msg.id && (
                          <>
                          <div className="fixed inset-0 z-[5]" onClick={()=>setActionMsg(null)}/>
                          <div className={`absolute ${menuBelow?'top-full mt-1':'bottom-full mb-1'} ${mine?'right-0':'left-0'} flex flex-col gap-1 p-1.5 rounded-2xl z-20`} style={{background:'#fff',border:`1px solid ${accentColor}33`,boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
                            <div className="flex gap-1">
                              <button onClick={()=>startReply(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Reply size={12}/> Reply</button>
                              {(myRole==='owner'||myRole==='moderator') && (
                                <button onClick={()=>togglePin(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:msg.is_pinned?accentColor:`${accentColor}22`,color:msg.is_pinned?'#fff':'var(--color-text)'}}><Pin size={12}/> {msg.is_pinned?'Unpin':'Pin'}</button>
                              )}
                              <button onClick={()=>toggleStar(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Star size={12}/> {starredIds.has(msg.id)?'Unstar':'Star'}</button>
                              <button onClick={()=>setActionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                            </div>
                            {mine && (
                              <div className="flex gap-1 pt-1" style={{borderTop:`1px solid ${accentColor}33`}}>
                                <button onClick={()=>startEdit(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Pencil size={12}/> Edit</button>
                                <button onClick={()=>deleteRoomMessage(msg.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}><Trash2 size={12}/> Delete</button>
                              </div>
                            )}
                          </div>
                          </>
                        )}
                      </div>
                      <span className="text-xs px-1" style={{color:'var(--color-text-muted)'}}>{msg.is_pinned && <Pin size={11} className="inline mr-1" style={{color:accentColor}}/>}{starredIds.has(msg.id) && <Star size={11} className="inline mr-1" style={{color:'#F5B301'}}/>}{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{msg.edited_at?' · edited':''}{msg.failed && <button onClick={()=>retrySend(msg.id)} className="ml-1.5 font-bold" style={{color:'#FF6B6B'}}>Not sent · Tap to retry</button>}</span>
                    </div>
                  </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef}/>
            </div>
            {Object.values(typingUsers).length > 0 && (
              <div className="px-4 py-1.5 text-xs flex-shrink-0" style={{background:'rgba(255,255,255,0.85)',color:'var(--color-text-muted)'}}>
                <span className="font-semibold" style={{color:accentColor}}>{Object.values(typingUsers)[0]}</span>
                {Object.values(typingUsers).length > 1 ? ' and others are typing' : ' is typing'}<span className="animate-pulse">…</span>
              </div>
            )}
            <form onSubmit={sendMessage} className="relative flex items-end gap-2 p-4 safe-bottom flex-shrink-0" style={{background:'rgba(255,255,255,0.9)',backdropFilter:'blur(8px)',borderTop:`1px solid ${accentColor}22`}}>
              {showEmojis && (
                <div className="absolute left-4 z-30" style={{bottom:'calc(100% + 8px)'}}>
                  <EmojiPicker onPick={(e)=>{setInput(prev=>prev+e); inputRef.current?.focus();}} />
                </div>
              )}
              {editing && (
                <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2 text-xs z-20" style={{bottom:'100%',background:`${accentColor}22`,borderTop:`1px solid ${accentColor}33`,color:'var(--color-text-muted)'}}>
                  <Pencil size={12}/>
                  <span className="flex-1 truncate">Editing your message</span>
                  <button type="button" onClick={()=>{setEditing(null); setInput('');}}><X size={14}/></button>
                </div>
              )}
              {replyTo && !editing && (
                <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2 text-xs z-20" style={{bottom:'100%',background:`${accentColor}22`,borderTop:`1px solid ${accentColor}33`,color:'var(--color-text-muted)'}}>
                  <Reply size={12}/>
                  <span className="flex-1 truncate">Replying to <b style={{color:'var(--color-text)'}}>{senderName(replyTo, replyTo.sender_id===profile?.id?'You':'Member')}</b>: {quoteSnippet(replyTo)}</span>
                  <button type="button" onClick={()=>setReplyTo(null)}><X size={14}/></button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip" className="hidden" onChange={handleRoomFileUpload}/>
              <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background:`${accentColor}22`,color:accentColor}} title="Attach media">
                <Paperclip size={18}/>
              </button>
              <button type="button" onClick={isRecording ? stopRoomRecording : startRoomRecording} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background: isRecording ? '#FF6B6B' : `${accentColor}22`, color: isRecording ? 'white' : accentColor}} title={isRecording ? 'Stop recording' : 'Record voice message'}>
                {isRecording ? <Square size={16}/> : <Mic size={18}/>}
              </button>
              {isRecording && <span className="text-xs font-bold flex-shrink-0" style={{color:'#FF6B6B'}}>{Math.floor(recordTime/60)}:{String(recordTime%60).padStart(2,'0')}</span>}
              <button type="button" onClick={() => setShowEmojis(v=>!v)} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background: showEmojis ? accentColor : `${accentColor}22`, color: showEmojis ? 'white' : accentColor}} title="Add emoji">
                <Smile size={18}/>
              </button>
              <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value); broadcastTyping(); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,100)+'px';}}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
                placeholder="Say something nice... ♡" rows={1}
                className="flex-1 py-3 px-4 rounded-2xl resize-none text-sm"
                style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`,outline:'none',minHeight:44,maxHeight:100,fontFamily:"'Nunito',sans-serif"}}/>
              <button type="submit" disabled={!input.trim()} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-110" style={{background:accentColor,color:'white'}}>
                <Send size={16}/>
              </button>
            </form>
          </>
        )}

        {tab==='members' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {members.map(m=>{
              const mp = m.profile as Profile;
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{background:'rgba(255,255,255,0.7)'}}>
                  <div className="relative"><Avatar profile={mp||{}} size={40}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:isFreshOnline(mp)?'#4ADE80':'#9CA3AF'}}/></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm theme-text flex items-center gap-1.5">
                      {mp?.display_name||mp?.username}
                      {m.role==='owner'&&<Crown size={12} style={{color:'#FFD97D'}}/>}
                      {m.role==='moderator'&&<Shield size={12} style={{color:accentColor}}/>}
                    </p>
                    <p className="text-xs" style={{color:'var(--color-text-muted)'}}>@{mp?.username} · {presenceLabel(mp)}</p>
                  </div>
                  <span className="text-xs capitalize px-2.5 py-1 rounded-full font-semibold"
                    style={{background:`${accentColor}22`,color:accentColor}}>{m.role}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab==='games' && <GamesTab roomId={roomId} profile={profile} accentColor={accentColor}/>}

        {tab==='settings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(255,255,255,0.8)'}}>
              <h3 className="font-black theme-text">Room Picture</h3>
              <div className="flex items-center gap-3">
                {room.avatar_url
                  ? <img src={room.avatar_url} alt={room.name} className="w-16 h-16 rounded-2xl object-cover"/>
                  : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{background:`${accentColor}22`}}>{preset?.emoji||room.name[0].toUpperCase()}</div>}
                <div className="flex-1">
                  <p className="text-sm font-bold theme-text">{room.name}</p>
                  <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{myRole==='owner' ? 'This is the picture everyone sees for this room.' : 'Only the room owner can change the picture.'}</p>
                </div>
                {myRole==='owner' && (
                  <button onClick={()=>roomPicRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0" style={{background:accentColor}}>
                    <Camera size={14}/> Change
                  </button>
                )}
              </div>
              <input ref={roomPicRef} type="file" accept="image/*" className="hidden" onChange={uploadRoomPic}/>
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(255,255,255,0.8)'}}>
              <h3 className="font-black theme-text">Room Theme</h3>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PRESETS).map(([key,p])=>(
                  <button key={key} onClick={()=>setRoomTheme(key)} disabled={myRole!=='owner'}
                    className="p-3 rounded-2xl text-center transition-all hover:scale-[1.03]"
                    style={{background:p.bg, border: room.preset===key ? `2px solid ${p.accent}` : '2px solid transparent', opacity: myRole==='owner'?1:0.7}}>
                    <div className="text-2xl mb-1">{p.emoji}</div>
                    <div className="text-[11px] font-bold capitalize" style={{color:'var(--color-text)'}}>{key.replace('-',' ')}</div>
                  </button>
                ))}
              </div>
              {myRole!=='owner' && <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Only the room owner can change the theme.</p>}
            </div>
            <div className="rounded-2xl p-4" style={{background:'rgba(255,255,255,0.8)'}}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className="font-black theme-text flex items-center gap-2">{myMuted ? <BellOff size={16}/> : <Bell size={16}/>} Room Notifications</h3>
                  <p className="text-xs mt-0.5" style={{color:'var(--color-text-muted)'}}>{myMuted ? 'You will not get pop-ups for this room.' : 'You get a pop-up when someone messages in this room.'}</p>
                </div>
                <button onClick={toggleMute} className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{background: myMuted ? '#9CA3AF' : accentColor}}>
                  {myMuted ? 'Muted' : 'On'}
                </button>
              </div>
            </div>
            {myRole==='owner' && (
              <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(255,255,255,0.8)'}}>
                <div className="flex items-center gap-2">
                  <h3 className="font-black theme-text flex-1 flex items-center gap-2"><KeyRound size={16}/> Entry Code</h3>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{background: room.has_entry_code ? `${accentColor}22` : 'var(--color-secondary)', color: room.has_entry_code ? accentColor : 'var(--color-text-muted)'}}>
                    {room.has_entry_code ? '🔒 On' : 'Off'}
                  </span>
                </div>
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>
                  Optional extra lock, separate from the invite code below. When it is on, anyone who is not already a member must type this code before they can enter. Members always come straight in — setting or changing it never locks them out.
                </p>
                <div className="flex gap-2">
                  <input type="text" placeholder={room.has_entry_code ? 'New code (4–8 letters/digits)' : 'New code (4–8 letters/digits)'}
                    value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())}
                    className="theme-input flex-1 py-2.5 px-3 text-sm font-mono tracking-widest uppercase" maxLength={8}/>
                  <button onClick={()=>setCodeInput(generateEntryCode())} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0" style={{background:'var(--color-secondary)',color:'var(--color-text)'}} title="Generate a random code">
                    <Dices size={14}/>Random
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEntryCode} disabled={codeBusy || !codeInput.trim()} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{background:accentColor,opacity: codeBusy || !codeInput.trim() ? 0.6 : 1}}>
                    {room.has_entry_code ? 'Change Code' : 'Set Code'}
                  </button>
                  {room.has_entry_code && (
                    <button onClick={removeEntryCode} disabled={codeBusy} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>
                      Remove Code
                    </button>
                  )}
                </div>
                {savedCode && (
                  <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm" style={{background:'var(--color-secondary)'}}>
                    <span className="flex-1 font-bold tracking-widest">{savedCode}</span>
                    <button onClick={copyEntryCode} className="p-1.5 rounded-lg" style={{background:accentColor,color:'white'}}>
                      {codeCopied?<Check size={14}/>:<Copy size={14}/>}
                    </button>
                  </div>
                )}
                {codeMsg && <p className="text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{codeMsg}</p>}
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Only you can change or remove it. If you forget it, just set a new one — the old code stops working right away.</p>
              </div>
            )}
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(255,255,255,0.8)'}}>
              <h3 className="font-black theme-text">Room Info</h3>
              <div>
                <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>Invite Code</p>
                <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm" style={{background:'var(--color-secondary)'}}>
                  <span className="flex-1 font-bold tracking-widest">{room.invite_code}</span>
                  <button onClick={copyInviteCode} className="p-1.5 rounded-lg" style={{background:accentColor,color:'white'}}>
                    {copied?<Check size={14}/>:<Copy size={14}/>}
                  </button>
                </div>
              </div>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Share this code with your friends so they can join!</p>
            </div>
            <div className="space-y-2">
              {myRole!=='owner' && (
                <button onClick={leaveRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.08)',color:'#FF6B6B'}}>
                  <LogOut size={16}/>Leave Room
                </button>
              )}
              {myRole==='owner' && (
                <button onClick={deleteRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>
                  <Trash2 size={16}/>Delete Room
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {confirmAction === 'clear' && (
        <ConfirmDialog
          title="Clear this room's chat?"
          message="This will delete all messages in this room for every member. This cannot be undone."
          confirmLabel="Clear chat"
          onConfirm={clearRoomChat}
          onCancel={()=>setConfirmAction(null)}
        />
      )}
      {confirmAction === 'deleteSelected' && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} message${selectedIds.size===1?'':'s'}?`}
          message="These messages will be deleted for everyone in this room. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={deleteRoomSelected}
          onCancel={()=>setConfirmAction(null)}
        />
      )}
      {showStarred && (
        <>
          <div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.35)'}} onClick={()=>setShowStarred(false)}/>
          <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-3xl p-4 max-h-[70vh] overflow-y-auto" style={{background:'#fff',border:`1px solid ${accentColor}33`,boxShadow:'0 12px 40px rgba(0,0,0,0.2)'}}>
            <div className="flex items-center gap-2 mb-3">
              <Star size={18} style={{color:'#F5B301'}}/>
              <p className="font-black text-sm theme-text flex-1">Starred messages</p>
              <button onClick={()=>setShowStarred(false)} className="p-1.5 rounded-full" style={{background:`${accentColor}22`}}><X size={14}/></button>
            </div>
            {starredLoading ? (
              <p className="text-sm text-center py-6" style={{color:'var(--color-text-muted)'}}>Loading your stars… ♡</p>
            ) : starredMessages.length===0 ? (
              <p className="text-sm text-center py-6" style={{color:'var(--color-text-muted)'}}>No starred messages yet.<br/>Hold a message and tap Star ⭐ to keep it here — only you can see your stars.</p>
            ) : starredMessages.map(m=>(
              <button key={m.id} onClick={()=>{setShowStarred(false); jumpToMessage(m.id);}} className="w-full text-left px-3 py-2.5 rounded-2xl mb-1.5" style={{background:`${accentColor}22`}}>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-bold" style={{color:accentColor}}>{senderName(m, m.sender_id===profile?.id?'You':'Member')}</span>
                  <span className="text-[11px]" style={{color:'var(--color-text-muted)'}}>{new Date(m.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </span>
                <span className="block text-sm truncate theme-text">{quoteSnippet(m)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// GAMES TAB — All 4 games inline
// Rules (Nov 2026): nothing can be played until BOTH players are
// in, every game has a Restart, and Hangman / Number Guess start
// with two choices — one player sets the secret, the other guesses.
// ============================================================

function initialStateFor(type: string, creatorId: string): any {
  if (type === 'tictactoe') return { board: Array(9).fill(null), currentPlayer: creatorId, playerX: creatorId, playerO: null, winner: null };
  if (type === 'rps') return { choices: {}, winner: null, round: 1 };
  if (type === 'number-guess') return { phase: 'choose', setterId: null, guesserId: null, secret: null, guesses: [], winner: null };
  if (type === 'hangman') return { phase: 'choose', setterId: null, guesserId: null, word: null, guessed: [], wrongGuesses: [], maxWrong: 6, winner: null };
  return {};
}

function GamesTab({ roomId, profile, accentColor }: { roomId: string; profile: Profile|null; accentColor: string }) {
  const [gameType, setGameType] = useState<string|null>(null);
  const [game, setGame] = useState<Game|null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [liveGame, setLiveGame] = useState<Game|null>(null);
  const openGameIdRef = useRef<string|null>(null);

  const GAME_META: Record<string,{emoji:string;name:string;desc:string}> = {
    'tictactoe': { emoji:'⭕', name:'Tic Tac Toe', desc:'2 players' },
    'rps': { emoji:'✊', name:'Rock Paper Scissors', desc:'2 players' },
    'number-guess': { emoji:'🔢', name:'Number Guess', desc:'2 players' },
    'hangman': { emoji:'🔡', name:'Hangman', desc:'2 players' },
  };

  const bothIn = players.length >= 2;

  async function refreshPlayers(gameId: string) {
    const supabase = createClient();
    const { data } = await supabase.from('game_players').select('*').eq('game_id', gameId);
    setPlayers(data||[]);
  }

  function openGame(g: Game) {
    openGameIdRef.current = g.id;
    setGame(g);
    setGameState(g.state);
    setGameType(g.type);
    refreshPlayers(g.id);
  }

  function closeGame() {
    openGameIdRef.current = null;
    setGameType(null);
    setGame(null);
    setGameState(null);
    setPlayers([]);
  }

  // Discover the room's live game, and keep an open game in sync on
  // every player's screen at run time (moves arrive via realtime).
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('games').select('*').eq('room_id', roomId).neq('status','finished').order('created_at', { ascending: false }).limit(1);
      if (!cancelled && data && data[0]) setLiveGame(data[0] as Game);
    })();
    const channel = supabase.channel(`games-room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${roomId}` }, (payload) => {
        const g = payload.new as Game;
        if (!g || !g.id) return;
        if (openGameIdRef.current === g.id) {
          setGame(g);
          setGameState(g.state);
          refreshPlayers(g.id);
        }
        if (g.status === 'finished') {
          setLiveGame(live => (live && live.id === g.id ? null : live));
        } else {
          setLiveGame(g);
        }
      })
      .subscribe();
    // Polling fallback: if realtime ever lags or drops, the live banner
    // and any open game still refresh within a few seconds, so a waiting
    // screen never looks stuck and results always appear.
    const poll = setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase.from('games').select('*').eq('room_id', roomId).neq('status','finished').order('created_at', { ascending: false }).limit(1);
      if (cancelled) return;
      if (data && data[0]) setLiveGame(data[0] as Game);
      else setLiveGame(null);
      const openId = openGameIdRef.current;
      if (openId) {
        const { data: og } = await supabase.from('games').select('*').eq('id', openId).single();
        if (!cancelled && og) {
          setGame(og as Game);
          setGameState((og as Game).state);
          refreshPlayers(openId);
        }
      }
    }, 5000);
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, profile?.id]);

  async function startGame(type: string) {
    if (!profile) return;
    const supabase = createClient();
    const initialState = initialStateFor(type, profile.id);
    const { data: g } = await supabase.from('games').insert({ room_id: roomId, type, status: 'waiting', state: initialState, created_by: profile.id }).select().single();
    if (g) {
      await supabase.from('game_players').upsert({ game_id: g.id, user_id: profile.id }, { onConflict: 'game_id,user_id' });
      setLiveGame(g as Game);
      openGame(g as Game);
      const { data: rm } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (rm) void notifyGame(supabase, profile, rm as Room, g.id, type);
    }
  }

  async function joinGame(g: Game) {
    if (!profile) return;
    const supabase = createClient();
    await supabase.from('game_players').upsert({ game_id: g.id, user_id: profile.id }, { onConflict: 'game_id,user_id' });
    const { data: plist } = await supabase.from('game_players').select('*').eq('game_id', g.id);
    const count = (plist || []).length;
    const st: any = { ...(g.state as any) };
    if (g.type === 'tictactoe' && !st.playerO && st.playerX !== profile.id) {
      st.playerO = profile.id;
    }
    // Touch the game row so every open screen refreshes its player list
    // and the waiting banner lifts the moment the second player joins.
    const { data } = await supabase.from('games').update({ state: st, status: count >= 2 ? 'active' : 'waiting' }).eq('id', g.id).select().single();
    openGame((data as Game) || g);
    if (plist) setPlayers(plist);
  }

  // Restart: a clean round for BOTH players, live. Tic Tac Toe keeps its
  // X/O seats; Hangman / Number Guess go back to the two choices.
  async function restartGame() {
    if (!profile || !game || !gameState) return;
    const supabase = createClient();
    const fresh = initialStateFor(game.type, game.created_by);
    if (game.type === 'tictactoe') {
      fresh.playerX = gameState.playerX || game.created_by;
      fresh.playerO = gameState.playerO || null;
      fresh.currentPlayer = fresh.playerX;
    }
    if (game.type === 'rps') fresh.round = (gameState.round || 1) + 1;
    const { data } = await supabase.from('games').update({ state: fresh, status: 'active', winner_id: null }).eq('id', game.id).select().single();
    if (data) {
      setGame(data as Game);
      setGameState((data as Game).state);
    } else {
      setGameState(fresh);
    }
  }

  if (!gameType) return (
    <div className="flex-1 overflow-y-auto p-4">
      {liveGame && (
        <div className="mb-4 p-4 rounded-2xl flex items-center gap-3" style={{background:`${accentColor}22`,border:`2px solid ${accentColor}44`}}>
          <span className="text-3xl">{GAME_META[liveGame.type]?.emoji || '🎮'}</span>
          <div className="flex-1">
            <p className="font-black text-sm theme-text">{GAME_META[liveGame.type]?.name || 'A game'} is live in this room!</p>
            <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{liveGame.created_by===profile?.id ? 'You started this game — jump back in.' : 'A friend started this game — join and play together, live.'}</p>
          </div>
          <button onClick={()=>{ if (liveGame.created_by!==profile?.id) joinGame(liveGame); else openGame(liveGame); }}
            className="px-4 py-2 rounded-full text-xs font-bold text-white flex-shrink-0" style={{background:accentColor}}>
            {liveGame.created_by===profile?.id ? 'Open' : 'Join'}
          </button>
        </div>
      )}
      <p className="text-sm font-bold mb-4 theme-text">Choose a game to play with your friends! Both players must be in before a game starts.</p>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(GAME_META).map(([type, meta])=>(
          <button key={type} onClick={()=>startGame(type)}
            className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]"
            style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">{meta.emoji}</span>
            <span className="font-black text-sm theme-text">{meta.name}</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>{meta.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={closeGame} className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}>
          <ArrowLeft size={16} style={{color:accentColor}}/>
        </button>
        <span className="font-black theme-text">{gameType==='tictactoe'?'Tic Tac Toe':gameType==='rps'?'Rock Paper Scissors':gameType==='number-guess'?'Number Guess':'Hangman'}</span>
        <span className="text-xs ml-auto" style={{color:'var(--color-text-muted)'}}>{players.length} player{players.length===1?'':'s'} in</span>
        <button onClick={restartGame} disabled={!bothIn} title="Restart this game for both players"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white flex-shrink-0 transition-all"
          style={{background:accentColor, opacity: bothIn ? 1 : 0.45}}>
          <RotateCcw size={13}/> Restart
        </button>
      </div>
      {!bothIn && (
        <div className="mb-3 p-3 rounded-2xl text-center text-sm font-bold theme-text" style={{background:`${accentColor}22`}}>
          Waiting for the second player… ask a friend in this room to open Games and tap Join 💌
          <span className="block text-xs font-semibold mt-1" style={{color:'var(--color-text-muted)'}}>The game starts when both players are in.</span>
        </div>
      )}
      {gameType==='tictactoe' && game && <TicTacToe game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='rps' && game && <RPS game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='number-guess' && game && <NumberGuess game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='hangman' && game && <Hangman game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
    </div>
  );
}

function TicTacToe({ game, state, profile, accentColor, canPlay, onUpdate }: any) {
  async function makeMove(idx: number) {
    if (!profile || !canPlay || !state.playerO || state.board[idx] || state.winner) return;
    if (state.currentPlayer !== profile.id) return;
    const newBoard = [...state.board];
    const symbol = state.playerX === profile.id ? 'X' : 'O';
    newBoard[idx] = { player: profile.id, symbol };
    const winner = checkWinner(newBoard);
    const nextPlayer = state.currentPlayer===state.playerX ? state.playerO : state.playerX;
    const newState = { ...state, board: newBoard, currentPlayer: nextPlayer, winner };
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active', winner_id: winner && winner!=='draw' ? winner.player : null }).eq('id', game.id);
    onUpdate(newState);
  }

  function checkWinner(board: any[]) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a,b,c] of lines) {
      if (board[a]&&board[b]&&board[c]&&board[a].player===board[b].player&&board[b].player===board[c].player) return board[a];
    }
    if (board.every(Boolean)) return 'draw';
    return null;
  }

  const myTurn = state.currentPlayer === profile?.id;
  return (
    <div className="space-y-4">
      {state.winner ? (
        <div className="text-center p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{state.winner==='draw'?'It\'s a draw! 🤝':`${state.winner.symbol} wins! 🎉`}</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>Tap Restart above to play again together.</p>
        </div>
      ) : !canPlay ? (
        <p className="text-sm font-bold text-center theme-text">Waiting for the second player to join…</p>
      ) : (
        <p className="text-sm font-bold text-center theme-text">{myTurn?'Your turn! ✨':'Waiting for other player...'}</p>
      )}
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {state.board.map((cell: any, i: number)=>(
          <button key={i} onClick={()=>makeMove(i)} disabled={!canPlay || !!state.winner}
            className="aspect-square rounded-2xl text-3xl font-black flex items-center justify-center transition-all hover:scale-105"
            style={{background:cell?`${accentColor}22`:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`,color:accentColor,opacity:(!canPlay||state.winner)?0.6:1}}>
            {cell?.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

function RPS({ game, state, profile, accentColor, canPlay, onUpdate }: any) {
  async function choose(choice: string) {
    if (!profile || !canPlay || state.choices[profile.id]) return;
    const supabase = createClient();
    // Re-read the freshest state first: both players often choose at the
    // same moment, and writing from a stale snapshot would erase the
    // other player's choice, leaving both screens stuck on "Waiting".
    const { data: fresh } = await supabase.from('games').select('state').eq('id', game.id).single();
    const base = (fresh?.state as any) || state;
    if (base.choices?.[profile.id]) { onUpdate(base); return; }
    const newChoices = { ...(base.choices || {}), [profile.id]: choice };
    const players = Object.keys(newChoices);
    let winner: string | null = null;
    if (players.length === 2) {
      const [p1,p2] = players;
      const [c1,c2] = [newChoices[p1],newChoices[p2]];
      const beats: Record<string,string> = { rock:'scissors', scissors:'paper', paper:'rock' };
      if (c1===c2) winner='draw';
      else if (beats[c1]===c2) winner=p1;
      else winner=p2;
    }
    const newState = { ...base, choices: newChoices, winner };
    await supabase.from('games').update({ state: newState, status: winner?'finished':'active', winner_id: winner && winner!=='draw' ? winner : null }).eq('id', game.id);
    onUpdate(newState);
  }
  const myChoice = profile && state.choices[profile.id];
  return (
    <div className="space-y-4 text-center">
      {!canPlay ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-bold theme-text">Waiting for the second player…</p>
          <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Both players must be in before anyone chooses.</p>
        </div>
      ) : state.winner ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">{state.winner==='draw'?'Draw! 🤝':state.winner===profile?.id?'You win! 🎉':'Your friend wins! 🎉'}</p>
          <div className="mt-2 space-y-1 text-sm">
            {Object.entries(state.choices).map(([pid,c]:any)=>(
              <p key={pid} style={{color:'var(--color-text-muted)'}}>{pid===profile?.id?'You':'Them'}: {c==='rock'?'✊':c==='paper'?'✋':'✌️'} {c}</p>
            ))}
          </div>
          <p className="text-xs mt-2" style={{color:'var(--color-text-muted)'}}>Tap Restart above for another round.</p>
        </div>
      ) : myChoice ? (
        <div className="p-4 rounded-2xl" style={{background:`${accentColor}22`}}>
          <p className="font-bold theme-text">You chose: {myChoice==='rock'?'✊':myChoice==='paper'?'✋':'✌️'} {myChoice}</p>
          <p className="text-sm mt-1" style={{color:'var(--color-text-muted)'}}>Waiting for other player...</p>
        </div>
      ) : (
        <>
          <p className="font-bold theme-text">Make your choice!</p>
          <div className="flex gap-3 justify-center">
            {[{v:'rock',e:'✊'},{v:'paper',e:'✋'},{v:'scissors',e:'✌️'}].map(opt=>(
              <button key={opt.v} onClick={()=>choose(opt.v)}
                className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 text-3xl transition-all hover:scale-110"
                style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}44`}}>
                {opt.e}<span className="text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{opt.v}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Number Guess — one player sets the secret number, the other guesses it.
// Start: two choices — "Set the number" or "Guess". Restart returns here.
function NumberGuess({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [guess, setGuess] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const phase = state.phase || 'playing'; // older games have no phase: play as before
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const iAmSetter = state.setterId ? state.setterId === profile?.id : false;
  const iAmGuesser = state.guesserId ? state.guesserId === profile?.id : !state.setterId; // legacy: anyone guesses
  const finished = !!state.winner;

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  async function chooseRole(role: 'write' | 'guess') {
    if (!profile || !otherId) return;
    const setterId = role === 'write' ? profile.id : otherId;
    const guesserId = role === 'write' ? otherId : profile.id;
    await saveState({ ...state, phase: 'setup', setterId, guesserId }, false);
  }

  async function setSecret() {
    const n = parseInt(secretInput);
    if (isNaN(n) || n < 1 || n > 100) return;
    await saveState({ ...state, phase: 'playing', secret: n, guesses: [] }, false);
    setSecretInput('');
  }

  async function makeGuess() {
    if (!iAmGuesser) return;
    const n = parseInt(guess);
    if (isNaN(n) || n < 1 || n > 100 || finished) return;
    const isCorrect = n === state.secret;
    const newGuesses = [...(state.guesses || []), { player: profile?.id, value: n, correct: isCorrect, hint: n < state.secret ? 'Too low! 📉' : 'Too high! 📈' }];
    await saveState({ ...state, guesses: newGuesses, winner: isCorrect ? profile?.id : null, phase: isCorrect ? 'finished' : 'playing' }, isCorrect);
    setGuess('');
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-4 text-center">
        <p className="font-bold theme-text">How do you want to play?</p>
        <p className="text-sm" style={{color:'var(--color-text-muted)'}}>One of you picks the secret number, the other one guesses it.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => chooseRole('write')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">✏️</span><span className="font-black text-sm theme-text">Set the number</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>You pick it, they guess</span>
          </button>
          <button onClick={() => chooseRole('guess')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">🔍</span><span className="font-black text-sm theme-text">Guess</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>They pick it, you guess</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    if (iAmSetter) {
      return (
        <div className="space-y-4 text-center">
          <p className="font-bold theme-text">Pick a secret number between 1 and 100 🔢</p>
          <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Your friend will try to guess it. Keep it secret!</p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <input type="number" min="1" max="100" value={secretInput} onChange={e=>setSecretInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setSecret()}
              placeholder="1–100" className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
            <button onClick={setSecret} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Set it!</button>
          </div>
        </div>
      );
    }
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Your friend is picking a secret number… 🤫</p></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold theme-text text-center">
        {finished ? 'Game over!' : iAmGuesser ? 'Guess the number between 1 and 100!' : 'Your friend is guessing your number… 👀'}
      </p>
      {iAmSetter && !finished && (
        <p className="text-xs text-center font-semibold" style={{color:'var(--color-text-muted)'}}>Your secret number: {state.secret}</p>
      )}
      {finished ? (
        <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}>
          <p className="font-black text-lg theme-text">🎉 Correct! The number was {state.secret}!</p>
          <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>{state.winner === profile?.id ? 'You guessed it!' : 'Your friend guessed it!'} Tap Restart above to play again.</p>
        </div>
      ) : iAmGuesser ? (
        <div className="flex gap-2">
          <input type="number" min="1" max="100" value={guess} onChange={e=>setGuess(e.target.value)} onKeyDown={e=>e.key==='Enter'&&makeGuess()}
            placeholder="1–100" className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
          <button onClick={makeGuess} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Guess!</button>
        </div>
      ) : null}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {[...(state.guesses || [])].reverse().map((g:any,i:number)=>(
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{background:'rgba(255,255,255,0.7)'}}>
            <span className="font-black text-lg" style={{color:g.correct?'#4ADE80':accentColor}}>{g.value}</span>
            <span className="text-sm" style={{color:g.correct?'#4ADE80':'var(--color-text-muted)'}}>{g.correct?'✅ Correct!':g.hint}</span>
            <span className="text-xs ml-auto" style={{color:'var(--color-text-muted)'}}>{g.player===profile?.id?'You':'Them'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hangman — one player writes the word, the other guesses it.
// Start: two choices — "Write the word" or "Guess". The word stays
// hidden from the guesser until it is guessed or the game ends.
function Hangman({ game, state, profile, accentColor, canPlay, players, onUpdate }: any) {
  const [wordInput, setWordInput] = useState('');
  const phase = state.phase || 'playing'; // older games have no phase: play as before
  const otherId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const iAmSetter = state.setterId ? state.setterId === profile?.id : false;
  const iAmGuesser = state.guesserId ? state.guesserId === profile?.id : !state.setterId; // legacy: anyone guesses
  const word: string = state.word || '';
  const guessed: string[] = state.guessed || [];
  const wrongGuesses: string[] = state.wrongGuesses || [];
  const maxWrong = state.maxWrong || 6;
  const isWon = word.length > 0 && word.split('').every((l: string) => guessed.includes(l));
  const isLost = wrongGuesses.length >= maxWrong;
  const finished = isWon || isLost || phase === 'finished';

  async function saveState(newState: any, done: boolean) {
    const supabase = createClient();
    await supabase.from('games').update({ state: newState, status: done ? 'finished' : 'active', winner_id: done ? newState.winner : null }).eq('id', game.id);
    onUpdate(newState);
  }

  async function chooseRole(role: 'write' | 'guess') {
    if (!profile || !otherId) return;
    const setterId = role === 'write' ? profile.id : otherId;
    const guesserId = role === 'write' ? otherId : profile.id;
    await saveState({ ...state, phase: 'setup', setterId, guesserId }, false);
  }

  async function setWord() {
    const w = wordInput.trim().toLowerCase();
    if (!/^[a-z]{3,15}$/.test(w)) return;
    await saveState({ ...state, phase: 'playing', word: w, guessed: [], wrongGuesses: [] }, false);
    setWordInput('');
  }

  async function guessLetter(letter: string) {
    if (!iAmGuesser || guessed.includes(letter) || wrongGuesses.includes(letter) || finished || !word) return;
    const isCorrect = word.includes(letter);
    const newGuessed = isCorrect ? [...guessed, letter] : guessed;
    const newWrong = isCorrect ? wrongGuesses : [...wrongGuesses, letter];
    const won = word.split('').every((l: string) => newGuessed.includes(l));
    const lost = newWrong.length >= maxWrong;
    const done = won || lost;
    await saveState({
      ...state,
      guessed: newGuessed,
      wrongGuesses: newWrong,
      winner: won ? profile?.id : lost ? state.setterId : null,
      phase: done ? 'finished' : 'playing',
    }, done);
  }

  if (!canPlay) {
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Waiting for the second player…</p></div>;
  }

  if (phase === 'choose') {
    return (
      <div className="space-y-4 text-center">
        <p className="font-bold theme-text">How do you want to play?</p>
        <p className="text-sm" style={{color:'var(--color-text-muted)'}}>One of you writes the word, the other one guesses it letter by letter.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => chooseRole('write')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">✏️</span><span className="font-black text-sm theme-text">Write the word</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>You choose it, they guess</span>
          </button>
          <button onClick={() => chooseRole('guess')} className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]" style={{background:'rgba(255,255,255,0.8)',border:`2px solid ${accentColor}33`}}>
            <span className="text-3xl">🔍</span><span className="font-black text-sm theme-text">Guess</span>
            <span className="text-xs" style={{color:'var(--color-text-muted)'}}>They write it, you guess</span>
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    if (iAmSetter) {
      return (
        <div className="space-y-4 text-center">
          <p className="font-bold theme-text">Write a word for your friend to guess 🔡</p>
          <p className="text-sm" style={{color:'var(--color-text-muted)'}}>Letters only, 3–15 letters. Your friend will not see it until they guess it!</p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <input type="text" value={wordInput} onChange={e=>setWordInput(e.target.value.replace(/[^a-zA-Z]/g, ''))} onKeyDown={e=>e.key==='Enter'&&setWord()}
              placeholder="e.g. butterfly" maxLength={15} className="theme-input flex-1 py-3 px-4 text-sm text-center"/>
            <button onClick={setWord} className="theme-btn px-5 py-3 text-sm" style={{background:accentColor}}>Set word</button>
          </div>
        </div>
      );
    }
    return <div className="p-4 rounded-2xl text-center" style={{background:`${accentColor}22`}}><p className="font-bold theme-text">Your friend is writing a word… 🤫</p></div>;
  }

  // Playing / finished: everyone sees the SAME progress — letters are
  // revealed only when the guesser gets them right. The setter watches
  // this exact view live (their own word is shown in small text below).
  // The full word is revealed to all when the game ends.
  const displayWord = word.split('').map((l: string) => (guessed.includes(l) || finished) ? l : '_').join(' ');
  const remaining = maxWrong - wrongGuesses.length;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');

  return (
    <div className="space-y-4 text-center">
      <div className="p-4 rounded-2xl" style={{background:'rgba(255,255,255,0.7)'}}>
        <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>
          {`Wrong guesses: ${wrongGuesses.length}/${maxWrong} · Remaining: ${remaining}`}
        </p>
        <div className="text-2xl font-black tracking-widest theme-text my-3">{displayWord}</div>
        {wrongGuesses.length > 0 && <p className="text-sm" style={{color:'#FF6B6B'}}>❌ {wrongGuesses.join(', ')}</p>}
        {!finished && iAmSetter && <p className="text-xs mt-2 font-semibold" style={{color:'var(--color-text-muted)'}}>Your word: {word}</p>}
        {!finished && iAmSetter && <p className="text-xs mt-1" style={{color:'var(--color-text-muted)'}}>You are watching — your friend is guessing 👀</p>}
      </div>
      {isWon ? <div className="p-4 rounded-2xl font-black text-lg theme-text" style={{background:`${accentColor}22`}}>🎉 {state.winner === profile?.id ? 'You got it!' : 'Your friend got it!'} The word was &quot;{word}&quot;! Tap Restart above to play again.</div>
        : isLost ? <div className="p-4 rounded-2xl font-black text-lg" style={{background:'rgba(255,107,107,0.1)',color:'#FF6B6B'}}>💀 Game over! The word was &quot;{word}&quot;. Tap Restart above to try again.</div>
        : iAmGuesser ? (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {alphabet.map(l => (
              <button key={l} onClick={() => guessLetter(l)} disabled={guessed.includes(l) || wrongGuesses.includes(l)}
                className="w-9 h-9 rounded-xl text-sm font-bold transition-all hover:scale-110"
                style={{background:guessed.includes(l)?`${accentColor}44`:wrongGuesses.includes(l)?'rgba(255,107,107,0.2)':'rgba(255,255,255,0.8)',color:guessed.includes(l)?accentColor:wrongGuesses.includes(l)?'#FF6B6B':'var(--color-text)',border:`1px solid ${accentColor}33`,opacity:guessed.includes(l)||wrongGuesses.includes(l)?0.5:1}}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-bold theme-text">Waiting for your friend to guess…</p>
        )
      }
    </div>
  );
}


function Loading() {
  return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;
}


'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback, useLayoutEffect, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Room, RoomMember, Message, MessageReceipt, Game } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import {
  ArrowLeft, Send, Users, Gamepad2, Settings, Copy, Check, CheckCheck, Hash, Lock, LockOpen,
  Crown, Shield, LogOut, Trash2, X, Share2, Smile, Pencil, Camera, Bell, BellOff, Paperclip, Palette, Mic, Square, FileText, RotateCcw, MoreVertical, Download, ListChecks, KeyRound, Dices, Reply, Pin, Star, BarChart3, Image as ImageIcon, Plus
} from 'lucide-react';
import Link from 'next/link';
import { GAME_META, initialStateFor, dealCrazyEights, seatCheckersPlayer, TicTacToe, RPS, NumberGuess, Hangman, DrawGuess, TriviaDuel, DotsBoxes, CrazyEights, WordleDuel, Checkers, CategoriesDuel, SimonSays } from '@/components/GameComponents';
import MediaGallery, { type GalleryItem } from '@/components/MediaGallery';
import { PollCard } from '@/components/PollCard';
import { PollForm } from '@/components/PollForm';

import EmojiPicker from '@/components/EmojiPicker';
import { isFreshOnline, presenceLabel, sameDay, dayDividerLabel } from '@/lib/presence';
import { isBirthdayToday } from '@/lib/birthday';
import { CHAT_PAGE_SIZE, buildTranscript, downloadTextFile, senderName, quoteSnippet } from '@/lib/chatTools';
import { notifyRoom, notifyGame } from '@/lib/notify';
import ConfirmDialog from '@/components/ConfirmDialog';
import DeleteMessageDialog from '@/components/DeleteMessageDialog';
import EntryCodePrompt from '@/components/EntryCodePrompt';
import { normalizeEntryCode, isValidEntryCode, generateEntryCode } from '@/lib/entryCode';
import { CHAT_THEMES, getChatTheme, chatListStyle } from '@/lib/chatThemes';
import LockerPrompt from '@/components/LockerPrompt';
import SoundToggle from '@/components/SoundToggle';
import { getLockedChats, lockChat, unlockChat, hasLockerCode, verifyLockerCode, isLockerUnlocked, setLockerUnlocked } from '@/lib/locker';

const EMOJI_LIST = ['❤️','😊','😂','🥺','✨','💕','😭','🔥','👍','🎉','😍','🥰','😮','👏','🙏','💯'];

const PRESETS: Record<string,{bg:string;accent:string;emoji:string}> = {
  'cloudy-blue':{bg:'#DCEBFF',accent:'#7CA8E8',emoji:'☁️'},
  'strawberry-milk':{bg:'#FCE3EE',accent:'#E99ABD',emoji:'🍓'},
  'lavender-dreams':{bg:'#EDE7F6',accent:'#9575CD',emoji:'💜'},
  'peachy':{bg:'#FFF3E0',accent:'#FF8A65',emoji:'🍑'},
  'minty-fresh':{bg:'#E8F5E9',accent:'#66BB6A',emoji:'🌿'},
  'cotton-candy':{bg:'#FCE4EC',accent:'#F48FB1',emoji:'🩷'},
};

type Tab = 'chat' | 'members' | 'games' | 'settings';

// Room ticks (migration 015): stamp my delivery/read receipts for the
// given messages. Delivered = my open room view received the message;
// read = I had the chat tab in view. Idempotent upserts: the delivered
// stamp never touches read_at, so a later read stamp is what flips ticks.
async function stampReceipts(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
  userId: string,
  ids: string[],
  read: boolean,
) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const rows = ids.map((id) => read
    ? { message_id: id, user_id: userId, room_id: roomId, delivered_at: now, read_at: now }
    : { message_id: id, user_id: userId, room_id: roomId, delivered_at: now });
  await supabase.from('message_receipts').upsert(rows, { onConflict: 'message_id,user_id' });
}

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
  // Honor ?tab=games (and friends) links, e.g. "Play games here" from the
  // Games page. The Friends page already honors its ?tab= links; the room
  // page ignored them and always opened on Chat. Read on mount only, so
  // tapping tabs afterwards never fights the URL.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'chat' || t === 'members' || t === 'games' || t === 'settings') setTab(t);
  }, []);
  const [input, setInput] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  // "+" menu (composer): one button for Attachment + Poll, so the
  // composer stays roomy on a phone. Both flows are unchanged — the menu
  // just opens them.
  const [showPlusMenu, setShowPlusMenu] = useState(false);
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
  // Mirror of the loaded messages for realtime handlers, whose closures
  // otherwise only see the first render's (empty) list.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // Chat scroll: the list must open at the NEWEST messages (bottom), on
  // first open, after reload, and whenever the list remounts (room tab
  // switch, DM games panel close). The old effect scrolled only when the
  // newest id changed via scrollIntoView — in rooms it fired while the
  // loading spinner was still up (the receipts fetch sits between
  // setMessages and setLoading(false)), consumed its guard, and the list
  // then mounted at the top. New rule: an explicit pending-bottom flag,
  // consumed by a layout effect once the list is actually mounted, plus
  // near-bottom tracking so incoming messages never yank a reader who
  // scrolled up to older history.
  const nearBottomRef = useRef(true);
  const pendingBottomRef = useRef(true);
  const lastSeenNewestRef = useRef<string | null>(null);
  function handleListScroll() {
    const el = listRef.current;
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear' | null>(null);
  // WhatsApp-style delete (migration 032): the dialog offers Delete for
  // everyone (a "This message was deleted" note shows for all) or Delete
  // for me (a marker row in message_deletions hides it only for the
  // deleter). Cancel deletes nothing.
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  // Marker ids this user deleted "for me" — kept so realtime inserts of an
  // already-hidden message are dropped too.
  const hiddenForMeRef = useRef<Set<string>>(new Set());
  async function filterHidden(msgs: Message[], userId: string): Promise<Message[]> {
    if (!msgs.length) return msgs;
    const supabase = createClient();
    const { data } = await supabase.from('message_deletions').select('message_id').eq('user_id', userId).in('message_id', msgs.map(m=>m.id));
    const hidden = new Set((data||[]).map((r:any)=>r.message_id));
    hidden.forEach(id=>hiddenForMeRef.current.add(id));
    return msgs.filter(m=>!hidden.has(m.id));
  }
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
  // Shared media gallery: photos + videos in THIS room only. The query
  // runs only from the unlocked room view (a locked room returns the
  // code prompt before this UI mounts), and is filtered to this room_id.
  const [showGallery, setShowGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  // Room ticks: per-message receipt rows, keyed by message id. A message
  // counts as delivered/seen only when EVERY other current member has a
  // row (members who join later have none until they open the room).
  const [receipts, setReceipts] = useState<Record<string, MessageReceipt[]>>({});
  const tabRef = useRef<Tab>('chat');
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
  // Chat locker (optional, personal): a locked room shows only the code
  // prompt — messages are not even loaded until the code matches.
  const [gated, setGated] = useState(false);
  const [gateTick, setGateTick] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [hasCode, setHasCode] = useState(false);
  const [lockerError, setLockerError] = useState('');
  const [lockerBusy, setLockerBusy] = useState(false);

  async function submitLockerCode(code: string) {
    setLockerBusy(true); setLockerError('');
    const supabase = createClient();
    const ok = await verifyLockerCode(supabase, code);
    setLockerBusy(false);
    if (ok) { setLockerUnlocked(true); setGated(false); setLoading(true); setGateTick(t=>t+1); }
    else setLockerError("That code doesn't match — try again.");
  }

  async function toggleRoomLock() {
    const supabase = createClient();
    if (isLocked) {
      const err = await unlockChat(supabase, 'room', roomId);
      if (!err) setIsLocked(false);
      return;
    }
    if (!hasCode) {
      alert('Set a locker code first in Settings → Account, then lock this room ♡');
      router.push('/settings');
      return;
    }
    const err = await lockChat(supabase, 'room', roomId);
    if (!err) router.replace('/rooms');
  }

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

    // Locker gate: locked rooms load nothing until the code matches.
    const locked = await getLockedChats(supabase);
    const lockedHere = locked.some(l=>l.chat_type==='room' && l.target_id===roomId);
    setIsLocked(lockedHere);
    setHasCode(await hasLockerCode(supabase));
    if (lockedHere && !isLockerUnlocked()) {
      setGated(true);
      setLoading(false);
      return;
    }

    const { data: msgs } = await supabase.from('messages')
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*),poll_votes:poll_votes(*)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    // Deleted-for-everyone rows stay in the list as a placeholder note;
    // rows this user deleted "for me" are hidden only for them.
    const ordered = await filterHidden([...(msgs||[])].reverse(), user.id);
    setMessages(ordered);
    setHasMore((msgs||[]).length === CHAT_PAGE_SIZE);

    // Room ticks: load existing receipts BEFORE first paint, so ticks
    // never flash the wrong state when the room opens.
    const { data: rcpts } = await supabase.from('message_receipts').select('*').eq('room_id', roomId);
    if (rcpts) {
      const map: Record<string, MessageReceipt[]> = {};
      (rcpts as MessageReceipt[]).forEach(r => { (map[r.message_id] ||= []).push(r); });
      setReceipts(map);
    }
    setLoading(false);

    // Stamp my own delivery (and read, when the chat is in view) for
    // others' messages.
    const othersIds = ordered.filter(m => m.sender_id !== user.id).map(m => m.id);
    await stampReceipts(supabase, roomId, user.id, othersIds, false);
    if (document.visibilityState === 'visible') {
      await stampReceipts(supabase, roomId, user.id, othersIds, true);
    }

    // Realtime
    const channel = supabase.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
        const { data: full } = await supabase.from('messages').select('*,sender:profiles!sender_id(*)').eq('id', payload.new.id).single();
        if (full) {
          if (hiddenForMeRef.current.has(full.id)) return;
          setMessages(m=> m.some(x=>x.id===full.id) ? m : [...m, full]);
          // Room ticks: a message arriving while the room is open counts
          // as delivered; read too when the chat tab is in view.
          if (full.sender_id !== user.id) {
            await stampReceipts(supabase, roomId, user.id, [full.id], false);
            if (document.visibilityState === 'visible' && tabRef.current === 'chat') {
              await stampReceipts(supabase, roomId, user.id, [full.id], true);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const upd = payload.new as Message;
        if (upd.is_deleted) {
          setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, is_deleted: true, content: null } : x));
        } else {
          setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, content: upd.content, edited_at: upd.edited_at, is_pinned: upd.is_pinned, pinned_at: upd.pinned_at, reply_to_id: upd.reply_to_id } : x));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const old = payload.old as Message;
        if (old?.id) setMessages(m=>m.filter(x=>x.id!==old.id));
      })
      // Room ticks: receipt rows arrive live so the sender's ticks flip
      // without a reload when members open the room.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_receipts', filter: `room_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as MessageReceipt;
        setReceipts(prev => {
          const list = prev[row.message_id] || [];
          if (list.some(r => r.user_id === row.user_id)) return prev;
          return { ...prev, [row.message_id]: [...list, row] };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_receipts', filter: `room_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as MessageReceipt;
        setReceipts(prev => {
          const list = prev[row.message_id] || [];
          return { ...prev, [row.message_id]: list.some(r => r.user_id === row.user_id) ? list.map(r => r.user_id === row.user_id ? row : r) : [...list, row] };
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_receipts', filter: `room_id=eq.${roomId}` }, (payload) => {
        const old = payload.old as MessageReceipt;
        if (!old?.message_id) return;
        setReceipts(prev => {
          const list = (prev[old.message_id] || []).filter(r => r.user_id !== old.user_id);
          return { ...prev, [old.message_id]: list };
        });
      })
      // Reactions arrive live: when anyone reacts (or removes a reaction)
      // on a message, refresh that message's chips without a reload.
      // (message_reactions has no room_id, so no filter — refreshReactions
      // is a no-op for messages not in this room.)
      // DELETE events carry only the reaction id in old_record (even with
      // REPLICA IDENTITY FULL, the realtime server sends just the PK), so
      // resolve the message from the reactions currently loaded.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        const mid = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
        if (mid) { refreshReactions(mid); return; }
        const rid = (payload.old as any)?.id;
        if (rid) {
          const owner = messagesRef.current.find(m => (m.reactions || []).some(r => r.id === rid));
          if (owner) refreshReactions(owner.id);
        }
      })
      // Poll votes arrive live: when anyone votes (or removes a vote)
      // on a poll, refresh that poll's counts without a reload.
      // (poll_votes has no room_id, so no filter — refreshPollVotes
      // is a no-op for messages not in this room.)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, (payload) => {
        const mid = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
        if (mid) { refreshPollVotes(mid); return; }
        const rid = (payload.old as any)?.id;
        if (rid) {
          const owner = messagesRef.current.find(m => (m.poll_votes || []).some(v => v.id === rid));
          if (owner) refreshPollVotes(owner.id);
        }
      })
      // Room theme/picture changes arrive live: when any member picks a
      // chat theme, a solid preset or a new room picture, everyone in the
      // room re-themes without a reload. (rooms is in the realtime
      // publication since migration 033; the id filter scopes it here.)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        const row = payload.new as Room;
        if (!row?.id) return;
        setRoom(prev => prev ? { ...prev, chat_theme: row.chat_theme ?? prev.chat_theme, preset: row.preset ?? prev.preset, accent_color: row.accent_color ?? prev.accent_color, avatar_url: row.avatar_url ?? prev.avatar_url } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router, roomId, gateTick]);

  // Room ticks: 'seen' only when every other current member has read the
  // message; 'delivered' when every other member's open room view got it.
  function tickState(msg: Message): 'seen' | 'delivered' | 'sent' {
    const others = members.filter(m => m.user_id !== msg.sender_id).map(m => m.user_id);
    if (!others.length) return 'sent';
    const rows = receipts[msg.id] || [];
    const has = (id: string, read: boolean) => rows.some(r => r.user_id === id && (!read || !!r.read_at));
    if (others.every(id => has(id, true))) return 'seen';
    if (others.every(id => has(id, false))) return 'delivered';
    return 'sent';
  }

  useEffect(() => { load(); }, [load]);
  // Room ticks: keep tabRef current, and stamp "read" whenever the chat
  // tab is in view (covers switching back to chat and refocusing the tab).
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => {
    if (tab !== 'chat' || !profile) return;
    const supabase = createClient();
    const stampVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const ids = messages.filter(m => m.sender_id !== profile.id && !m.id.startsWith('temp-')).map(m => m.id);
      stampReceipts(supabase, roomId, profile.id, ids, true);
    };
    stampVisible();
    document.addEventListener('visibilitychange', stampVisible);
    return () => document.removeEventListener('visibilitychange', stampVisible);
  }, [tab, profile, messages, roomId]);
  // A different room (or a locker unlock) always opens at the bottom.
  useEffect(() => {
    pendingBottomRef.current = true;
    nearBottomRef.current = true;
    lastSeenNewestRef.current = null;
  }, [roomId, gateTick]);

  // Scroll manager (layout effect: runs after the list is mounted, so the
  // load-then-receipts-then-loading=false sequence can no longer consume
  // the scroll while the spinner is up).
  useLayoutEffect(() => {
    if (loading || gated) return;
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (pendingBottomRef.current) {
      pendingBottomRef.current = false;
      lastSeenNewestRef.current = last.id;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (last.id !== lastSeenNewestRef.current) {
      lastSeenNewestRef.current = last.id;
      // New arrival: follow only when the reader is already at/near the
      // bottom — never yank someone reading older messages.
      if (nearBottomRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, loading, gated, tab]);

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
    nearBottomRef.current = true; // my own send always lands at the bottom
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
      .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*),poll_votes:poll_votes(*)')
      .eq('room_id', roomId)
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    return filterHidden([...(data||[])].reverse() as Message[], profile!.id);
  }

  // Load an older page of history, keeping the scroll position steady.
  async function loadOlder() {
    if (loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    const older = await fetchOlderPage(messages[0].created_at);
    setMessages(m=>[...older, ...m]);
    // Room ticks: older history just received counts as delivered (and
    // read when the chat is in view), same as the first page.
    if (profile) {
      const supabase = createClient();
      const ids = older.filter(m => m.sender_id !== profile.id).map(m => m.id);
      await stampReceipts(supabase, roomId, profile.id, ids, false);
      if (document.visibilityState === 'visible' && tabRef.current === 'chat') {
        await stampReceipts(supabase, roomId, profile.id, ids, true);
      }
    }
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

  // WhatsApp-style delete (migration 032): writes go through SECURITY
  // DEFINER RPCs so the permission rules are enforced server-side.
  // Owners/moderators may delete any message for everyone; members only
  // their own (canSelect gates the UI, the RPC gates the write).
  async function deleteForEveryone(ids: string[]) {
    if (ids.length === 0) return;
    const supabase = createClient();
    const results = await Promise.all(ids.map(async id=>{
      const { data } = await supabase.rpc('delete_message_for_everyone', { p_message_id: id });
      return { id, ok: !!data };
    }));
    const okIds = results.filter(r=>r.ok).map(r=>r.id);
    if (okIds.length) setMessages(m=>m.map(x=>okIds.includes(x.id)?{...x,is_deleted:true,content:null}:x));
    setDeleteTarget(null);
    setSelectedIds(new Set());
    setSelectMode(false);
    setActionMsg(null);
  }
  async function deleteForMe(ids: string[]) {
    if (ids.length === 0) return;
    const supabase = createClient();
    const results = await Promise.all(ids.map(async id=>{
      const { data } = await supabase.rpc('delete_message_for_me', { p_message_id: id });
      return { id, ok: !!data };
    }));
    const okIds = results.filter(r=>r.ok).map(r=>r.id);
    if (okIds.length) {
      okIds.forEach(id=>hiddenForMeRef.current.add(id));
      setMessages(m=>m.filter(x=>!okIds.includes(x.id)));
    }
    setDeleteTarget(null);
    setSelectedIds(new Set());
    setSelectMode(false);
    setActionMsg(null);
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

  // Message reactions in rooms — same behaviour as DMs: the hold menu
  // offers the 16 quick reactions, chips under the message show the
  // counts, and tapping a chip you added removes it again.
  async function refreshReactions(msgId: string) {
    const supabase = createClient();
    const { data } = await supabase.from('message_reactions').select('*').eq('message_id', msgId);
    setMessages(m=>m.map(x=>x.id===msgId ? { ...x, reactions: data||[] } : x));
  }

  // Tap a reaction chip you already added to remove it; otherwise add it.
  async function toggleReaction(msgId: string, emoji: string) {
    if (!profile) return;
    const supabase = createClient();
    const msg = messages.find(m => m.id === msgId);
    const mine = msg?.reactions?.some((r: any) => r.user_id === profile.id && r.emoji === emoji);
    if (mine) {
      await supabase.from('message_reactions').delete().eq('message_id', msgId).eq('user_id', profile.id).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: profile.id, emoji });
    }
    await refreshReactions(msgId);
  }

  async function addReaction(msgId: string, emoji: string) {
    if (!profile) return;
    const supabase = createClient();
    await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: profile.id, emoji });
    setActionMsg(null);
    await refreshReactions(msgId);
  }

  // Polls in rooms — one vote per user per poll (migration 025).
  // Tap an option to vote or change your vote; tap your voted option
  // again to take your vote back. Counts arrive live via the
  // poll_votes realtime subscription; this refresh is the local echo.
  async function refreshPollVotes(msgId: string) {
    const supabase = createClient();
    const { data } = await supabase.from('poll_votes').select('*').eq('message_id', msgId);
    setMessages(m=>m.map(x=>x.id===msgId ? { ...x, poll_votes: data||[] } : x));
  }

  async function votePoll(msgId: string, optionIndex: number) {
    if (!profile) return;
    const supabase = createClient();
    const msg = messagesRef.current.find(m => m.id === msgId);
    const mine = msg?.poll_votes?.find(v => v.user_id === profile.id);
    if (mine && mine.option_index === optionIndex) {
      await supabase.from('poll_votes').delete().eq('id', mine.id);
    } else {
      await supabase.from('poll_votes').upsert(
        { message_id: msgId, user_id: profile.id, option_index: optionIndex },
        { onConflict: 'message_id,user_id' });
    }
    await refreshPollVotes(msgId);
  }

  async function createPoll(question: string, options: string[]) {
    if (!profile || !room) return;
    setShowPoll(false);
    const supabase = createClient();
    const { data, error } = await supabase.from('messages').insert({
      room_id: roomId, sender_id: profile.id, content: question, type: 'poll',
      poll_data: { question, options }, reply_to_id: replyTo?.id ?? null,
    }).select().single();
    if (!error && data) {
      setMessages(m=>[...m, { ...(data as Message), sender: profile, reactions: [], poll_votes: [] }]);
      setReplyTo(null);
      void notifyRoom(supabase, profile, room, members, 'poll', question);
    } else {
      setSendError("Couldn't post that poll. Please try again.");
    }
  }

  // Shared media gallery: every photo/video in THIS room only — newest
  // first, images + videos with a media_url, deleted messages excluded.
  // Filtered to this room_id, never a broad message read.
  async function openGallery() {
    setShowChatMenu(false);
    if (!profile || gated) return;
    setShowGallery(true);
    setGalleryLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('messages')
      .select('id,media_url,type,created_at,sender_id')
      .eq('room_id', roomId)
      .in('type', ['image', 'video']).not('media_url', 'is', null).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(200);
    const byId: Record<string, string> = {};
    for (const m of members) {
      const p = m.profile as Profile | undefined;
      if (p) byId[m.user_id] = p.display_name || p.username;
    }
    const items = ((data || []) as GalleryItem[]).map((m) => ({
      ...m,
      sender_name: m.sender_id === profile.id ? 'You' : (byId[m.sender_id] || 'Member'),
    }));
    setGalleryItems(items);
    setGalleryLoading(false);
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
  async function uploadRoomPic(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile || !room) return;
    const supabase = createClient();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${profile.id}/room-${roomId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (upErr) { alert('Upload failed. Please try again.'); return; }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path);
    // Any member may change the room picture: the RPC checks membership
    // and updates only the picture (entry codes / members stay owner-only).
    const { data: ok, error } = await supabase.rpc('update_room_appearance', { p_room_id: roomId, p_preset: null, p_accent_color: null, p_avatar_url: pub.publicUrl });
    if (error || !ok) { alert('Could not save the room picture. Please try again.'); return; }
    setRoom({ ...room, avatar_url: pub.publicUrl });
  }

  async function setRoomTheme(key: string) {
    if (!room) return;
    const p = PRESETS[key];
    const supabase = createClient();
    // Any member may change the room theme: the RPC checks membership
    // and updates only the theme (entry codes / members stay owner-only).
    const { data: ok, error } = await supabase.rpc('update_room_appearance', { p_room_id: roomId, p_preset: key, p_accent_color: p.accent, p_avatar_url: null });
    if (error || !ok) { alert('Could not save the theme. Please try again.'); return; }
    setRoom({ ...room, preset: key, accent_color: p.accent });
  }

  // Per-room chat theme (migration 033, Instagram-style): ONE shared
  // gradient theme per room — any member can change it, all members see
  // it instantly. 'default' means no chat theme: the solid preset +
  // personal wallpaper show, as before.
  async function setChatTheme(id: string) {
    if (!room) return;
    const supabase = createClient();
    // Any member may change the room chat theme: the RPC checks
    // membership and validates the theme id (same rule as the presets).
    const { data: ok, error } = await supabase.rpc('set_room_chat_theme', { p_room_id: roomId, p_chat_theme: id });
    if (error || !ok) { alert('Could not save the chat theme. Please try again.'); return; }
    setRoom({ ...room, chat_theme: id });
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
    const { data, error } = await supabase.storage.from('media').upload(fileName, file).catch(() => ({ data: null, error: { message: 'network' } }));
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
  // Per-room chat theme (migration 033): one shared gradient theme per
  // room. When one is picked it sets the list background, own-bubble
  // colour and accent together; 'default' means no chat theme — the
  // solid preset + personal wallpaper show, as before. In Autumn dark
  // mode the dark page wins and only the theme accent applies (same rule
  // as DMs, from the 2026-11-22 dark-mode fix).
  const chatTheme = getChatTheme(room.chat_theme);
  const chatThemeActive = (room.chat_theme || 'default') !== 'default' && profile?.theme !== 'autumn';
  const accentColor = chatThemeActive ? chatTheme.accent : (preset?.accent || room.accent_color || 'var(--color-accent)');
  // Dark (autumn) theme wins over the room's light preset background,
  // so rooms stay readable; the preset accent colour is kept.
  const pageBg = profile?.theme === 'autumn' ? 'var(--color-bg)' : (preset?.bg || 'var(--color-bg)');

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 theme-bg" style={{background:pageBg}}>
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

  if (gated) {
    return (
      <div className="min-h-screen flex flex-col theme-bg" style={{background:pageBg}}>
        <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.9)',borderBottom:'1px solid var(--color-border)'}}>
          <Link href="/rooms" className="p-2 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}><ArrowLeft size={18} style={{color:accentColor}}/></Link>
          <p className="font-black text-sm theme-text flex items-center gap-1.5"><Lock size={14} style={{color:accentColor}}/>Locked room</p>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <LockerPrompt error={lockerError} busy={lockerBusy} onSubmit={submitLockerCode} onCancel={()=>router.replace('/rooms')} title="Locked rooms 🔒" subtitle="Type your locker code to open this locked room. A wrong code shows nothing — the room stays hidden ♡" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{background:pageBg}}>
      {/* Header */}
      {selectMode && tab==='chat' ? (
        <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(var(--color-overlay-rgb),0.4)'}}>
          <button onClick={()=>{setSelectMode(false); setSelectedIds(new Set());}} className="p-2 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}><X size={18} style={{color:accentColor}}/></button>
          <p className="font-black text-sm theme-text flex-1">{selectedIds.size} selected</p>
          <button onClick={()=>setSelectedIds(new Set(messages.filter(m=>!m.is_deleted && !m.id.startsWith('temp-') && canSelect(m)).map(m=>m.id)))} className="text-xs font-bold px-3 py-2 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)',color:'var(--color-text)'}}>Select all</button>
          <button onClick={()=>{ if (selectedIds.size>0) setDeleteTarget({ids:[...selectedIds]}); }} disabled={selectedIds.size===0} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white" style={{background:'#C62828',opacity:selectedIds.size===0?0.5:1}}><Trash2 size={14}/> Delete</button>
        </header>
      ) : (
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.9)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(var(--color-overlay-rgb),0.4)'}}>
        <Link href="/rooms" className="p-2 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}><ArrowLeft size={18} style={{color:accentColor}}/></Link>
                  {room.avatar_url
? <img src={room.avatar_url} alt={room.name} className="w-9 h-9 rounded-xl object-cover"/>
: <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>{preset?.emoji||room.name[0].toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm theme-text truncate flex items-center gap-1.5">{room.name}{room.has_entry_code && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{background:`${accentColor}22`,color:accentColor}}><KeyRound size={10}/>Entry code</span>}</p>
          <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{members.length} members · {members.filter(m=>isFreshOnline((m.profile as Profile)||null)).length} online</p>
        </div>
        {/* Share */}
        <button onClick={copyInviteCode} className="p-2 rounded-xl transition-all" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
          {copied?<Check size={16} style={{color:'#4ADE80'}}/>:<Share2 size={16} style={{color:accentColor}}/>}
        </button>
        {tab==='chat' && (
          <div className="relative">
            <button onClick={()=>setShowChatMenu(v=>!v)} className="p-2 rounded-xl transition-all" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}} title="Chat options"><MoreVertical size={16} style={{color:accentColor}}/></button>
            {showChatMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={()=>setShowChatMenu(false)}/>
                <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl p-2 z-40 space-y-1" style={{background:'var(--color-surface)',border:`1px solid ${accentColor}33`,boxShadow:'0 8px 30px rgba(0,0,0,0.12)'}}>
                  <button onClick={exportRoomChat} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Download size={16} style={{color:accentColor}}/> Export chat</button>
                  <button onClick={openGallery} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ImageIcon size={16} style={{color:accentColor}}/> Media gallery</button>
                  <button onClick={openStarred} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Star size={16} style={{color:accentColor}}/> Starred messages</button>
                  <button onClick={()=>{setShowChatMenu(false); setTab('settings');}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Palette size={16} style={{color:accentColor}}/> Chat theme{(room.chat_theme||'default')!=='default' && <span className="ml-auto text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{chatTheme.name}</span>}</button>
                  <button onClick={()=>{setShowChatMenu(false); setSelectMode(true);}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ListChecks size={16} style={{color:accentColor}}/> Select messages</button>
                  {(myRole==='owner'||myRole==='moderator') && (
                    <button onClick={()=>{setShowChatMenu(false); setConfirmAction('clear');}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-danger)'}}><Trash2 size={16}/> Clear chat</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>
      )}
      {sendError && tab==='chat' && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(255,107,107,0.12)',color:'var(--color-danger)'}}>{sendError} <button onClick={()=>setSendError('')} className="underline ml-1">Dismiss</button></div>
      )}

      {/* Tab bar */}
      <div className="flex px-4 pt-3 gap-1 flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
        {(['chat','members','games','settings'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>{ if (t==='chat') pendingBottomRef.current = true; setTab(t); }}
            className="px-4 py-2 rounded-t-xl text-xs font-bold capitalize transition-all"
            style={{background:tab===t?'var(--color-surface)':'transparent',color:tab===t?'var(--color-text)':'var(--color-text-muted)',borderBottom:tab===t?`2px solid ${accentColor}`:undefined}}>
            {t==='chat'?'💬 Chat':t==='members'?`👥 (${members.length})`:t==='games'?'🎮 Games':'⚙️ Settings'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab==='chat' && (
          <>
            {jumpNote && (
              <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.85)',color:'var(--color-text-muted)'}}>{jumpNote} <button onClick={()=>setJumpNote('')} className="underline ml-1">Dismiss</button></div>
            )}
            {pinnedList.length > 0 && (
              <button onClick={()=>{ const next = (pinIndex + 1) % pinnedList.length; setPinIndex(next); jumpToMessage(pinnedList[next].id); }} className="flex items-center gap-2 px-4 py-2 text-left flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.9)',borderBottom:`1px solid ${accentColor}33`}}>
                <Pin size={14} style={{color:accentColor}} className="flex-shrink-0"/>
                <span className="text-xs font-bold truncate" style={{color:'var(--color-text)'}}>{senderName(pinnedList[pinIndex % pinnedList.length], pinnedList[pinIndex % pinnedList.length].sender_id === profile?.id ? 'You' : 'Member')}: <span className="font-normal" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(pinnedList[pinIndex % pinnedList.length])}</span></span>
                {pinnedList.length > 1 && <span className="text-[11px] font-bold flex-shrink-0" style={{color:accentColor}}>{pinnedList.length} pinned · tap to cycle</span>}
              </button>
            )}
            {/* Messages — a shared chat theme wins over my own wallpaper; with no theme, my wallpaper shows as before */}
            <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={chatListStyle(room.chat_theme, profile?.wallpaper, profile?.theme==='autumn')}>
              {hasMore && messages.length > 0 && (
                <div className="flex justify-center pb-1">
                  <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-bold px-4 py-2 rounded-full" style={{background:'rgba(var(--color-overlay-rgb),0.9)',color:accentColor,border:`1px solid ${accentColor}33`}}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</button>
                </div>
              )}
              {/* Welcome message */}
              {room.welcome_message && messages.length===0 && (
                <div className="text-center py-6">
                  <div className="text-4xl mb-2">{preset?.emoji||'🏠'}</div>
                  <p className="text-sm font-bold" style={{color:'var(--color-text)'}}>{room.welcome_message}</p>
                </div>
              )}
              {messages.map((msg, i)=>{
                const mine = msg.sender_id===profile?.id;
                const ticks = mine && !msg.failed ? tickState(msg) : null;
                const sender = msg.sender as Profile;
                // WhatsApp-style day divider: Today / Yesterday / full date.
                const prev = messages[i-1];
                const divider = (!prev || !sameDay(prev.created_at, msg.created_at)) ? (
                  <div className="flex justify-center py-1">
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full" style={{background:'rgba(var(--color-overlay-rgb),0.9)',color:'var(--color-text-muted)',border:`1px solid ${accentColor}33`}}>{dayDividerLabel(msg.created_at)}</span>
                  </div>
                ) : null;
                const selected = selectedIds.has(msg.id);
                const selectable = canSelect(msg);
                if (msg.is_deleted) return (
                  <Fragment key={msg.id}>
                    {divider}
                    <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex ${mine?'justify-end':'justify-start'}`} style={highlightId===msg.id?{outline:`2px solid ${accentColor}`,outlineOffset:2,borderRadius:16}:undefined}>
                      <span className="text-xs italic px-3 py-1.5 rounded-2xl" style={{color:'var(--color-text-muted)',background:'rgba(var(--color-overlay-rgb),0.9)'}}>This message was deleted</span>
                    </div>
                  </Fragment>
                );
                return (
                  <Fragment key={msg.id}>
                    {divider}
                  <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'}`} style={highlightId===msg.id?{background:'rgba(var(--color-overlay-rgb),0.6)',borderRadius:16,outline:`2px solid ${accentColor}`,outlineOffset:2}:selected?{background:'rgba(var(--color-overlay-rgb),0.6)',borderRadius:16}:undefined} onClick={selectMode && selectable ? ()=>toggleSelect(msg.id) : undefined}>
                    {selectMode && selectable && (
                      <button onClick={(e)=>{e.stopPropagation(); toggleSelect(msg.id);}} className="self-center flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{borderColor:selected?accentColor:'rgba(0,0,0,0.25)',background:selected?accentColor:'transparent',color:'var(--color-on-accent)'}}>
                        {selected && <Check size={14}/>}
                      </button>
                    )}
                    {!mine && <Avatar profile={sender||{}} size={28}/>}
                    <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-0.5`}>
                      {!mine && <span className="text-xs font-bold px-1" style={{color:accentColor}}>{sender?.display_name||sender?.username}</span>}
                      <div className="px-4 py-2.5 rounded-2xl text-sm relative cursor-pointer"
                        style={{background:mine?(chatThemeActive?chatTheme.bubbleMine:accentColor+22):'rgba(var(--color-overlay-rgb),0.9)',border:`1px solid ${accentColor}33`,borderRadius:mine?'20px 20px 4px 20px':'20px 20px 20px 4px',color:mine&&chatThemeActive?chatTheme.bubbleMineText:'var(--color-text)'}}
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
                                  <span className="block text-xs font-bold" style={{color:'var(--color-text)'}}>↩ {senderName(q, q.sender_id === profile?.id ? 'You' : 'Member')}</span>
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
                        {msg.type !== 'audio' && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'poll' && msg.content}
                        {msg.type === 'poll' && (
                          <PollCard poll={msg.poll_data} votes={msg.poll_votes || []} myId={profile?.id} accentColor={accentColor} onVote={(i) => votePoll(msg.id, i)} />
                        )}
                        {actionMsg===msg.id && (
                          <>
                          <div className="fixed inset-0 z-[5]" onClick={()=>setActionMsg(null)}/>
                          <div className={`absolute ${menuBelow?'top-full mt-1':'bottom-full mb-1'} ${mine?'right-0':'left-0'} flex flex-col gap-1 p-1.5 rounded-2xl z-20`} style={{background:'var(--color-surface)',border:`1px solid ${accentColor}33`,boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
                            <div className="flex gap-1" style={{flexWrap:'wrap',maxWidth:320}}>
                              {EMOJI_LIST.map(e=><button key={e} onClick={()=>addReaction(msg.id,e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
                            </div>
                            <div className="flex gap-1 pt-1" style={{borderTop:`1px solid ${accentColor}33`}}>
                              <button onClick={()=>startReply(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Reply size={12}/> Reply</button>
                              {(myRole==='owner'||myRole==='moderator') && (
                                <button onClick={()=>togglePin(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:msg.is_pinned?accentColor:`${accentColor}22`,color:msg.is_pinned?'#fff':'var(--color-text)'}}><Pin size={12}/> {msg.is_pinned?'Unpin':'Pin'}</button>
                              )}
                              <button onClick={()=>toggleStar(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Star size={12}/> {starredIds.has(msg.id)?'Unstar':'Star'}</button>
                              <button onClick={()=>setActionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                            </div>
                            {(mine || myRole==='owner' || myRole==='moderator') && msg.type !== 'poll' && (
                              <div className="flex gap-1 pt-1" style={{borderTop:`1px solid ${accentColor}33`}}>
                                {mine && (
                                  <button onClick={()=>startEdit(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:`${accentColor}22`,color:'var(--color-text)'}}><Pencil size={12}/> Edit</button>
                                )}
                                <button onClick={()=>{setDeleteTarget({ids:[msg.id]}); setActionMsg(null);}} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'var(--color-danger)'}}><Trash2 size={12}/> Delete</button>
                              </div>
                            )}
                          </div>
                          </>
                        )}
                      </div>
                      {/* Reactions display — same as DMs: chips with counts, tap yours to remove it. */}
                      {msg.reactions && msg.reactions.length>0 && (
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(msg.reactions.reduce((acc:Record<string,number>,r:any)=>({...acc,[r.emoji]:(acc[r.emoji]||0)+1}),{})).map(([emoji,count])=>(
                            <button key={emoji} onClick={()=>toggleReaction(msg.id,emoji)} title={msg.reactions?.some((r:any)=>r.user_id===profile?.id&&r.emoji===emoji) ? 'Tap to remove your reaction' : 'Tap to react'} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs" style={{background:'var(--color-secondary)',border:'1px solid var(--color-border)'}}>
                              {emoji} <span style={{color:'var(--color-text-muted)'}}>{count as number}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="text-xs px-1" style={{color:'var(--color-text-muted)'}}>{msg.is_pinned && <Pin size={11} className="inline mr-1" style={{color:accentColor}}/>}{starredIds.has(msg.id) && <Star size={11} className="inline mr-1" style={{color:'#F5B301'}}/>}{new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{ticks === 'seen' ? <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold" style={{color:'var(--color-text)'}}><CheckCheck size={15}/> Seen</span> : ticks === 'delivered' ? <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><CheckCheck size={15}/></span> : ticks === 'sent' ? <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><Check size={15}/></span> : null}{msg.edited_at?' · edited':''}{msg.failed && <button onClick={()=>retrySend(msg.id)} className="ml-1.5 font-bold" style={{color:'var(--color-danger)'}}>Not sent · Tap to retry</button>}</span>
                    </div>
                  </div>
                  </Fragment>
                );
              })}
              <div ref={bottomRef}/>
            </div>
            {Object.values(typingUsers).length > 0 && (
              <div className="px-4 py-1.5 text-xs flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.85)',color:'var(--color-text-muted)'}}>
                <span className="font-semibold" style={{color:accentColor}}>{Object.values(typingUsers)[0]}</span>
                {Object.values(typingUsers).length > 1 ? ' and others are typing' : ' is typing'}<span className="animate-pulse">…</span>
              </div>
            )}
            <form onSubmit={sendMessage} className="relative flex items-end gap-2 p-4 safe-bottom flex-shrink-0" style={{background:'rgba(var(--color-overlay-rgb),0.9)',backdropFilter:'blur(8px)',borderTop:`1px solid ${accentColor}22`}}>
              {showEmojis && (
                <div className="absolute left-4 z-30" style={{bottom:'calc(100% + 8px)'}}>
                  <EmojiPicker onPick={(e)=>{setInput(prev=>prev+e); inputRef.current?.focus();}} />
                </div>
              )}
              {showPlusMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={()=>setShowPlusMenu(false)} />
                  <div className="absolute left-4 z-30 rounded-2xl p-1.5" style={{bottom:'calc(100% + 8px)',background:'var(--color-surface)',border:`1px solid ${accentColor}33`,boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
                    <button type="button" onClick={()=>{setShowPlusMenu(false); fileInputRef.current?.click();}} className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}>
                      <Paperclip size={16} style={{color:accentColor}}/> Attachment
                    </button>
                    <button type="button" onClick={()=>{setShowPlusMenu(false); setShowEmojis(false); setShowPoll(true);}} className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}>
                      <BarChart3 size={16} style={{color:accentColor}}/> Poll
                    </button>
                  </div>
                </>
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
              {/* File input: kept rendered (NOT display:none) — iOS Safari silently ignores
                  programmatic clicks on display:none inputs, so the picker never opens */}
              <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip" className="absolute h-px w-px opacity-0 overflow-hidden" onChange={handleRoomFileUpload}/>
              <button type="button" disabled={uploading} onClick={() => { setShowEmojis(false); setShowPlusMenu(v=>!v); }} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background: showPlusMenu ? accentColor : `${accentColor}22`, color: showPlusMenu ? 'white' : accentColor}} title="Add attachment or poll">
                <Plus size={18}/>
              </button>
              <button type="button" onClick={isRecording ? stopRoomRecording : startRoomRecording} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background: isRecording ? '#C62828' : `${accentColor}22`, color: isRecording ? 'white' : accentColor}} title={isRecording ? 'Stop recording' : 'Record voice message'}>
                {isRecording ? <Square size={16}/> : <Mic size={18}/>}
              </button>
              {isRecording && <span className="text-xs font-bold flex-shrink-0" style={{color:'var(--color-danger)'}}>{Math.floor(recordTime/60)}:{String(recordTime%60).padStart(2,'0')}</span>}
              <button type="button" onClick={() => { setShowPlusMenu(false); setShowEmojis(v=>!v); }} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-105" style={{background: showEmojis ? accentColor : `${accentColor}22`, color: showEmojis ? 'white' : accentColor}} title="Add emoji">
                <Smile size={18}/>
              </button>
              {showPoll && <PollForm accentColor={accentColor} onCreate={createPoll} onCancel={()=>setShowPoll(false)} />}
              <textarea ref={inputRef} value={input} onChange={e=>{setInput(e.target.value); broadcastTyping(); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,160)+'px';}}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
                placeholder="Say something nice... ♡" rows={1}
                className="flex-1 min-w-0 py-3 px-4 rounded-2xl resize-none text-sm"
                style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}44`,outline:'none',minHeight:52,maxHeight:160,fontFamily:"'Nunito',sans-serif"}}/>
              <button type="submit" disabled={!input.trim()} className="p-3 rounded-full flex-shrink-0 transition-all hover:scale-110" style={{background:accentColor,color:'var(--color-on-accent)'}}>
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
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
                  <div className="relative"><Avatar profile={mp||{}} size={40}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:isFreshOnline(mp)?'#4ADE80':'#9CA3AF'}}/></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm theme-text flex items-center gap-1.5">
                      {mp?.display_name||mp?.username}
                      {isBirthdayToday(mp?.birthday) && <span title="Birthday today! 🎂">🎂</span>}
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

        {tab==='games' && <GamesTab roomId={roomId} profile={profile} accentColor={accentColor} members={members}/>}

        {tab==='settings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
              <h3 className="font-black theme-text">Room Picture</h3>
              <div className="flex items-center gap-3">
                {room.avatar_url
                  ? <img src={room.avatar_url} alt={room.name} className="w-16 h-16 rounded-2xl object-cover"/>
                  : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{background:`${accentColor}22`}}>{preset?.emoji||room.name[0].toUpperCase()}</div>}
                <div className="flex-1">
                  <p className="text-sm font-bold theme-text">{room.name}</p>
                  <p className="text-xs" style={{color:'var(--color-text-muted)'}}>This is the picture everyone sees for this room. Anyone in the room can change it ♡</p>
                </div>
                <button onClick={()=>roomPicRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0" style={{background:accentColor,color:'var(--color-on-accent)'}}>
                  <Camera size={14}/> Change
                </button>
              </div>
              {/* Kept rendered (NOT display:none) — iOS Safari ignores clicks on display:none inputs */}
              <input ref={roomPicRef} type="file" accept="image/*" className="absolute h-px w-px opacity-0 overflow-hidden" onChange={uploadRoomPic}/>
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
              <h3 className="font-black theme-text">Room Theme</h3>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PRESETS).map(([key,p])=>(
                  <button key={key} onClick={()=>setRoomTheme(key)}
                    className="p-3 rounded-2xl text-center transition-all hover:scale-[1.03]"
                    style={{background:p.bg, border: room.preset===key ? `2px solid ${p.accent}` : '2px solid transparent'}}>
                    <div className="text-2xl mb-1">{p.emoji}</div>
                    <div className="text-[11px] font-bold capitalize" style={{color:'var(--color-text)'}}>{key.replace('-',' ')}</div>
                  </button>
                ))}
              </div>
              <div className="pt-1">
                <p className="text-xs font-bold mb-2" style={{color:'var(--color-text-muted)'}}>Chat theme — gradient background + bubbles for everyone</p>
                {CHAT_THEMES.map(t=>(
                  <button key={t.id} onClick={()=>{ void setChatTheme(t.id); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-1.5 text-left" style={{background: t.id==='default' ? 'var(--color-secondary)' : t.background, border: (room.chat_theme||'default')===t.id ? `2px solid ${t.accent || accentColor}` : '2px solid transparent'}}>
                    <span className="text-xl">{t.emoji}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold" style={{color: t.dark ? '#F1F5F9' : 'var(--color-text)'}}>{t.name}</span>
                      <span className="block text-xs" style={{color: t.dark ? '#CBD5E1' : 'var(--color-text-muted)'}}>{t.id==='default' ? 'Solid preset + your wallpaper' : 'Shared gradient background + bubbles'}</span>
                    </span>
                    {(room.chat_theme||'default')===t.id && <Check size={16} style={{color: t.accent || accentColor}}/>}
                  </button>
                ))}
                {profile?.theme==='autumn' && (room.chat_theme||'default')!=='default' && (
                  <p className="text-xs font-bold mt-2" style={{color:'var(--color-text-muted)'}}>You&apos;re in Autumn dark mode, so the dark page stays — the theme&apos;s accent colours still apply in this room.</p>
                )}
              </div>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Anyone in this room can change the theme — it updates for everyone ♡</p>
            </div>
            <div className="rounded-2xl p-4" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className="font-black theme-text flex items-center gap-2">{myMuted ? <BellOff size={16}/> : <Bell size={16}/>} Room Notifications</h3>
                  <p className="text-xs mt-0.5" style={{color:'var(--color-text-muted)'}}>{myMuted ? 'You will not get pop-ups for this room.' : 'You get a pop-up when someone messages in this room.'}</p>
                </div>
                <button onClick={toggleMute} className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0" style={{background: myMuted ? '#9CA3AF' : accentColor, color:'var(--color-on-accent)'}}>
                  {myMuted ? 'Muted' : 'On'}
                </button>
              </div>
            </div>
            {myRole==='owner' && (
              <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
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
                  <input type="text" placeholder="New code (4–8 chars)"
                    value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase())}
                    className="theme-input flex-1 py-2.5 px-3 text-sm font-mono tracking-widest uppercase" maxLength={8}/>
                  <button onClick={()=>setCodeInput(generateEntryCode())} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0" style={{background:'var(--color-secondary)',color:'var(--color-text)'}} title="Generate a random code">
                    <Dices size={14}/>Random
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEntryCode} disabled={codeBusy || !codeInput.trim()} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{background:accentColor,color:'var(--color-on-accent)',opacity: codeBusy || !codeInput.trim() ? 0.6 : 1}}>
                    {room.has_entry_code ? 'Change Code' : 'Set Code'}
                  </button>
                  {room.has_entry_code && (
                    <button onClick={removeEntryCode} disabled={codeBusy} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'var(--color-danger)'}}>
                      Remove Code
                    </button>
                  )}
                </div>
                {savedCode && (
                  <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm" style={{background:'var(--color-secondary)'}}>
                    <span className="flex-1 font-bold tracking-widest">{savedCode}</span>
                    <button onClick={copyEntryCode} className="p-1.5 rounded-lg" style={{background:accentColor,color:'var(--color-on-accent)'}}>
                      {codeCopied?<Check size={14}/>:<Copy size={14}/>}
                    </button>
                  </div>
                )}
                {codeMsg && <p className="text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{codeMsg}</p>}
                <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Only you can change or remove it. If you forget it, just set a new one — the old code stops working right away.</p>
              </div>
            )}
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
              <div className="flex items-center gap-2">
                <h3 className="font-black theme-text flex-1 flex items-center gap-2"><Lock size={16}/> Chat Locker</h3>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{background: isLocked ? `${accentColor}22` : 'var(--color-secondary)', color: isLocked ? accentColor : 'var(--color-text-muted)'}}>
                  {isLocked ? '🔒 Locked' : 'Unlocked'}
                </span>
              </div>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>
                Personal and optional: locking hides this room from YOUR rooms list and hides its message previews in notifications. Other members are not affected. It needs your locker code from Settings → Account.
              </p>
              <button onClick={toggleRoomLock} className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2" style={{background:accentColor,color:'var(--color-on-accent)'}}>
                {isLocked ? <><LockOpen size={14}/> Unlock this room</> : <><Lock size={14}/> Lock this room</>}
              </button>
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--color-overlay-rgb),0.8)'}}>
              <h3 className="font-black theme-text">Room Info</h3>
              <div>
                <p className="text-xs font-bold mb-1" style={{color:'var(--color-text-muted)'}}>Invite Code</p>
                <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-sm" style={{background:'var(--color-secondary)'}}>
                  <span className="flex-1 font-bold tracking-widest">{room.invite_code}</span>
                  <button onClick={copyInviteCode} className="p-1.5 rounded-lg" style={{background:accentColor,color:'var(--color-on-accent)'}}>
                    {copied?<Check size={14}/>:<Copy size={14}/>}
                  </button>
                </div>
              </div>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>Share this code with your friends so they can join!</p>
            </div>
            <div className="space-y-2">
              {myRole!=='owner' && (
                <button onClick={leaveRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.08)',color:'var(--color-danger)'}}>
                  <LogOut size={16}/>Leave Room
                </button>
              )}
              {myRole==='owner' && (
                <button onClick={deleteRoom} className="w-full p-3 rounded-2xl flex items-center gap-3 font-bold text-sm" style={{background:'rgba(255,107,107,0.1)',color:'var(--color-danger)'}}>
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
      {deleteTarget && (
        <DeleteMessageDialog
          count={deleteTarget.ids.length}
          onEveryone={()=>deleteForEveryone(deleteTarget.ids)}
          onForMe={()=>deleteForMe(deleteTarget.ids)}
          onCancel={()=>setDeleteTarget(null)}
        />
      )}
      {showStarred && (
        <>
          <div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.35)'}} onClick={()=>setShowStarred(false)}/>
          <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-3xl p-4 max-h-[70vh] overflow-y-auto" style={{background:'var(--color-surface)',border:`1px solid ${accentColor}33`,boxShadow:'0 12px 40px rgba(0,0,0,0.2)'}}>
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
      {showGallery && (
        <MediaGallery
          items={galleryItems}
          title={`Photos & videos in ${room.name}`}
          accentColor={accentColor}
          loading={galleryLoading}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// GAMES TAB — All 6 games inline
// Rules (Nov 2026): nothing can be played until BOTH players are
// in, every game has a Restart, and Hangman / Number Guess start
// with two choices — one player sets the secret, the other guesses.
// Draw & Guess and Trivia Duel run on the same live state sync.

// Draw & Guess word bank: every word is drawable — animals, food and
// everyday things. The hint shown to the guesser is the category.
function GamesTab({ roomId, profile, accentColor, members }: { roomId: string; profile: Profile|null; accentColor: string; members: any[] }) {
  const [gameType, setGameType] = useState<string|null>(null);
  const [game, setGame] = useState<Game|null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [liveGame, setLiveGame] = useState<Game|null>(null);
  const openGameIdRef = useRef<string|null>(null);



  const bothIn = players.length >= 2;

  // Turn labels show the other player's name (display name, else username).
  const otherPlayerId = (players || []).find((p: any) => p.user_id !== profile?.id)?.user_id || null;
  const opponentMember = otherPlayerId ? (members || []).find((m: any) => m.user_id === otherPlayerId) : null;
  const opponentName = opponentMember?.profile?.display_name || opponentMember?.profile?.username || 'Friend';

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
    // and any open game still refresh within a couple of seconds, so a
    // waiting screen never looks stuck, results always appear, and a
    // guesser never stares at a blank canvas for long.
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
    }, 2000);
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
    let st: any = { ...(g.state as any) };
    if (g.type === 'tictactoe' && !st.playerO && st.playerX !== profile.id) {
      st.playerO = profile.id;
    }
    if (g.type === 'crazy-eights') {
      // Deal the joining player their 7 cards from the deck.
      st = dealCrazyEights(st, profile.id);
    }
    if (g.type === 'checkers') {
      // Seat the joining player on the top rows (side 1).
      st = seatCheckersPlayer(st, profile.id);
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
    if (game.type === 'checkers') {
      // Re-seat the second player from the old game, so a rematch keeps
      // both seats; the board itself is a fresh deal.
      fresh.seats = [game.created_by, gameState.seats?.[1] || null];
    }
    if (game.type === 'crazy-eights') {
      // Re-deal the second player from the fresh deck.
      const prevHands = (gameState.hands || {}) as Record<string, string[]>;
      for (const pid of Object.keys(prevHands)) {
        if (pid !== game.created_by) Object.assign(fresh, dealCrazyEights(fresh, pid));
      }
    }
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
            className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0" style={{background:accentColor,color:'var(--color-on-accent)'}}>
            {liveGame.created_by===profile?.id ? 'Open' : 'Join'}
          </button>
        </div>
      )}
      <p className="text-sm font-bold mb-4 theme-text">Choose a game to play with your friends! Both players must be in before a game starts.</p>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(GAME_META).map(([type, meta])=>(
          <button key={type} onClick={()=>startGame(type)}
            className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]"
            style={{background:'rgba(var(--color-overlay-rgb),0.8)',border:`2px solid ${accentColor}33`}}>
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
        <button onClick={closeGame} className="p-2 rounded-xl" style={{background:'rgba(var(--color-overlay-rgb),0.7)'}}>
          <ArrowLeft size={16} style={{color:accentColor}}/>
        </button>
        <span className="font-black theme-text">{GAME_META[gameType]?.name || 'A game'}</span>
        <span className="text-xs ml-auto" style={{color:'var(--color-text-muted)'}}>{players.length} player{players.length===1?'':'s'} in</span>
        <SoundToggle userId={profile?.id}/>
        <button onClick={restartGame} disabled={!bothIn} title="Restart this game for both players"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 transition-all"
          style={{background:accentColor, color:'var(--color-on-accent)', opacity: bothIn ? 1 : 0.45}}>
          <RotateCcw size={13}/> Restart
        </button>
      </div>
      {!bothIn && (
        <div className="mb-3 p-3 rounded-2xl text-center text-sm font-bold theme-text" style={{background:`${accentColor}22`}}>
          Waiting for the second player… ask a friend in this room to open Games and tap Join 💌
          <span className="block text-xs font-semibold mt-1" style={{color:'var(--color-text-muted)'}}>The game starts when both players are in.</span>
        </div>
      )}
      {gameType==='tictactoe' && game && <TicTacToe game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} opponentName={opponentName} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='rps' && game && <RPS game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='number-guess' && game && <NumberGuess game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='hangman' && game && <Hangman game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='draw-guess' && game && <DrawGuess game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='trivia' && game && <TriviaDuel game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='dots-boxes' && game && <DotsBoxes game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} opponentName={opponentName} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='crazy-eights' && game && <CrazyEights game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} opponentName={opponentName} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='wordle' && game && <WordleDuel game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='checkers' && game && <Checkers game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} opponentName={opponentName} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='categories' && game && <CategoriesDuel game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
      {gameType==='simon-says' && game && <SimonSays game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} onUpdate={(s: any)=>setGameState(s)}/>}
    </div>
  );
}

function Loading() {
  return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;
}


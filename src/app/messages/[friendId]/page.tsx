'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState, useRef, useCallback, useLayoutEffect, Fragment } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Message, Game } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { ArrowLeft, Send, Paperclip, Mic, Smile, X, Square, Play, Pause, Image as ImageIcon, FileText, Check, CheckCheck, Pencil, Trash2, MoreVertical, Download, ListChecks, Reply, Pin, Star, Lock, LockOpen, Gamepad2, RotateCcw, BarChart3, Palette, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';

import NextDynamic from 'next/dynamic';
const EmojiPicker = NextDynamic(() => import('@/components/EmojiPicker'), { ssr: false });
import { isFreshOnline, presenceLabel, sameDay, dayDividerLabel } from '@/lib/presence';
import { isBirthdayToday } from '@/lib/birthday';
import { CHAT_THEMES, getChatTheme, chatListStyle } from '@/lib/chatThemes';
import { CHAT_PAGE_SIZE, buildTranscript, downloadTextFile, senderName, quoteSnippet } from '@/lib/chatTools';
import { notifyDM } from '@/lib/notify';
import ConfirmDialog from '@/components/ConfirmDialog';
import DeleteMessageDialog from '@/components/DeleteMessageDialog';
import LockerPrompt from '@/components/LockerPrompt';
import { GAME_META, initialStateFor, restartStateFor, dealCrazyEights, seatCheckersPlayer } from '@/lib/gameLogic';
import GamePanel from '@/components/GamePanel';
import type { GalleryItem } from '@/components/MediaGallery';
const MediaGallery = NextDynamic(() => import('@/components/MediaGallery'), { ssr: false });
import { PollCard } from '@/components/PollCard';
import { PollForm } from '@/components/PollForm';
import { getLockedChats, lockChat, unlockChat, hasLockerCode, verifyLockerCode, isLockerUnlocked, setLockerUnlocked } from '@/lib/locker';
import SoundToggle from '@/components/SoundToggle';
import MessageEffectStyles, { EffectParticles } from '@/components/MessageEffect';
import { MESSAGE_EFFECTS, bubbleEffectStyle, effectPreviewStyle, effectTintStyle, isMessageEffectId, messageEffectDef, resolveMessageEffect, type MessageEffectId } from '@/lib/messageEffects';

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
  const [showPoll, setShowPoll] = useState(false);
  // "+" menu (composer): one button for Attachment + Poll, so the
  // composer stays roomy on a phone. Both flows are unchanged — the menu
  // just opens them.
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  // Message effects (migration 034, redone as animated bubbles
  // 2026-11-27, re-redone 2026-11-27): the effect picked in the
  // composer for the next message, and the messages whose bubbles are
  // animating right now (message id -> { effect, delayMs }). An
  // animation plays once per new message — never for old messages on
  // reload. delayMs is a NEGATIVE animation-delay (ms): when the real
  // saved row replaces the optimistic message, the play carries across
  // mid-flight instead of restarting (the old code cleared + re-animated
  // and the bubble visibly snapped back to the start).
  const [pickedEffect, setPickedEffect] = useState<MessageEffectId | null>(null);
  const [showEffects, setShowEffects] = useState(false);
  type AnimatingEffect = { effect: MessageEffectId; delayMs: number };
  const [animatingEffects, setAnimatingEffects] = useState<Record<string, AnimatingEffect>>({});
  const effectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const effectStartedAtRef = useRef<Record<string, number>>({});
  // Animate one message's bubble: it plays its effect once, then the
  // bubble keeps the effect's tint. Never restarts a play in progress.
  function animateMessage(id: string, effect: MessageEffectId) {
    if (effectTimersRef.current[id]) return;
    const dur = messageEffectDef(effect).durationMs;
    effectStartedAtRef.current[id] = Date.now();
    setAnimatingEffects(prev => ({ ...prev, [id]: { effect, delayMs: 0 } }));
    effectTimersRef.current[id] = setTimeout(() => clearMessageAnimation(id), dur);
  }
  // Carry a running play from the optimistic message onto the real saved
  // row: same effect, same start time, no restart.
  function transferMessageAnimation(oldId: string, newId: string, effect: MessageEffectId) {
    const startedAt = effectStartedAtRef.current[oldId];
    if (effectTimersRef.current[oldId]) { clearTimeout(effectTimersRef.current[oldId]); delete effectTimersRef.current[oldId]; }
    delete effectStartedAtRef.current[oldId];
    setAnimatingEffects(prev => { if (!(oldId in prev)) return prev; const n = { ...prev }; delete n[oldId]; return n; });
    if (!startedAt) { animateMessage(newId, effect); return; }
    const dur = messageEffectDef(effect).durationMs;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= dur) return; // the play already finished — nothing to carry
    effectStartedAtRef.current[newId] = startedAt;
    setAnimatingEffects(prev => ({ ...prev, [newId]: { effect, delayMs: -elapsed } }));
    effectTimersRef.current[newId] = setTimeout(() => clearMessageAnimation(newId), dur - elapsed);
  }
  function clearMessageAnimation(id: string) {
    if (effectTimersRef.current[id]) clearTimeout(effectTimersRef.current[id]);
    delete effectTimersRef.current[id];
    delete effectStartedAtRef.current[id];
    setAnimatingEffects(prev => { if (!(id in prev)) return prev; const n = { ...prev }; delete n[id]; return n; });
  }
  // Clear pending effect timers when the chat unmounts.
  useEffect(() => () => { Object.values(effectTimersRef.current).forEach(clearTimeout); }, []);
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
  // everyone (a "This message was deleted" note shows for both) or Delete
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
  // Who may select a message: only your own (DMs have no owner/moderator).
  function canSelect(msg: Message): boolean {
    return msg.sender_id === profile?.id;
  }
  const [sendError, setSendError] = useState('');
  // Chat locker (optional, personal): a locked chat shows only the code
  // prompt — messages are not even loaded until the code matches.
  const [gated, setGated] = useState(false);
  const [gateTick, setGateTick] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [hasCode, setHasCode] = useState(false);
  const [lockerError, setLockerError] = useState('');
  const [lockerBusy, setLockerBusy] = useState(false);
  // Games in DMs: sessions are scoped by dm_key (the two participants,
  // sorted), completely separate from room games (room_id is null).
  const [showGames, setShowGames] = useState(false);
  const [dmLiveGame, setDmLiveGame] = useState<Game | null>(null);
  const [dmAccent, setDmAccent] = useState('#FF6B9D');
  const dmKey = profile ? `dm:${[profile.id, friendId].sort().join(':')}` : null;
  // Per-chat theme (migration 031, Instagram-style): ONE shared theme per
  // DM — either participant can change it, both see it instantly. 'default'
  // means no chat theme: personal wallpaper + app theme, as before.
  const [chatThemeId, setChatThemeId] = useState('default');
  const chatThemeIdRef = useRef('default');
  const [showThemePicker, setShowThemePicker] = useState(false);
  const chatTheme = getChatTheme(chatThemeId);
  const chatThemeActive = chatThemeId !== 'default' && profile?.theme !== 'autumn';
  function applyChatTheme(id: string) {
    const t = getChatTheme(id);
    chatThemeIdRef.current = id;
    setChatThemeId(id);
    if (id === 'default') {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
      if (v) setDmAccent(v);
    } else {
      setDmAccent(t.accent);
    }
  }
  async function setChatTheme(id: string) {
    if (!dmKey) return;
    const supabase = createClient();
    const { data: ok, error } = await supabase.rpc('set_dm_chat_theme', { p_dm_key: dmKey, p_theme: id });
    if (error || !ok) { alert('Could not save the chat theme. Please try again.'); return; }
    applyChatTheme(id);
  }
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    if (v && chatThemeIdRef.current === 'default') setDmAccent(v);
  }, [profile?.theme]);
  // Discover the DM's live game for the banner (polled; the panel itself
  // subscribes live while open). Nothing loads behind the locker gate.
  useEffect(() => {
    if (!dmKey || gated) return;
    const supabase = createClient();
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from('games').select('*').eq('dm_key', dmKey).neq('status', 'finished').order('created_at', { ascending: false }).limit(1);
      if (!cancelled) setDmLiveGame(data && data[0] ? (data[0] as Game) : null);
    }
    void load();
    // 15s idle cadence: realtime is the primary path for a new game;
    // this only covers a dropped subscription, and never fires while
    // the tab is hidden.
    const t = setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [dmKey, gated]);

  async function submitLockerCode(code: string) {
    setLockerBusy(true); setLockerError('');
    const supabase = createClient();
    const ok = await verifyLockerCode(supabase, code);
    setLockerBusy(false);
    if (ok) { setLockerUnlocked(true); setGated(false); setLoading(true); setGateTick(t=>t+1); }
    else setLockerError("That code doesn't match — try again.");
  }

  async function toggleLock() {
    setShowChatMenu(false);
    const supabase = createClient();
    if (isLocked) {
      const err = await unlockChat(supabase, 'dm', friendId);
      if (!err) setIsLocked(false);
      return;
    }
    if (!hasCode) {
      alert('Set a locker code first in Settings → Account, then lock this chat ♡');
      router.push('/settings');
      return;
    }
    const err = await lockChat(supabase, 'dm', friendId);
    if (!err) router.replace('/messages');
  }
  // Reply / pin / star
  const [replyTo, setReplyTo] = useState<Message|null>(null);
  const [quotedMap, setQuotedMap] = useState<Record<string, Message | null>>({});
  const quotedFetchedRef = useRef<Set<string>>(new Set());
  const [pinnedList, setPinnedList] = useState<Message[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  // Spotlight (migration 035): shared per-chat highlights — a gradient
  // frame on the bubble + a Highlights strip at the top of the chat.
  const [highlightedList, setHighlightedList] = useState<Message[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [showStarred, setShowStarred] = useState(false);
  const [starredMessages, setStarredMessages] = useState<Message[]>([]);
  // Shared media gallery: photos + videos in THIS chat only. The query
  // runs only from the unlocked chat view (a locked chat returns the
  // code prompt before this UI mounts), and is filtered to the DM pair.
  const [showGallery, setShowGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<string|null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [jumpNote, setJumpNote] = useState('');
  const [menuBelow, setMenuBelow] = useState(false);
  const [starredLoading, setStarredLoading] = useState(false);

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

      // Locker gate: locked chats load nothing until the code matches.
      const locked = await getLockedChats(supabase);
      const lockedHere = locked.some(l=>l.chat_type==='dm' && l.target_id===friendId);
      setIsLocked(lockedHere);
      setHasCode(await hasLockerCode(supabase));
      if (lockedHere && !isLockerUnlocked()) {
        setGated(true);
        setLoading(false);
        return;
      }

      // Load messages — NEWEST first, then display oldest-to-newest.
      // (The old query loaded the OLDEST 100, so recent messages vanished
      // after reload in any long chat.)
      const { data: msgs } = await supabase.from('messages')
        .select('*,sender:profiles!sender_id(*),reactions:message_reactions(*),poll_votes:poll_votes(*)')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE_SIZE);
      // Deleted-for-everyone rows stay in the list as a placeholder note;
      // rows this user deleted "for me" are hidden only for them.
      const ordered = await filterHidden([...(msgs||[])].reverse(), user.id);
      setMessages(ordered);
      setHasMore((msgs||[]).length === CHAT_PAGE_SIZE);
      setLoading(false);

      // Shared chat theme for this DM (migration 031): load the row for
      // our dm_key; 'default'/missing means no theme (personal wallpaper).
      const myDmKey = `dm:${[user.id, friendId].sort().join(':')}`;
      const { data: themeRow } = await supabase.from('dm_chat_themes').select('theme').eq('dm_key', myDmKey).maybeSingle();
      if (themeRow?.theme) applyChatTheme(themeRow.theme);

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
            if (full && hiddenForMeRef.current.has(full.id)) return;
            if (full && full.sender_id===friendId) {
              setFriendTyping(false);
              const now = new Date().toISOString();
              await supabase.from('messages').update({ read_at: now, delivered_at: now }).eq('id', full.id);
              full.read_at = now; full.delivered_at = now;
            }
            // Message effect: a friend's message with an effect animates
            // its bubble on arrival. My own messages already played when
            // I sent them.
            if (full && full.sender_id===friendId && isMessageEffectId(full.effect)) {
              animateMessage(full.id, full.effect);
            }
            // Dedupe: my own message may already be here via optimistic send.
            if (full) setMessages(m=> m.some(x=>x.id===full.id) ? m : [...m, full]);
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const upd = payload.new as Message;
          if (upd.is_deleted) {
            setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, is_deleted: true, content: null } : x));
          } else {
            setMessages(m=>m.map(x=>x.id===upd.id ? { ...x, delivered_at: upd.delivered_at, read_at: upd.read_at, content: upd.content, edited_at: upd.edited_at, is_pinned: upd.is_pinned, pinned_at: upd.pinned_at, is_highlighted: upd.is_highlighted, highlighted_at: upd.highlighted_at, reply_to_id: upd.reply_to_id } : x));
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const old = payload.old as Message;
          if (old?.id) setMessages(m=>m.filter(x=>x.id!==old.id));
        })
        // Reactions arrive live: when anyone reacts (or removes a reaction)
        // on a message, refresh that message's chips without a reload.
        // (message_reactions has no room/dm scope column, so no filter —
        // refreshReactions is a no-op for messages not in this chat.)
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, (payload) => {
          const mid = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
          if (mid) { refreshPollVotes(mid); return; }
          const rid = (payload.old as any)?.id;
          if (rid) {
            const owner = messagesRef.current.find(m => (m.poll_votes || []).some(v => v.id === rid));
            if (owner) refreshPollVotes(owner.id);
          }
        })
        // Chat theme changes arrive live: when either of us picks a theme,
        // the other side's chat re-themes without a reload. (No filter —
        // the dm_key carries colons, so the row is matched in code.)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_chat_themes' }, (payload) => {
          const row = payload.new as any;
          if (row?.dm_key === myDmKey && typeof row.theme === 'string') applyChatTheme(row.theme);
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
  }, [router, friendId, gateTick]);

  // A different chat (or a locker unlock) always opens at the bottom.
  useEffect(() => {
    pendingBottomRef.current = true;
    nearBottomRef.current = true;
    lastSeenNewestRef.current = null;
  }, [friendId, gateTick]);

  // Scroll manager (layout effect: runs after the list is mounted, so a
  // load-then-loading=false sequence can no longer consume the scroll
  // while the spinner is up).
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
  }, [messages, loading, gated, showGames]);

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
    // Spotlight strip: the chat's highlighted messages, newest first.
    // Deleted messages never show here (they render as a placeholder).
    supabase.from('messages').select('*,sender:profiles!sender_id(*)')
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`)
      .eq('is_highlighted', true).eq('is_deleted', false).order('highlighted_at', { ascending: false })
      .then(({ data }) => { setHighlightedList((data||[]) as Message[]); setHighlightIndex(0); });
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

    const { data, error } = await supabase.storage.from('media').upload(fileName, file).catch(() => ({ data: null, error: { message: 'network' } }));
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
      else void notifyDM(supabase, profile, friendId, type, file.name);
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
          else void notifyDM(supabase, profile, friendId, 'audio', 'Voice message');
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
    setShowEffects(false);
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
    // Message effect: the picked effect wins, else a magic word in the
    // text ("happy birthday", "congrats", "love you"…) picks one.
    const effect = resolveMessageEffect(text, pickedEffect);
    // Optimistic: show the message instantly instead of waiting on realtime.
    const tempId = `temp-${Date.now()}`;
    const temp: Message = {
      id: tempId, room_id: null, sender_id: profile.id, receiver_id: friendId,
      content: text, media_url: null, delivered_at: null, read_at: null,
      edited_at: null, type: 'text', is_deleted: false, reply_to: null,
      reply_to_id: replyTo?.id ?? null, effect: effect ?? null, is_pinned: false, pinned_at: null, is_highlighted: false, highlighted_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      sender: profile, reactions: [],
    };
    nearBottomRef.current = true; // my own send always lands at the bottom
    setMessages(m=>[...m, temp]);
    setInput('');
    setReplyTo(null);
    if (effect) animateMessage(tempId, effect);
    setPickedEffect(null);
    const { data, error } = await supabase.from('messages').insert({
      sender_id: profile.id, receiver_id: friendId,
      content: text, type: 'text', reply_to_id: replyTo?.id ?? null, effect: effect ?? null
    }).select().single();
    if (!error && data) {
      // The real row replaces the optimistic one: carry the bubble
      // animation across mid-flight instead of restarting it.
      if (effect) { transferMessageAnimation(tempId, (data as Message).id, effect); }
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
      void notifyDM(supabase, profile, friendId, 'text', text);
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
      content: msg.content, type: 'text', reply_to_id: msg.reply_to_id ?? null, effect: msg.effect ?? null
    }).select().single();
    if (!error && data) {
      setMessages(m=>m.map(x=>x.id===tempId ? { ...(data as Message), sender: profile, reactions: [] } : x));
      if (isMessageEffectId(msg.effect)) animateMessage((data as Message).id, msg.effect);
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
      .or(`and(sender_id.eq.${profile!.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile!.id})`)
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    return filterHidden([...(data||[])].reverse() as Message[], profile!.id);
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

  // WhatsApp-style delete (migration 032): writes go through SECURITY
  // DEFINER RPCs so the permission rules are enforced server-side.
  async function deleteForEveryone(ids: string[]) {
    if (!profile || ids.length === 0) return;
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
  }
  async function deleteForMe(ids: string[]) {
    if (!profile || ids.length === 0) return;
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

  // Polls in DMs — one vote per user per poll (migration 025).
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
    if (!profile) return;
    setShowPoll(false);
    const supabase = createClient();
    const { data, error } = await supabase.from('messages').insert({
      receiver_id: friendId, sender_id: profile.id, content: question, type: 'poll',
      poll_data: { question, options }, reply_to_id: replyTo?.id ?? null,
    }).select().single();
    if (!error && data) {
      setMessages(m=>[...m, { ...(data as Message), sender: profile, reactions: [], poll_votes: [] }]);
      setReplyTo(null);
      void notifyDM(supabase, profile, friendId, 'poll', question);
    } else {
      setSendError("Couldn't post that poll. Please try again.");
    }
  }

  // Long-press (touch) opens the same menu as right-click
  const pressTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  function startPress(id: string, clientY?: number) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(()=>{ setMenuBelow((clientY ?? 999) < 240); setReactionMsg(id); }, 450);
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
    const pinning = !msg.is_pinned;
    const { error } = await supabase.rpc('set_message_pinned', { p_message_id: msg.id, p_pin: pinning });
    if (error) { setSendError("Couldn't change that pin. Please try again."); return; }
    const stamped = { ...msg, is_pinned: pinning, pinned_at: pinning ? new Date().toISOString() : null };
    setMessages(m=>m.map(x=>x.id===msg.id ? stamped : x));
    setPinnedList(prev => pinning ? [stamped, ...prev.filter(x=>x.id!==msg.id)] : prev.filter(x=>x.id!==msg.id));
  }

  // Spotlight (migration 035): highlight / un-highlight a message for
  // everyone in this chat — the gradient frame + strip entry follow from
  // the shared row, exactly like pinning.
  async function toggleHighlight(msg: Message) {
    setReactionMsg(null);
    const supabase = createClient();
    const highlighting = !msg.is_highlighted;
    const { error } = await supabase.rpc('set_message_highlighted', { p_message_id: msg.id, p_highlight: highlighting });
    if (error) { setSendError("Couldn't change that highlight. Please try again."); return; }
    const stamped = { ...msg, is_highlighted: highlighting, highlighted_at: highlighting ? new Date().toISOString() : null };
    setMessages(m=>m.map(x=>x.id===msg.id ? stamped : x));
    setHighlightedList(prev => highlighting ? [stamped, ...prev.filter(x=>x.id!==msg.id)] : prev.filter(x=>x.id!==msg.id));
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

  // Shared media gallery: every photo/video in THIS DM only — newest
  // first, images + videos with a media_url, deleted messages excluded.
  // Filtered to the DM pair, never a broad message read.
  async function openGallery() {
    setShowChatMenu(false);
    if (!profile || gated) return;
    setShowGallery(true);
    setGalleryLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('messages')
      .select('id,media_url,type,created_at,sender_id')
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`)
      .in('type', ['image', 'video']).not('media_url', 'is', null).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(200);
    const items = ((data || []) as GalleryItem[]).map((m) => ({
      ...m,
      sender_name: m.sender_id === profile.id ? 'You' : (friend?.display_name || friend?.username || 'Friend'),
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
    const mine = (data||[]).filter((m:any)=> (m.sender_id===profile.id&&m.receiver_id===friendId)||(m.sender_id===friendId&&m.receiver_id===profile.id));
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

  const pinnedCurrent = pinnedList.length ? pinnedList[pinIndex % pinnedList.length] : null;
  const highlightedCurrent = highlightedList.length ? highlightedList[highlightIndex % highlightedList.length] : null;


  if (loading) return <div className="min-h-screen flex items-center justify-center theme-bg"><div className="flex gap-2">{[0,1,2].map(i=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:'var(--color-accent)',animation:'float 1s ease-in-out infinite',animationDelay:`${i*0.2}s`}}/>)}</div><style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style></div>;

  if (gated) return (
    <div className="min-h-screen theme-bg flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
        <Link href="/messages" className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><ArrowLeft size={18} style={{color:'var(--color-accent)'}}/></Link>
        <p className="font-black text-sm theme-text flex items-center gap-1.5"><Lock size={14} style={{color:'var(--color-accent)'}}/>Locked chat</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <LockerPrompt error={lockerError} busy={lockerBusy} onSubmit={submitLockerCode} onCancel={()=>router.replace('/messages')} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen theme-bg">
      {/* Header */}
      {selectMode ? (
        <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
          <button onClick={()=>{setSelectMode(false); setSelectedIds(new Set());}} className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><X size={18} style={{color:'var(--color-accent)'}}/></button>
          <p className="font-black text-sm theme-text flex-1">{selectedIds.size} selected</p>
          <button onClick={()=>setSelectedIds(new Set(messages.filter(m=>!m.is_deleted && !m.id.startsWith('temp-') && canSelect(m)).map(m=>m.id)))} className="text-xs font-bold px-3 py-2 rounded-xl" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}>Select all</button>
          <button onClick={()=>{ if (selectedIds.size>0) setDeleteTarget({ids:[...selectedIds]}); }} disabled={selectedIds.size===0} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white" style={{background:'#C62828',opacity:selectedIds.size===0?0.5:1}}><Trash2 size={14}/> Delete</button>
        </header>
      ) : (
      <header className="flex items-center gap-3 px-4 py-3 z-20 flex-shrink-0" style={{background:'var(--color-surface)',borderBottom:'1px solid var(--color-border)'}}>
        <Link href="/messages" className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}}><ArrowLeft size={18} style={{color:'var(--color-accent)'}}/></Link>
        {friend && (
          <>
            <div className="relative"><Avatar profile={friend} size={38}/><div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{background:isFreshOnline(friend)?'#4ADE80':'#9CA3AF'}}/></div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm theme-text">{friend.display_name||friend.username}{isBirthdayToday(friend.birthday) && <span className="ml-1" title="Birthday today! 🎂">🎂</span>}</p>
              <p className="text-xs" style={{color:'var(--color-text-muted)'}}>{friendTyping ? 'typing…' : friendInChat ? 'In this chat 💬' : isFreshOnline(friend) ? '🟢 Online' : presenceLabel(friend)}</p>
            </div>
          </>
        )}
        <button onClick={() => setShowGames(true)} className="relative p-2 rounded-xl flex-shrink-0" style={{ background: 'var(--color-secondary)' }} title="Play a game">
          <Gamepad2 size={18} style={{ color: 'var(--color-accent)' }} />
          {dmLiveGame && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#FF6B6B' }} />}
        </button>
        <div className="relative">
          <button onClick={()=>setShowChatMenu(v=>!v)} className="p-2 rounded-xl" style={{background:'var(--color-secondary)'}} title="Chat options"><MoreVertical size={18} style={{color:'var(--color-accent)'}}/></button>
          {showChatMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={()=>setShowChatMenu(false)}/>
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl p-2 z-40 space-y-1" style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 8px 30px rgba(0,0,0,0.12)'}}>
                <button onClick={exportChat} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Download size={16} style={{color:'var(--color-accent)'}}/> Export chat</button>
                <button onClick={openGallery} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ImageIcon size={16} style={{color:'var(--color-accent)'}}/> Media gallery</button>
                <button onClick={openStarred} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Star size={16} style={{color:'var(--color-accent)'}}/> Starred messages</button>
                <button onClick={()=>{setShowChatMenu(false); setShowThemePicker(true);}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><Palette size={16} style={{color:'var(--color-accent)'}}/> Chat theme{chatThemeId!=='default' && <span className="ml-auto text-xs font-bold" style={{color:'var(--color-text-muted)'}}>{chatTheme.name}</span>}</button>
                <button onClick={()=>{setShowChatMenu(false); setSelectMode(true);}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}><ListChecks size={16} style={{color:'var(--color-accent)'}}/> Select messages</button>
                <button onClick={toggleLock} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}>{isLocked?<LockOpen size={16} style={{color:'var(--color-accent)'}}/>:<Lock size={16} style={{color:'var(--color-accent)'}}/>} {isLocked?'Unlock chat':'Lock chat'}</button>
                <button onClick={()=>{setShowChatMenu(false); setConfirmAction('clear');}} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-danger)'}}><Trash2 size={16}/> Clear chat</button>
              </div>
            </>
          )}
        </div>
      </header>
      )}
      {friend && isBirthdayToday(friend.birthday) && (
        <div className="flex-shrink-0 px-4 pt-3">
          <div className="relative overflow-hidden rounded-2xl px-4 py-3 text-center" style={{ background: 'var(--color-secondary)', border: '2px solid var(--color-border)' }}>
            <BirthdayConfetti />
            <p className="relative font-black text-sm" style={{ color: 'var(--color-text)' }}>🎂 It&apos;s {friend.display_name || friend.username}&apos;s birthday today! ♡</p>
            <p className="relative text-xs font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>Send them some love — it&apos;s their day!</p>
          </div>
        </div>
      )}
      {sendError && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'rgba(255,107,107,0.12)',color:'var(--color-danger)'}}>{sendError} <button onClick={()=>setSendError('')} className="underline ml-1">Dismiss</button></div>
      )}
      {jumpNote && (
        <div className="px-4 py-2 text-xs font-bold text-center flex-shrink-0" style={{background:'var(--color-secondary)',color:'var(--color-text-muted)'}}>{jumpNote} <button onClick={()=>setJumpNote('')} className="underline ml-1">Dismiss</button></div>
      )}
      {pinnedCurrent && (
        <button onClick={()=>{ const next = (pinIndex + 1) % pinnedList.length; setPinIndex(next); jumpToMessage(pinnedList[next].id); }} className="flex items-center gap-2 px-4 py-2 text-left flex-shrink-0" style={{background:'var(--color-secondary)',borderBottom:'1px solid var(--color-border)'}}>
          <Pin size={14} style={{color:'var(--color-accent)'}} className="flex-shrink-0"/>
          <span className="text-xs font-bold truncate" style={{color:'var(--color-text)'}}>{senderName(pinnedCurrent, pinnedCurrent.sender_id === profile?.id ? 'You' : 'Friend')}: <span className="font-normal" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(pinnedCurrent)}</span></span>
          {pinnedList.length > 1 && <span className="text-[11px] font-bold flex-shrink-0" style={{color:'var(--color-accent-text)'}}>{pinnedList.length} pinned · tap to cycle</span>}
        </button>
      )}
      {highlightedCurrent && (
        <button onClick={()=>{ const next = (highlightIndex + 1) % highlightedList.length; setHighlightIndex(next); jumpToMessage(highlightedList[next].id); }} className="flex items-center gap-2 px-4 py-2 text-left flex-shrink-0" style={{background:`linear-gradient(90deg, ${dmAccent}26, #FF8FB326)`,borderBottom:'1px solid var(--color-border)'}}>
          <Sparkles size={14} style={{color:dmAccent}} className="flex-shrink-0"/>
          <span className="text-xs font-bold truncate" style={{color:'var(--color-text)'}}>Spotlight: {senderName(highlightedCurrent, highlightedCurrent.sender_id === profile?.id ? 'You' : 'Friend')}: <span className="font-normal" style={{color:'var(--color-text-muted)'}}>{quoteSnippet(highlightedCurrent)}</span></span>
          {highlightedList.length > 1 && <span className="text-[11px] font-bold flex-shrink-0" style={{color:'var(--color-accent-text)'}}>{highlightedList.length} highlights · tap to cycle</span>}
        </button>
      )}

      {dmLiveGame && !showGames && (
        <button onClick={() => setShowGames(true)} className="mx-4 mt-3 p-3 rounded-2xl flex items-center gap-3 text-left flex-shrink-0" style={{ background: `${dmAccent}22`, border: `2px solid ${dmAccent}44` }}>
          <span className="text-2xl">{GAME_META[dmLiveGame.type]?.emoji || '🎮'}</span>
          <span className="flex-1 min-w-0">
            <span className="block font-black text-sm theme-text">{GAME_META[dmLiveGame.type]?.name || 'A game'} is live in this chat!</span>
            <span className="block text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{dmLiveGame.created_by === profile?.id ? 'You started this game — jump back in.' : 'Your friend started this game — tap to play together.'}</span>
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0" style={{ background: dmAccent, color: 'var(--color-on-accent)' }}>Play</span>
        </button>
      )}

      {showGames && dmKey && profile ? (
        <DMGamesPanel dmKey={dmKey} profile={profile} friendName={friend?.display_name || friend?.username || 'Friend'} accentColor={dmAccent} initialGameId={dmLiveGame?.id || null} onClose={() => { pendingBottomRef.current = true; setShowGames(false); }} />
      ) : (
      <>
      {/* Messages */}
      {/* Messages — a shared chat theme wins over my own wallpaper when one
          is set (both of us see the same background); otherwise my own
          wallpaper shows, only I see it. */}
      <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ ...chatListStyle(chatThemeId, profile?.wallpaper, profile?.theme==='autumn'), overflowX: 'clip' }}>
        {hasMore && messages.length > 0 && (
          <div className="flex justify-center pb-1">
            <button onClick={loadOlder} disabled={loadingOlder} className="text-xs font-bold px-4 py-2 rounded-full" style={{background:'var(--color-secondary)',color:'var(--color-accent)',border:'1px solid var(--color-border)'}}>{loadingOlder ? 'Loading…' : '↑ Load older messages'}</button>
          </div>
        )}
        {messages.map((msg, i)=>{
          const mine = msg.sender_id === profile?.id;
          // Message effect on this row, narrowed once (null when none).
          const fxEffect = isMessageEffectId(msg.effect) ? msg.effect : null;
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
                <span className="text-xs italic px-3 py-1.5 rounded-2xl" style={{color:'var(--color-text-muted)',background:'var(--color-secondary)'}}>This message was deleted</span>
              </div>
            </Fragment>
          );
          const selected = selectedIds.has(msg.id);
          return (
            <Fragment key={msg.id}>
              {divider}
            <div ref={el=>{ msgRefs.current[msg.id]=el; }} className={`flex gap-2 ${mine?'flex-row-reverse':'flex-row'} ${selected?'rounded-2xl':''}`} style={highlightId===msg.id?{background:'var(--color-secondary)',borderRadius:16,outline:'2px solid var(--color-accent)',outlineOffset:2}:selected?{background:'var(--color-secondary)'}:undefined} onClick={selectMode && canSelect(msg) ? ()=>toggleSelect(msg.id) : undefined}>
              {selectMode && canSelect(msg) && (
                <button onClick={(e)=>{e.stopPropagation(); toggleSelect(msg.id);}} className="self-center flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{borderColor:selected?'var(--color-accent)':'var(--color-border)',background:selected?'var(--color-accent)':'transparent',color:'var(--color-on-accent)'}}>
                  {selected && <Check size={14}/>}
                </button>
              )}
              {!mine && <Avatar profile={(msg.sender as Profile)||{}} size={28}/>}
              <div className={`max-w-[75%] ${mine?'items-end':'items-start'} flex flex-col gap-1`}>
                {/* Spotlight frame: a 2px gradient border around a highlighted bubble (migration 035). */}
                <div style={msg.is_highlighted ? { background: `linear-gradient(135deg, ${dmAccent}, #FF8FB3, ${dmAccent})`, padding: 2, borderRadius: 22 } : undefined}>
                <div
                  className="px-4 py-2.5 rounded-2xl text-sm relative group cursor-pointer"
                  style={{
                    // Message effect: a message with an effect keeps its
                    // tint after the pop settles (and after reload — the
                    // effect id is stored on the row).
                    ...(fxEffect ? effectTintStyle(fxEffect) : {
                      background: mine ? (chatThemeActive ? chatTheme.bubbleMine : 'var(--color-bubble-mine)') : 'var(--color-bubble-other)',
                      color: mine && chatThemeActive ? chatTheme.bubbleMineText : undefined,
                    }),
                    border: mine?undefined:'1px solid var(--color-border)',
                    borderRadius: mine?'20px 20px 4px 20px':'20px 20px 20px 4px',
                    // While this message's bubble is animating, the
                    // keyframes pop/flash it and land on its tint.
                    ...(animatingEffects[msg.id] ? bubbleEffectStyle(animatingEffects[msg.id].effect, animatingEffects[msg.id].delayMs) : {}),
                  }}
                  onContextMenu={e=>{if(selectMode) return; e.preventDefault();setMenuBelow(e.clientY < 240);setReactionMsg(msg.id);}}
                  onTouchStart={(e)=>{if(!selectMode) startPress(msg.id, e.touches[0]?.clientY);}} onTouchEnd={endPress} onTouchMove={endPress}
                  onClick={msg.failed ? ()=>retrySend(msg.id) : fxEffect ? ()=>{ if (!selectMode && reactionMsg!==msg.id) animateMessage(msg.id, fxEffect); } : undefined}
                  title={fxEffect ? 'Tap to replay the effect' : undefined}
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
                            <span className="block text-xs font-bold" style={{color:'var(--color-text)'}}>↩ {senderName(q, q.sender_id === profile?.id ? 'You' : 'Friend')}</span>
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
                  {msg.type !== 'audio' && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'poll' && msg.content}
                  {msg.type === 'poll' && (
                    <PollCard poll={msg.poll_data} votes={msg.poll_votes || []} myId={profile?.id} accentColor={dmAccent} onVote={(i) => votePoll(msg.id, i)} />
                  )}
                  {/* Message effect particles: small solid shapes bursting
                      from the bubble while its effect plays. */}
                  {animatingEffects[msg.id] && <EffectParticles effect={animatingEffects[msg.id].effect} delayMs={animatingEffects[msg.id].delayMs} />}
                  {/* Reaction picker on hover */}
                  {reactionMsg===msg.id && (
                    <>
                    <div className="fixed inset-0 z-[5]" onClick={()=>setReactionMsg(null)}/>
                    <div className={`absolute ${menuBelow?'top-full mt-1':'bottom-full mb-1'} ${mine?'right-0':'left-0'} flex flex-col gap-1 p-2 rounded-2xl z-10`} style={{background:'var(--color-surface)',boxShadow:'0 4px 20px rgba(0,0,0,0.1)',border:'1px solid var(--color-border)'}}>
                      <div className="flex gap-1" style={{flexWrap:'wrap',maxWidth:320}}>
                      {EMOJI_LIST.map(e=><button key={e} onClick={()=>addReaction(msg.id,e)} className="text-lg hover:scale-125 transition-transform">{e}</button>)}
                      <button onClick={()=>setReactionMsg(null)} className="text-xs p-1"><X size={12}/></button>
                      </div>
                      <div className="flex gap-1 pt-1" style={{borderTop:'1px solid var(--color-border)'}}>
                        <button onClick={()=>startReply(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Reply size={12}/> Reply</button>
                        <button onClick={()=>togglePin(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:msg.is_pinned?'var(--color-accent)':'var(--color-secondary)',color:msg.is_pinned?'#fff':'var(--color-text)'}}><Pin size={12}/> {msg.is_pinned?'Unpin':'Pin'}</button>
                        <button onClick={()=>toggleHighlight(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:msg.is_highlighted?'var(--color-accent)':'var(--color-secondary)',color:msg.is_highlighted?'#fff':'var(--color-text)'}}><Sparkles size={12}/> {msg.is_highlighted?'Unhighlight':'Highlight'}</button>
                        <button onClick={()=>toggleStar(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Star size={12}/> {starredIds.has(msg.id)?'Unstar':'Star'}</button>
                      </div>
                      {mine && (
                        <div className="flex gap-1 pt-1" style={{borderTop:'1px solid var(--color-border)'}}>
                          {msg.type==='text' && (
                            <button onClick={()=>startEdit(msg)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'var(--color-secondary)',color:'var(--color-text)'}}><Pencil size={12}/> Edit</button>
                          )}
                          <button onClick={()=>{setDeleteTarget({ids:[msg.id]}); setReactionMsg(null);}} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{background:'rgba(255,107,107,0.1)',color:'var(--color-danger)'}}><Trash2 size={12}/> Delete</button>
                        </div>
                      )}
                    </div>
                    </>
                  )}
                </div>
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
                  {msg.is_highlighted && <Sparkles size={11} className="inline mr-1" style={{color:dmAccent}}/>}
                  {starredIds.has(msg.id) && <Star size={11} className="inline mr-1" style={{color:'#F5B301'}}/>}
                  {new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {msg.failed && <button onClick={()=>retrySend(msg.id)} className="ml-1.5 font-bold" style={{color:'var(--color-danger)'}}>Not sent · Tap to retry</button>}
                  {mine && !msg.failed && (msg.read_at
                    ? <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold" style={{color:'var(--color-text)'}}><CheckCheck size={15}/> Seen</span>
                    : msg.delivered_at
                      ? <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><CheckCheck size={15}/></span>
                      : <span className="ml-1.5 inline-flex items-center" style={{color:'var(--color-text-muted)'}}><Check size={15}/></span>)}
                  {mine && msg.edited_at && <span className="ml-1 italic">· edited</span>}
                  {mine && <button onClick={()=>setDeleteTarget({ids:[msg.id]})} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{color:'var(--color-danger)'}}>Delete</button>}
                </span>
              </div>
            </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* File input: kept rendered (NOT display:none) — iOS Safari silently ignores
          programmatic clicks on display:none inputs, so the picker never opens */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="absolute h-px w-px opacity-0 overflow-hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
      />
      {friendTyping && (
        <div className="px-4 py-1.5 text-xs flex-shrink-0" style={{background:'var(--color-surface)',color:'var(--color-text-muted)'}}>
          <span className="font-semibold" style={{color:'var(--color-accent-text)'}}>{friend?.display_name || friend?.username || 'Your friend'}</span> is typing<span className="animate-pulse">…</span>
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
            <button type="button" onClick={()=>stopRecording(false)} className="p-2.5 rounded-full" style={{background:'rgba(255,107,107,0.1)',color:'var(--color-danger)'}}>
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
          {showPlusMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={()=>setShowPlusMenu(false)} />
              <div className="absolute left-4 z-30 rounded-2xl p-1.5" style={{bottom:'calc(100% + 8px)',background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
                <button type="button" onClick={()=>{setShowPlusMenu(false); fileInputRef.current?.click();}} className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}>
                  <Paperclip size={16} style={{color:'var(--color-accent)'}}/> Attachment
                </button>
                <button type="button" onClick={()=>{setShowPlusMenu(false); setShowEmojis(false); setShowPoll(true);}} className="flex items-center gap-2 w-full px-3 py-3 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)'}}>
                  <BarChart3 size={16} style={{color:'var(--color-accent)'}}/> Poll
                </button>
              </div>
            </>
          )}
          {showEffects && (
            <>
              <div className="fixed inset-0 z-30" onClick={()=>setShowEffects(false)} />
              <div className="absolute left-4 z-30 rounded-2xl p-2 w-[240px]" style={{bottom:'calc(100% + 8px)',background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
                <p className="px-2 pt-1 pb-2 text-xs font-black" style={{color:'var(--color-text-muted)'}}>Send with an effect ✨</p>
                {MESSAGE_EFFECTS.map(e=>(
                  <button key={e.id} type="button" onClick={()=>{setPickedEffect(e.id); setShowEffects(false); inputRef.current?.focus();}} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text)',background: pickedEffect===e.id ? 'var(--color-secondary)' : 'transparent'}}>
                    <span className="inline-block w-7 h-5 rounded-full flex-shrink-0" style={effectPreviewStyle(e.id)} /> {e.name}
                    <span className="ml-auto text-xs font-normal" style={{color:'var(--color-text-muted)'}}>{e.hint}</span>
                  </button>
                ))}
                {pickedEffect && (
                  <button type="button" onClick={()=>{setPickedEffect(null); setShowEffects(false);}} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-left" style={{color:'var(--color-text-muted)'}}>
                    <X size={14}/> No effect
                  </button>
                )}
                <p className="px-2 pt-2 pb-1 text-[11px]" style={{color:'var(--color-text-muted)'}}>Magic words work too: “happy birthday”, “congrats”, “love you”, “good luck” ♡ Tap any effect message to replay it.</p>
              </div>
            </>
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
            onClick={() => { setShowEmojis(false); setShowEffects(false); setShowPlusMenu(v=>!v); }}
            className="p-3 rounded-full transition-all hover:scale-105"
            style={{background: showPlusMenu ? 'var(--color-accent)' : 'var(--color-secondary)', color: showPlusMenu ? '#fff' : 'var(--color-accent)'}}
            title="Add attachment or poll"
          >
            <Plus size={18} />
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
            onClick={() => { setShowPlusMenu(false); setShowEffects(false); setShowEmojis(v=>!v); }}
            className="p-3 rounded-full transition-all hover:scale-105"
            style={{background: showEmojis ? 'var(--color-accent)' : 'var(--color-secondary)', color: showEmojis ? '#fff' : 'var(--color-accent)'}}
            title="Add emoji"
          >
            <Smile size={18} />
          </button>

          <button
            type="button"
            onClick={() => { setShowPlusMenu(false); setShowEmojis(false); setShowEffects(v=>!v); }}
            className="p-3 rounded-full transition-all hover:scale-105 flex-shrink-0"
            style={{background: pickedEffect ? 'var(--color-accent)' : 'var(--color-secondary)', color: pickedEffect ? '#fff' : 'var(--color-accent)'}}
            title={pickedEffect ? `Effect: ${MESSAGE_EFFECTS.find(e=>e.id===pickedEffect)?.name} — tap to change` : 'Send with an effect'}
          >
            {pickedEffect ? <span className="inline-block w-5 h-4 rounded-full" style={effectPreviewStyle(pickedEffect)} /> : <Sparkles size={18} />}
          </button>

          {showPoll && <PollForm accentColor={dmAccent} onCreate={createPoll} onCancel={()=>setShowPoll(false)} />}

          <div className="flex-1 relative min-w-0">
            <textarea
              ref={inputRef}
              value={input} onChange={e=>{setInput(e.target.value); broadcastTyping(); e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px';}}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e as any);}}}
              placeholder={uploading ? "Uploading media..." : "Say something nice... ♡"}
              disabled={uploading}
              rows={1}
              className="theme-input w-full py-3 px-4 text-sm resize-none"
              style={{minHeight:52,maxHeight:160}}
            />
          </div>

          <button type="submit" disabled={!input.trim()||sending||uploading} className="theme-btn p-3 flex-shrink-0" style={{borderRadius:'50%'}}>
            <Send size={16}/>
          </button>
        </form>
      )}
      </>
      )}
      <MessageEffectStyles />
      {confirmAction === 'clear' && (
        <ConfirmDialog
          title="Clear this chat?"
          message="This will delete all messages in this chat for you and your friend. This cannot be undone."
          confirmLabel="Clear chat"
          onConfirm={clearChat}
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
          <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-3xl p-4 max-h-[70vh] overflow-y-auto" style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 12px 40px rgba(0,0,0,0.2)'}}>
            <div className="flex items-center gap-2 mb-3">
              <Star size={18} style={{color:'#F5B301'}}/>
              <p className="font-black text-sm theme-text flex-1">Starred messages</p>
              <button onClick={()=>setShowStarred(false)} className="p-1.5 rounded-full" style={{background:'var(--color-secondary)'}}><X size={14}/></button>
            </div>
            {starredLoading ? (
              <p className="text-sm text-center py-6" style={{color:'var(--color-text-muted)'}}>Loading your stars… ♡</p>
            ) : starredMessages.length===0 ? (
              <p className="text-sm text-center py-6" style={{color:'var(--color-text-muted)'}}>No starred messages yet.<br/>Hold a message and tap Star ⭐ to keep it here — only you can see your stars.</p>
            ) : starredMessages.map(m=>(
              <button key={m.id} onClick={()=>{setShowStarred(false); jumpToMessage(m.id);}} className="w-full text-left px-3 py-2.5 rounded-2xl mb-1.5" style={{background:'var(--color-secondary)'}}>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-bold" style={{color:'var(--color-accent-text)'}}>{senderName(m, m.sender_id===profile?.id?'You':'Friend')}</span>
                  <span className="text-[11px]" style={{color:'var(--color-text-muted)'}}>{new Date(m.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} {new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </span>
                <span className="block text-sm truncate theme-text">{quoteSnippet(m)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {showThemePicker && (
        <>
          <div className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.35)'}} onClick={()=>setShowThemePicker(false)}/>
          <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-3xl p-4 max-h-[70vh] overflow-y-auto" style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',boxShadow:'0 12px 40px rgba(0,0,0,0.2)'}}>
            <div className="flex items-center gap-2 mb-1">
              <Palette size={18} style={{color:'var(--color-accent)'}}/>
              <p className="font-black text-sm theme-text flex-1">Chat theme</p>
              <button onClick={()=>setShowThemePicker(false)} className="p-1.5 rounded-full" style={{background:'var(--color-secondary)'}}><X size={14}/></button>
            </div>
            <p className="text-xs font-bold mb-3" style={{color:'var(--color-text-muted)'}}>Either of you can change it — it updates for both instantly ♡</p>
            {CHAT_THEMES.map(t=>(
              <button key={t.id} onClick={()=>{ void setChatTheme(t.id); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-1.5 text-left" style={{background: t.id==='default' ? 'var(--color-secondary)' : t.background, border: chatThemeId===t.id ? `2px solid ${t.accent || 'var(--color-accent)'}` : '2px solid transparent'}}>
                <span className="text-xl">{t.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold" style={{color: t.dark ? '#F1F5F9' : 'var(--color-text)'}}>{t.name}</span>
                  <span className="block text-xs" style={{color: t.dark ? '#CBD5E1' : 'var(--color-text-muted)'}}>{t.id==='default' ? 'Your wallpaper + app theme' : 'Shared background + bubbles for both of you'}</span>
                </span>
                {chatThemeId===t.id && <Check size={16} style={{color: t.accent || 'var(--color-accent)'}}/>}
              </button>
            ))}
            {profile?.theme==='autumn' && chatThemeId!=='default' && (
              <p className="text-xs font-bold mt-2" style={{color:'var(--color-text-muted)'}}>You&apos;re in Autumn dark mode, so the dark page stays — the theme&apos;s accent colours still apply in this chat.</p>
            )}
          </div>
        </>
      )}
      {showGallery && (
        <MediaGallery
          items={galleryItems}
          title={`Photos & videos with ${friend?.display_name || friend?.username || 'Friend'}`}
          accentColor={dmAccent}
          loading={galleryLoading}
          onClose={() => setShowGallery(false)}
        />
      )}
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

// Games inside a 1:1 DM. Same shared game components and sync pattern as
// room games (realtime channel + 2s polling fallback + stateRef mirror),
// but sessions are scoped by dm_key — the two DM participants, sorted —
// with room_id null, so DM games can never cross-talk with room games.
// The two participants ARE the players: there is no join ceremony. The
// friend joins automatically the moment they open the panel; until then
// the game waits (timed games never run without both players present).
// Birthday confetti: small solid-colour rectangles falling once across
// the birthday banner. Pure CSS, no blur/glow, no library — the pieces
// sit behind the banner text, fall once, then fade out and stay gone.
const CONFETTI_COLORS = ['#FF6B9D', '#FFC94D', '#7FB069', '#6C8CFF', '#FF9E7D', '#B388FF'];
function BirthdayConfetti() {
  const pieces = Array.from({ length: 16 }, (_, i) => ({
    left: (i * 61) % 100,
    delay: (i % 8) * 0.35,
    dur: 2.6 + (i % 5) * 0.5,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <style>{`@keyframes palsy-confetti-fall{0%{transform:translateY(-14px) rotate(0deg);opacity:0}15%{opacity:1}100%{transform:translateY(64px) rotate(360deg);opacity:0}}`}</style>
      {pieces.map((p, i) => (
        <span key={i} className="absolute top-0 block rounded-[2px]"
          style={{ left: `${p.left}%`, width: 7, height: 11, background: p.color, animation: `palsy-confetti-fall ${p.dur}s ease-in ${p.delay}s 1 both` }} />
      ))}
    </div>
  );
}

function DMGamesPanel({ dmKey, profile, friendName, accentColor, initialGameId, onClose }: { dmKey: string; profile: Profile; friendName: string; accentColor: string; initialGameId: string | null; onClose: () => void }) {
  const [gameType, setGameType] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [liveGame, setLiveGame] = useState<Game | null>(null);
  const liveGameRef = useRef<Game | null>(null);
  const lastIdlePollRef = useRef(0);
  useEffect(() => { liveGameRef.current = liveGame; }, [liveGame]);
  const openGameIdRef = useRef<string | null>(null);
  const autoJoinedRef = useRef<string | null>(null);

  const bothIn = players.length >= 2;

  async function refreshPlayers(gameId: string) {
    const supabase = createClient();
    const { data } = await supabase.from('game_players').select('*').eq('game_id', gameId);
    setPlayers(data || []);
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

  // Discover the DM's live game, and keep an open game in sync on both
  // players' screens (moves arrive via realtime; polling covers drops).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('games').select('*').eq('dm_key', dmKey).neq('status', 'finished').order('created_at', { ascending: false }).limit(1);
      if (!cancelled && data && data[0]) setLiveGame(data[0] as Game);
    })();
    const channel = supabase.channel(`games-dm-${dmKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `dm_key=eq.${dmKey}` }, (payload) => {
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
    // Idle-throttled: with no live game and none open, the banner only
    // re-checks every 15s (realtime is the primary path), and nothing
    // polls while the tab is hidden — an idle DM used to fire three
    // game queries every 2–3s forever.
    const poll = setInterval(async () => {
      if (cancelled || document.hidden) return;
      if (!openGameIdRef.current && !liveGameRef.current) {
        const now = Date.now();
        if (now - lastIdlePollRef.current < 15000) return;
        lastIdlePollRef.current = now;
      }
      const { data } = await supabase.from('games').select('*').eq('dm_key', dmKey).neq('status', 'finished').order('created_at', { ascending: false }).limit(1);
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
  }, [dmKey]);

  async function joinGame(g: Game) {
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
    // and the waiting banner lifts the moment the second player is in.
    const { data } = await supabase.from('games').update({ state: st, status: count >= 2 ? 'active' : 'waiting' }).eq('id', g.id).select().single();
    openGame((data as Game) || g);
    if (plist) setPlayers(plist);
  }

  // Auto-join: opening the panel on a live game joins it — no Join tap,
  // no invite. Runs once per game id.
  useEffect(() => {
    if (!initialGameId || autoJoinedRef.current === initialGameId) return;
    autoJoinedRef.current = initialGameId;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('games').select('*').eq('id', initialGameId).single();
      if (!data || (data as Game).status === 'finished') return;
      const g = data as Game;
      const { data: plist } = await supabase.from('game_players').select('*').eq('game_id', g.id);
      const alreadyIn = (plist || []).some((p: any) => p.user_id === profile.id);
      if (alreadyIn) openGame(g);
      else await joinGame(g);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGameId]);

  async function startGame(type: string) {
    const supabase = createClient();
    const initialState = initialStateFor(type, profile.id);
    const { data: g } = await supabase.from('games').insert({ room_id: null, dm_key: dmKey, type, status: 'waiting', state: initialState, created_by: profile.id }).select().single();
    if (g) {
      await supabase.from('game_players').upsert({ game_id: g.id, user_id: profile.id }, { onConflict: 'game_id,user_id' });
      setLiveGame(g as Game);
      openGame(g as Game);
    }
  }

  async function restartGame() {
    if (!game || !gameState) return;
    const supabase = createClient();
    const fresh = restartStateFor(game, gameState);
    const { data } = await supabase.from('games').update({ state: fresh, status: 'active', winner_id: null }).eq('id', game.id).select().single();
    if (data) {
      setGame(data as Game);
      setGameState((data as Game).state);
    } else {
      setGameState(fresh);
    }
  }

  if (!gameType) return (
    <div className="flex-1 overflow-y-auto p-4 w-full max-w-[592px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: 'rgba(var(--color-overlay-rgb),0.7)' }}>
          <ArrowLeft size={16} style={{ color: accentColor }} />
        </button>
        <span className="font-black theme-text">Games with {friendName} 🎮</span>
      </div>
      {liveGame && (
        <div className="mb-4 p-4 rounded-2xl flex items-center gap-3" style={{ background: `${accentColor}22`, border: `2px solid ${accentColor}44` }}>
          <span className="text-3xl">{GAME_META[liveGame.type]?.emoji || '🎮'}</span>
          <div className="flex-1">
            <p className="font-black text-sm theme-text">{GAME_META[liveGame.type]?.name || 'A game'} is live in this chat!</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{liveGame.created_by === profile.id ? 'You started this game — jump back in.' : 'Your friend started this game — open it and play together, live.'}</p>
          </div>
          <button onClick={() => { if (liveGame.created_by !== profile.id) joinGame(liveGame); else openGame(liveGame); }}
            className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0" style={{ background: accentColor, color: 'var(--color-on-accent)' }}>
            Open
          </button>
        </div>
      )}
      <p className="text-sm font-bold mb-4 theme-text">Just the two of you — your friend joins automatically when they open the game. No invite needed!</p>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(GAME_META).map(([type, meta]) => (
          <button key={type} onClick={() => startGame(type)}
            className="p-5 rounded-2xl flex flex-col items-center gap-2 transition-all hover:scale-[1.03]"
            style={{ background: 'rgba(var(--color-overlay-rgb),0.8)', border: `2px solid ${accentColor}33` }}>
            <span className="text-3xl">{meta.emoji}</span>
            <span className="font-black text-sm theme-text">{meta.name}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{meta.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 w-full max-w-[592px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={closeGame} className="p-2 rounded-xl" style={{ background: 'rgba(var(--color-overlay-rgb),0.7)' }}>
          <ArrowLeft size={16} style={{ color: accentColor }} />
        </button>
        <span className="font-black theme-text">{GAME_META[gameType]?.name || 'A game'}</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-muted)' }}>{players.length} player{players.length === 1 ? '' : 's'} in</span>
        <SoundToggle userId={profile?.id}/>
        <button onClick={restartGame} disabled={!bothIn} title="Restart this game for both players"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 transition-all"
          style={{ background: accentColor, color: 'var(--color-on-accent)', opacity: bothIn ? 1 : 0.45 }}>
          <RotateCcw size={13} /> Restart
        </button>
      </div>
      {!bothIn && (
        <div className="mb-3 p-3 rounded-2xl text-center text-sm font-bold theme-text" style={{ background: `${accentColor}22` }}>
          Waiting for {friendName} to open this game… 💌
          <span className="block text-xs font-semibold mt-1" style={{ color: 'var(--color-text-muted)' }}>The game starts when they open it — no invite needed.</span>
        </div>
      )}
      <GamePanel gameType={gameType} game={game} state={gameState} profile={profile} accentColor={accentColor} canPlay={bothIn} players={players} opponentName={friendName} onUpdate={(s: any) => setGameState(s)} />
    </div>
  );
}

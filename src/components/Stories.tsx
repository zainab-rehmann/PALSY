'use client';

// Stories — 24-hour photo/video status updates (migration 029).
// The strip sits on the dashboard: your own circle first, then one
// circle per friend who has a live story. Tap a circle to watch
// their stories full-screen; tap your own circle to post one.
// VISIBILITY: the query only ever asks for stories whose owner is
// me or one of my friends, and only where expires_at is still in
// the future — a stranger's story is never fetched, so it can never
// render (the SELECT policy is permissive by design, same as the
// app's other permissive reads; the app filter is the gate).
// LOCKER RULE: this renders on the dashboard, which has no locker
// gate — it never mounts inside a locked chat, so no story ever
// shows behind a lock. Uploads reuse the message composer's media
// bucket path shape (`<userId>/stories/<timestamp>.<ext>`).
// Solid colours only, no blur/glow.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Story } from '@/types';
import { Avatar } from '@/components/layout/AppLayout';
import { X, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { timeAgo } from '@/lib/notify';

interface StoryGroup {
  owner: Profile;
  stories: Story[]; // oldest first, so the viewer plays in order
}

function timeLeft(expiresAt: string): string {
  const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'expiring now';
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m left`;
}

export default function Stories({ profile }: { profile: Profile | null }) {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [viewer, setViewer] = useState<{ gi: number; si: number } | null>(null);
  const [pending, setPending] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    // My friends' ids (friendships are stored both ways).
    const { data: fships } = await supabase.from('friendships').select('friend_id').eq('user_id', profile.id);
    const friendIds = (fships || []).map((f: { friend_id: string }) => f.friend_id);
    const ids = [profile.id, ...friendIds];
    const now = new Date().toISOString();
    const { data: rows } = await supabase.from('stories')
      .select('*')
      .in('user_id', ids)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });
    const stories = (rows || []) as Story[];
    // Names + avatars for everyone with a live story.
    const owners = new Map<string, Profile>();
    const ownerIds = [...new Set(stories.map((s) => s.user_id))];
    if (ownerIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', ownerIds);
      for (const p of (profs || []) as Profile[]) owners.set(p.id, p);
    }
    // Group by owner, oldest first inside a group; my group first,
    // then friends by their newest story.
    const byOwner = new Map<string, Story[]>();
    for (const s of stories) {
      const list = byOwner.get(s.user_id) || [];
      list.push(s);
      byOwner.set(s.user_id, list);
    }
    const made: StoryGroup[] = [];
    for (const [uid, list] of byOwner) {
      const owner = owners.get(uid);
      if (!owner) continue;
      made.push({ owner, stories: [...list].sort((a, b) => a.created_at.localeCompare(b.created_at)) });
    }
    made.sort((a, b) => {
      if (a.owner.id === profile.id) return -1;
      if (b.owner.id === profile.id) return 1;
      const aNew = a.stories[a.stories.length - 1].created_at;
      const bNew = b.stories[b.stories.length - 1].created_at;
      return bNew.localeCompare(aNew);
    });
    setGroups(made);
    setMyStories(byOwner.get(profile.id) || []);
  }, [profile]);

  useEffect(() => { void load(); }, [load]);

  // Live refresh: a friend posting (or deleting) a story reloads the strip.
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    const channel = supabase.channel(`stories-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

  // Escape closes the viewer (or the composer) first.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pending) setPending(null);
      else if (viewer) setViewer(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pending, viewer]);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError('');
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { setError('Pick a photo or a video.'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('That file is too big — 50MB max.'); return; }
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const path = `${profile.id}/stories/${Date.now()}.${ext}`;
    const { data, error: upErr } = await supabase.storage.from('media').upload(path, file);
    if (upErr || !data) {
      setError("Upload failed. Please try again.");
      setUploading(false);
    } else {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
      setPending({ url: publicUrl, type: isVideo ? 'video' : 'image' });
      setCaption('');
      setUploading(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function postStory() {
    if (!profile || !pending || posting) return;
    setPosting(true);
    setError('');
    const supabase = createClient();
    const { error: insErr } = await supabase.from('stories').insert({
      user_id: profile.id,
      media_url: pending.url,
      media_type: pending.type,
      caption: caption.trim() || null,
    });
    setPosting(false);
    if (insErr) {
      setError("Couldn't post that story. Please try again.");
      return;
    }
    setPending(null);
    setCaption('');
    await load();
  }

  async function deleteStory(story: Story) {
    if (!profile || story.user_id !== profile.id) return;
    const supabase = createClient();
    await supabase.from('stories').delete().eq('id', story.id);
    // Step the viewer back (or close it) so it never points at a
    // story that no longer exists.
    setViewer((v) => {
      if (!v) return v;
      const group = groups[v.gi];
      if (!group || group.owner.id !== profile.id) return v;
      if (group.stories.length <= 1) return null;
      return { gi: v.gi, si: Math.max(0, v.si - 1) };
    });
    await load();
  }

  function step(d: number) {
    if (!viewer) return;
    const group = groups[viewer.gi];
    if (!group) { setViewer(null); return; }
    const ni = viewer.si + d;
    if (ni >= 0 && ni < group.stories.length) { setViewer({ gi: viewer.gi, si: ni }); return; }
    const ng = viewer.gi + d;
    if (ng >= 0 && ng < groups.length) { setViewer({ gi: ng, si: d > 0 ? 0 : groups[ng].stories.length - 1 }); return; }
    if (d > 0) setViewer(null); // past the last story: close
  }

  if (!profile) return null;
  const current = viewer ? groups[viewer.gi]?.stories[viewer.si] || null : null;
  const currentOwner = viewer ? groups[viewer.gi]?.owner || null : null;
  const isMine = current ? current.user_id === profile.id : false;

  return (
    <div>
      {/* Strip — horizontal scroll, own circle first. */}
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => {
          setError('');
          if (myStories.length > 0) {
            const gi = groups.findIndex((g) => g.owner.id === profile.id);
            if (gi >= 0) { setViewer({ gi, si: 0 }); return; }
          }
          fileRef.current?.click();
        }}
          className="flex flex-col items-center gap-1 flex-shrink-0 w-16" title={myStories.length > 0 ? 'View your story' : 'Add to your story'}>
          <span className="relative w-14 h-14 rounded-full flex items-center justify-center"
            style={{ border: myStories.length > 0 ? '3px solid var(--color-accent)' : '3px dashed var(--color-border)', background: 'var(--color-secondary)' }}>
            <Avatar profile={profile} size={44} />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
              style={{ background: 'var(--color-accent)' }}>
              <Plus size={12} strokeWidth={3} />
            </span>
          </span>
          <span className="text-[11px] font-bold theme-text truncate w-full text-center">Your story</span>
        </button>
        {groups.filter((g) => g.owner.id !== profile.id).map((g) => {
          const gi = groups.indexOf(g);
          return (
            <button key={g.owner.id} onClick={() => setViewer({ gi, si: 0 })}
              className="flex flex-col items-center gap-1 flex-shrink-0 w-16" title={`${g.owner.display_name || g.owner.username}'s story`}>
              <span className="w-14 h-14 rounded-full p-[3px]" style={{ background: 'var(--color-accent)' }}>
                <span className="block w-full h-full rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                  <Avatar profile={g.owner} size={48} />
                </span>
              </span>
              <span className="text-[11px] font-bold theme-text truncate w-full text-center">{g.owner.display_name || g.owner.username}</span>
            </button>
          );
        })}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void pickFile(e)} />
      {uploading && <p className="text-xs font-bold mt-2" style={{ color: 'var(--color-text-muted)' }}>Uploading your story… ♡</p>}
      {error && <p className="text-xs font-bold mt-2" style={{ color: '#FF6B6B' }}>{error}</p>}

      {/* Composer — preview + optional caption, then post. */}
      {pending && (
        <div className="mt-3 p-3 rounded-2xl space-y-3" style={{ background: 'var(--color-secondary)' }}>
          <div className="max-h-64 overflow-hidden rounded-xl flex items-center justify-center" style={{ background: '#231A16' }}>
            {pending.type === 'video' ? (
              <video src={pending.url} controls playsInline className="max-w-full max-h-64 rounded-xl" />
            ) : (
              <img src={pending.url} alt="Your story preview" className="max-w-full max-h-64 object-contain rounded-xl" />
            )}
          </div>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={120}
            placeholder="Add a caption… (optional)"
            className="w-full py-2.5 px-3 rounded-2xl text-sm font-bold"
            style={{ background: 'var(--color-surface)', border: '2px solid var(--color-border)', outline: 'none', color: 'var(--color-text)' }}
          />
          <div className="flex gap-2">
            <button onClick={() => void postStory()} disabled={posting}
              className="flex-1 py-2.5 rounded-2xl text-sm font-black text-white transition-all hover:scale-[1.01]"
              style={{ background: 'var(--color-accent)', opacity: posting ? 0.5 : 1 }}>
              {posting ? 'Posting…' : 'Post story ♡'}
            </button>
            <button onClick={() => setPending(null)}
              className="px-4 py-2.5 rounded-2xl text-sm font-bold theme-text"
              style={{ background: 'var(--color-surface)', border: '2px solid var(--color-border)' }}>
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-center font-semibold" style={{ color: 'var(--color-text-muted)' }}>Visible to your friends for 24 hours, then it disappears ♡</p>
        </div>
      )}

      {/* Full-screen viewer — solid dark panel, image/video + caption. */}
      {current && currentOwner && viewer && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#231A16' }}>
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
            <Avatar profile={currentOwner} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: '#FFF8F0' }}>{currentOwner.display_name || currentOwner.username}</p>
              <p className="text-xs" style={{ color: '#D8C4B8' }}>{timeAgo(current.created_at)} · {timeLeft(current.expires_at)}</p>
            </div>
            {isMine && (
              <button onClick={() => { setViewer(null); fileRef.current?.click(); }} className="p-2 rounded-xl" style={{ background: '#3A2E28' }} title="Add another to your story">
                <Plus size={18} style={{ color: '#FFF8F0' }} />
              </button>
            )}
            {isMine && (
              <button onClick={() => void deleteStory(current)} className="p-2 rounded-xl" style={{ background: '#3A2E28' }} title="Delete this story">
                <Trash2 size={18} style={{ color: '#FF9EBB' }} />
              </button>
            )}
            <button onClick={() => setViewer(null)} className="p-2 rounded-xl" style={{ background: '#3A2E28' }} title="Close">
              <X size={18} style={{ color: '#FFF8F0' }} />
            </button>
          </div>
          {/* Progress segments across this person's stories. */}
          <div className="flex gap-1 px-4 pb-2 flex-shrink-0">
            {groups[viewer.gi].stories.map((s, i) => (
              <button key={s.id} onClick={() => setViewer({ gi: viewer.gi, si: i })} className="h-1 flex-1 rounded-full"
                style={{ background: i === viewer.si ? '#FFF8F0' : i < viewer.si ? '#FF9EBB' : '#5A463C' }} title={`Story ${i + 1}`} />
            ))}
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-3 gap-2">
            <button onClick={() => step(-1)} className="p-2 rounded-full flex-shrink-0" style={{ background: '#3A2E28', color: '#FFF8F0' }} title="Previous">
              <ChevronLeft size={20} />
            </button>
            {current.media_type === 'video' ? (
              <video key={current.id} src={current.media_url} controls autoPlay playsInline className="max-w-full max-h-full rounded-2xl" style={{ background: '#000' }} />
            ) : (
              <img key={current.id} src={current.media_url} alt={current.caption || 'Story'} className="max-w-full max-h-full object-contain rounded-2xl" />
            )}
            <button onClick={() => step(1)} className="p-2 rounded-full flex-shrink-0" style={{ background: '#3A2E28', color: '#FFF8F0' }} title="Next">
              <ChevronRight size={20} />
            </button>
          </div>
          {current.caption && (
            <p className="px-6 pb-5 text-center text-sm font-bold flex-shrink-0" style={{ color: '#FFF8F0' }}>{current.caption}</p>
          )}
          <p className="px-6 pb-4 text-center text-xs flex-shrink-0" style={{ color: '#D8C4B8' }}>
            {viewer.si + 1} / {groups[viewer.gi].stories.length} · {currentOwner.display_name || currentOwner.username}
            {groups.length > 1 && ' · tap › for the next friend'}
          </p>
        </div>
      )}
    </div>
  );
}

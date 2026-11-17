# PALSY ♡ — Your Little Corner of Friendship

> A cute, cozy and private digital hangout for friends.

> 🌐 **Live demo:** https://palsy-app.vercel.app

## ✨ Features

- 🎨 Three themes (Soft Blue, Soft Pink, Autumn Dark) — user-selectable, persisted
- 🔐 Supabase Auth (email/password) — signup never uses your email as your username
- 👥 Friends system (search, add, remove) — display names are unique, one name one person
- 🔒 Private accounts (bio hidden from strangers, requests need approval)
- 🏠 Rooms (create, join by invite code, optional entry code, theme + picture changeable by any member)
- 💬 Real-time messaging (private DMs + room chat, media + voice, read ticks, typing indicators, online / last-seen / in-chat presence, chats always open at your newest messages)
- 🖼️ Chat wallpapers (10 presets + your own photo) and per-chat themes
- 🔐 Optional chat locker — lock any DM or room behind a code, with private notifications
- 😊 Full emoji picker (1,923 emojis) + 16 quick reactions in DMs and rooms
- ↩️ Reply, pin and star messages; export / clear chat; select + bulk delete
- 🎮 8 multiplayer games, in rooms and in DMs: Tic Tac Toe, Rock Paper Scissors, Number Guess, Hangman, Draw & Guess, Trivia Duel (72-question bank), Dots & Boxes, Crazy Eights — with game sounds (mute is saved per person, in Settings or in any game)
- 🔔 Notification bell + pop-ups (mute per room)
- 📱 Fully responsive (mobile + desktop) and installable as an app (PWA)
- 🌐 Ready for Vercel deployment

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/zainab-rehmann/PALSY.git
cd PALSY
npm install
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to your project → SQL Editor
3. Run the migrations in order: `supabase/migrations/001_initial.sql`, then `002`–`022`
4. Set up a Storage bucket named `media` (public)

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## 🌐 Deploy to Vercel

1. Push to GitHub
2. Import repo in [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

---

## ✅ CI/CD

- **CI (GitHub Actions):** every push to `master` and every pull request runs the `CI` workflow (`.github/workflows/ci.yml`): clean install with `npm ci`, a TypeScript typecheck, a lint report, and a full production build (`npm run build`). A red ❌ on a commit means the build is broken — fix it before relying on the deploy.
- **CD (Vercel):** pushing to `master` auto-deploys through Vercel's GitHub integration — no manual deploy step. Live app: https://palsy-app.vercel.app (backup: https://palsy-7cqz.vercel.app).
- No secrets or tokens are used by CI. Branch protection / required checks are not enabled — merging stays open unless the owner decides otherwise.

---

## 🗄️ Database

Run the migrations in `supabase/migrations/` in order in your Supabase SQL Editor (001, then 002–022). The full consolidated schema is also kept at `supabase/palsy-supabase-schema-2026-11-10.sql` for reference.

Tables: `profiles`, `friend_requests`, `friendships`, `rooms`, `room_members`, `messages`, `message_reactions`, `notifications`, `games`, `game_players`, `message_receipts`, `room_entry_codes`, `locker_codes`, `locked_chats`

All tables have Row Level Security (RLS) enabled.

---

## 🎨 Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Realtime, Storage)
- **Icons**: Lucide React
- **Fonts**: Nunito (Google Fonts)
- **Deployment**: Vercel

---

Made with ♡ — A tiny happy place on the internet, made just for our friends.

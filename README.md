# PALSY ♡ — Your Little Corner of Friendship

> A cute, cozy and private digital hangout for friends.

> 🌐 **Live demo:** https://palsy-app.vercel.app

## ✨ Features

- 🎨 Blue & Pink themes (user-selectable, persisted)
- 🔐 Supabase Auth (email/password)
- 👥 Friends system (search, add, remove)
- 🏠 Rooms (create, join by invite code, customize with presets)
- 💬 Real-time messaging (private DMs + room chat)
- 😊 Emoji reactions on messages
- 🎮 4 multiplayer games: Tic Tac Toe, Rock Paper Scissors, Number Guess, Hangman
- 📱 Fully responsive (mobile + desktop)
- 🔔 Notifications
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
3. Run the migrations in order: `supabase/migrations/001_initial.sql`, then `002`–`005` and `007`–`012`
4. Set up Storage bucket named `avatars` (public)
5. Set up Storage bucket named `media` (authenticated)

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

Run the migrations in `supabase/migrations/` in order in your Supabase SQL Editor (001, then 002–005 and 007–012). The full consolidated schema is also kept at `supabase/palsy-supabase-schema-2026-11-10.sql` for reference.

Tables: `profiles`, `friend_requests`, `friendships`, `rooms`, `room_members`, `messages`, `message_reactions`, `notifications`, `games`, `game_players`

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

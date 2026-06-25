# MTG Pod Play

A real-time multiplayer **Magic: The Gathering Commander** game tracker. Set up a game, invite players via code or link, roll for turn order, and track life, commander damage, and poison counters live across all connected clients.

## Features

- 🔥 **Real-time multiplayer** — Powered by Firebase Firestore
- 🎲 **Dice roll turn order** — D20 roll, auto-sorted highest→lowest (alphabetical tiebreak)
- ⚔️ **Full Commander tracking** — Life totals, commander damage matrix, poison counters (scales to 7 players)
- 🃏 **Card data via Scryfall** — Commander search, decklist rendering (no API key required)
- 👤 **User profiles & history** — Email/password auth, match history & placements
- 📺 **OBS overlay ready** — Reserved `/overlay/:sessionId` route for browser sources (fast-follow UI)

## Tech Stack

- **Frontend:** React 18 + Vite + TypeScript
- **Backend/BaaS:** Firebase (Auth + Firestore)
- **Card Data:** [Scryfall API](https://scryfall.com/docs/api)
- **Hosting:** Vercel (production) / local dev server

## Prerequisites

- Node.js 18+ (built & tested on Node 24)
- A Firebase project (see setup below)
- A GitHub account (for Vercel deployment)

## Quick Start (Local Dev)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create/select your project.
2. **Authentication:** Build → Authentication → Get started → Sign-in method → enable **Email/Password**.
3. **Firestore:** Build → Firestore Database → Create database → **Production mode** → choose a region.
4. **Web App:** Project Settings → General → Your apps → add a **Web app** (`</>`). Copy the `firebaseConfig` values.
5. Copy the env template and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Firebase config:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_APP_BASE_URL=http://localhost:5173
```

6. **Authorized domains:** Authentication → Settings → Authorized domains → add `localhost`.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deployment (Vercel + Custom Domain)

### Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New Project** → import the repo.
3. Framework preset: **Vite** (auto-detected).
4. **Environment Variables:** Add all `VITE_FIREBASE_*` and `VITE_APP_BASE_URL` keys (use `https://mtg.jasongreen.biz` for base URL).
5. Deploy → copy the production URL.
6. Add the Vercel domain to Firebase **Authorized domains**.

### Custom Domain (Cloudflare → Vercel)

1. Cloudflare dashboard → your domain → **DNS** → **Records**.
2. Add a **CNAME** record:
   - **Name:** `mtg`
   - **Target:** `cname.vercel-dns.com`
   - **Proxy status:** DNS only (grey cloud)
3. In Vercel: **Settings → Domains** → add `mtg.jasongreen.biz`.
4. Once SSL is verified, update `VITE_APP_BASE_URL` to `https://mtg.jasongreen.biz` and redeploy.

## Firestore Security Rules

Rules are defined in [`firestore.rules`](./firestore.rules). To deploy them:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

## Project Structure

```
src/
├── config/          # Firebase + app configuration
├── context/         # React context providers (Auth)
├── hooks/           # Custom React hooks
├── lib/             # Core libraries (Scryfall client, helpers)
├── types/           # TypeScript type definitions
├── services/        # Firestore data layer
├── components/      # Reusable UI components
├── pages/           # Route-level page components
├── App.tsx          # App shell + routing
└── main.tsx         # Entry point
```

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start local dev server (port 5173) |
| `npm run build`   | Type-check + production build    |
| `npm run preview` | Preview the production build     |
# MTG Pod Play

An interactive web app for Magic: The Gathering Commander games. Set up games, invite your pod, track life/commander damage/poison, and broadcast to OBS.

## Features

- **Game Setup** — Host creates a lobby, players join via code or link
- **Scryfall Integration** — Search commanders, import decklists (Archidekt, raw text)
- **Dice Roll Turn Order** — D20 rolls determine turn order (highest first, ties alphabetical)
- **Up to 7 Players** — Track health, commander damage, poison counters
- **User Profiles** — Match history, deck tracking, win stats
- **OBS Overlay** — Public overlay URL for OBS browser source

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Custom CSS with CSS variables
- **Animations:** Framer Motion
- **Backend:** Firebase (Firestore real-time, Auth)
- **Card Data:** Scryfall API
- **Hosting:** Vercel + Cloudflare DNS

## Getting Started

```bash
npm install
cp .env.example .env.local  # Fill in Firebase config
npm run dev
```

## Deployment

- **Firestore Rules:** `npm run deploy:rules`
- **Full deploy:** `npm run deploy` (builds + deploys to Firebase)

## Environment Variables

See `.env.example` for required Firebase config values.
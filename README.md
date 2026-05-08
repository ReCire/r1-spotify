# Spotify for Rabbit R1

A native Spotify player for the Rabbit R1, featuring playlist browsing, search, and full playback control via the Spotify Web Playback SDK.

## Features

- **Spotify Authentication** — OAuth 2.0 PKCE flow, no server required
- **Library Browsing** — View and play your playlists
- **Search** — Find tracks and playlists directly on R1
- **Now Playing** — Album art, progress bar, play/pause/skip controls
- **Progressive Disclosure** — Vertical scroll through lists, drill into playlists, now playing expands
- **R1 Hardware Integration**
  - Scroll wheel: Volume on Now Playing, navigate lists elsewhere
  - Side button: Select item / play-pause
  - Touch: Tap items, swipe right to go back, swipe left for search
- **Mini Player** — Persistent playback bar across all views
- **Spotify Branding** — Native look with Spotify green, dark palette, optimized for 240×282px

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add your deployed URL + `/callback.html` as a Redirect URI (e.g. `https://your-app.vercel.app/callback.html`)
4. Select **Web API** and **Web Playback SDK**
5. Copy your **Client ID**

### 2. Configure

Edit `apps/src/main.js` and set your Client ID:

```js
const CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  ...
};
```

### 3. Development

```bash
cd apps
npm install
npm run dev
```

Open http://localhost:5173 to test in your browser.

For local dev, add `http://localhost:5173/callback.html` as a Redirect URI in your Spotify app settings.

### Keyboard Controls (Dev Mode)

- `Space` — Side button (select/play-pause)
- `Arrow Up/Down` — Scroll through lists / adjust volume
- `Escape` — Go back

## Building

```bash
cd apps
npm run build
```

Output in `dist/`.

## Deployment

### Deploy to Vercel

```bash
cd apps
npx vercel login
npx vercel deploy --prod
```

### Deploy to Netlify

```bash
cd apps
npm run build
npx netlify-cli deploy --prod --dir=dist
```

After deploying, update your Spotify app's Redirect URI to match (e.g. `https://your-app.vercel.app/callback.html`).

### QR Code Installation

Update `qr.html` with your deployed URL, then scan with your R1's camera to install as a creation.

## Architecture

- **Auth**: OAuth 2.0 PKCE (client-side, no backend needed)
- **Playback**: Spotify Web Playback SDK (requires Premium)
- **API**: Spotify Web API for library, search, playback control
- **Storage**: R1 `creationStorage` API with localStorage fallback

## Requirements

- Spotify Premium account (required for Web Playback SDK)
- Rabbit R1 with Creations SDK support

## Tech Stack

- Vanilla JavaScript (ES modules)
- Vite for build tooling
- Spotify Web Playback SDK for audio
- Spotify Web API for data
- CSS Flexbox for layout
- R1 Creations SDK for hardware events

## License

MIT

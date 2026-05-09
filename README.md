# Spotify for Rabbit R1

A native Spotify player for the Rabbit R1, featuring playlist browsing, search, and full playback control via the Spotify Web Playback SDK.

## The November 2024 Spotify API Restrictions

In November 2024, Spotify significantly tightened API access for non-Enterprise developers by locking down several key endpoints:

- `/artists/{id}/related-artists` — Returns 403 Forbidden
- `/artists/{id}/albums` — Returns 403 Forbidden  
- `/artists/{id}/top-tracks` — Returns 403 Forbidden
- `/me/following` and `/me/following/contains` — Returns 403 Forbidden

These restrictions apply to developers without Extended Quota Mode (Enterprise tier). This is likely why the native Rabbit R1 Spotify app broke, as it relied on these now-restricted endpoints.

## App Limitations

Due to these API restrictions, this app uses a clever backdoor approach:

- **Artist Catalog**: Uses the `/search` endpoint to fetch artist tracks and albums, bypassing the locked-down `/albums` and `/top-tracks` endpoints
- **No Follow Button**: The `/me/following` endpoints are restricted, so the Follow feature is not available
- **No Monthly Listeners**: Some artist metadata may be limited due to endpoint restrictions

The search backdoor works reliably for most artists, but may occasionally return fewer results for artists with very common names or complex collaborations.

## Features

- **Spotify Authentication** — OAuth 2.0 PKCE flow, no server required
- **Library Browsing** — View and play your playlists
- **Search** — Find tracks, albums, artists, and playlists
- **Now Playing** — Album art, progress bar, play/pause/skip controls
- **Artist View** — Full-screen hero with artist info, top tracks, albums, and singles
- **Progressive Disclosure** — Vertical scroll through lists, drill into playlists, now playing expands
- **R1 Hardware Integration**
  - Scroll wheel: Volume on Now Playing, navigate lists elsewhere
  - Side button: Select item / play-pause
  - Touch: Tap items, swipe right to go back, swipe left for search
- **Mini Player** — Persistent playback bar across all views
- **Spotify Branding** — Native look with Spotify green, dark palette, optimized for 240×282px

## Setup

### 1. Create a Spotify Developer Account

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account (Premium required)
3. Click "Create App"
4. Name your app (e.g., "Spotify for R1")
5. Copy your **Client ID**

### 2. Configure Redirect URIs

In your Spotify Developer Dashboard:

1. Open your app settings
2. Go to "Redirect URIs"
3. Add your deployed URL + `/callback.html` (e.g., `https://your-app.vercel.app/callback.html`)
4. For local development, also add `http://localhost:5173/callback.html`

### 3. Configure the App

Edit `apps/src/state.js` and set your Client ID:

```javascript
export const CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE',
  redirectUri: `${window.location.origin}/callback.html`,
  ...
};
```

### 4. Deploy the App

#### Deploy to Vercel

```bash
cd apps
npm install
npm run build
npx vercel login
npx vercel deploy --prod
```

#### Deploy to Netlify

```bash
cd apps
npm install
npm run build
npx netlify-cli deploy --prod --dir=dist
```

### 5. Update URLs After Deployment

After deploying, update the following files with your deployed URL:

**In `apps/public/qr.html`:**
```javascript
const creationData = {
  title: "Spotify",
  url: "https://your-app.vercel.app", // Your deployed URL
  iconUrl: "https://your-app.vercel.app/icon.svg",
  themeColor: "#1DB954"
};
```

**In `apps/src/state.js`:**
```javascript
redirectUri: `${window.location.origin}/callback.html`, // Will use deployed URL automatically
```

### 6. Install on Rabbit R1

1. Open `https://your-app.vercel.app/qr.html` in your browser
2. Point your R1's camera at the QR code
3. It will register as a creation in your R1's creations list
4. Launch it from your R1's home screen

## Development

### Local Development

```bash
cd apps
npm install
npm run dev
```

Open http://localhost:5173 to test in your browser.

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

## Architecture

- **Auth**: OAuth 2.0 PKCE (client-side, no backend needed)
- **Playback**: Spotify Web Playback SDK (requires Premium)
- **API**: Spotify Web API for library, search, playback control
- **State Management**: Centralized state object in `state.js`
- **Modular Design**: Split into `state.js`, `auth.js`, `api.js`, `ui.js`, `main.js`

## Requirements

- Spotify Premium account (required for Web Playback SDK)
- Rabbit R1 with Creations SDK support
- Node.js 18+ (for development)

## Tech Stack

- Vanilla JavaScript (ES modules)
- Vite for build tooling
- Spotify Web Playback SDK for audio
- Spotify Web API for data
- CSS Flexbox for layout
- R1 Creations SDK for hardware events

## License

MIT

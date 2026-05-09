// Spotify R1 Player
// ============ Configuration ============

const CONFIG = {
  clientId: '8ef09899795a4fdab465bfa82c97c534',
  redirectUri: `${window.location.origin}/callback.html`,
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-library-read',
    'user-follow-read',
    'user-follow-modify',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative'
  ].join(' ')
};

// ============ State ============

let accessToken = null;
let tokenExpiry = 0;
let player = null;
let deviceId = null;
let currentView = 'login';
let isPlaying = false;
let currentTrack = null;
let progressMs = 0;
let durationMs = 0;
let volume = 0.7;
let playlists = [];
let playlistTracks = [];
let searchResults = [];
let scrollIndex = 0;
let selectedPlaylist = null;
let progressInterval = null;
let viewStack = [];
let homeSections = [];
let homeFilter = 'all';
let sectionFilter = 'all';
let discographyFilter = 'all';
let artistData = null;
let artistDiscography = null;
let albumTracks = [];
let selectedAlbum = null;
let onboardingShown = false;

// ============ Storage (R1 creationStorage or localStorage) ============

async function saveToken(token, expiry, refresh) {
  const data = JSON.stringify({ token, expiry, refresh });
  if (window.creationStorage) {
    try { await window.creationStorage.plain.setItem('spotify_auth', btoa(data)); } catch (e) {}
  } else {
    localStorage.setItem('spotify_auth', data);
  }
}

async function loadToken() {
  let raw;
  if (window.creationStorage) {
    try {
      const stored = await window.creationStorage.plain.getItem('spotify_auth');
      if (stored) raw = atob(stored);
    } catch (e) {}
  } else {
    raw = localStorage.getItem('spotify_auth');
  }
  if (raw) {
    try {
      const { token, expiry, refresh } = JSON.parse(raw);
      return { token, expiry, refresh };
    } catch (e) {}
  }
  return null;
}

async function clearToken() {
  if (window.creationStorage) {
    try { await window.creationStorage.plain.removeItem('spotify_auth'); } catch (e) {}
  } else {
    localStorage.removeItem('spotify_auth');
  }
}

async function saveVolume(vol) {
  if (window.creationStorage) {
    try { await window.creationStorage.plain.setItem('spotify_vol', btoa(JSON.stringify(vol))); } catch (e) {}
  } else {
    localStorage.setItem('spotify_vol', JSON.stringify(vol));
  }
}

async function loadVolume() {
  if (window.creationStorage) {
    try {
      const s = await window.creationStorage.plain.getItem('spotify_vol');
      if (s) return JSON.parse(atob(s));
    } catch (e) {}
  } else {
    const s = localStorage.getItem('spotify_vol');
    if (s) return JSON.parse(s);
  }
  return 0.7;
}

// ============ OAuth 2.0 PKCE ============

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function startAuth() {
  if (!CONFIG.clientId) {
    showToast('Set Client ID in config', 'error');
    return;
  }

  const codeVerifier = generateRandomString(64);
  sessionStorage.setItem('code_verifier', codeVerifier);

  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  const state = generateRandomString(16);
  sessionStorage.setItem('auth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    scope: CONFIG.scopes,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: CONFIG.redirectUri,
    state: state
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code) return false;

  const storedState = sessionStorage.getItem('auth_state');
  if (state !== storedState) {
    showToast('Auth state mismatch', 'error');
    return false;
  }

  const codeVerifier = sessionStorage.getItem('code_verifier');

  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: CONFIG.redirectUri,
    code_verifier: codeVerifier
  });

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    if (!res.ok) throw new Error('Token exchange failed');
    const data = await res.json();

    accessToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000;
    await saveToken(accessToken, tokenExpiry, data.refresh_token || '');

    window.history.replaceState({}, document.title, window.location.pathname);
    sessionStorage.removeItem('code_verifier');
    sessionStorage.removeItem('auth_state');
    return true;
  } catch (e) {
    showToast('Login failed', 'error');
    return false;
  }
}

async function refreshToken() {
  const stored = await loadToken();
  if (!stored || !stored.refresh) return false;

  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    grant_type: 'refresh_token',
    refresh_token: stored.refresh
  });

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000;
    await saveToken(accessToken, tokenExpiry, data.refresh_token || stored.refresh);
    return true;
  } catch (e) {
    return false;
  }
}

// ============ Spotify API Helpers ============

async function api(endpoint, options = {}) {
  if (Date.now() >= tokenExpiry - 60000) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      currentView = 'login';
      render();
      return null;
    }
  }

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) return api(endpoint, options);
    currentView = 'login';
    render();
    return null;
  }

  if (res.status === 204) return {};
  if (!res.ok) return null;
  return res.json();
}

// ============ Spotify Web Playback SDK ============

// Define callback globally before SDK loads
window.onSpotifyWebPlaybackSDKReady = () => {
  if (accessToken && !player) {
    createPlayer();
  }
};

function initPlayer() {
  if (window.Spotify && accessToken && !player) {
    createPlayer();
  }
}

function createPlayer() {
  if (player) return;

  player = new Spotify.Player({
    name: 'Rabbit R1',
    getOAuthToken: async (cb) => {
      if (Date.now() >= tokenExpiry - 60000) await refreshToken();
      cb(accessToken);
    },
    volume: volume
  });

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    transferPlayback(device_id);
  });

  player.addListener('not_ready', () => {
    deviceId = null;
  });

  player.addListener('player_state_changed', (state) => {
    if (!state) {
      isPlaying = false;
      currentTrack = null;
      render();
      return;
    }

    isPlaying = !state.paused;
    progressMs = state.position;
    durationMs = state.duration;

    const track = state.track_window.current_track;
    if (track) {
      currentTrack = {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        artwork: track.album.images[0]?.url || '',
        uri: track.uri
      };
    }

    updateNowPlaying();
    startProgressTimer();
  });

  player.addListener('initialization_error', ({ message }) => {
    showToast('Player init error', 'error');
  });

  player.addListener('authentication_error', ({ message }) => {
    showToast('Auth expired', 'error');
    currentView = 'login';
    render();
  });

  player.connect();
}

async function transferPlayback(devId) {
  await api('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [devId], play: false })
  });
}

// ============ Playback Controls ============

async function togglePlayback() {
  if (!deviceId) {
    showToast('No player connected', 'error');
    return;
  }
  if (isPlaying) {
    await api('/me/player/pause', { method: 'PUT' });
  } else {
    await api('/me/player/play', { method: 'PUT' });
  }
}

async function nextTrack() {
  await api('/me/player/next', { method: 'POST' });
}

async function prevTrack() {
  await api('/me/player/previous', { method: 'POST' });
}

async function playContext(contextUri, offset = 0) {
  if (!deviceId) {
    showToast('Connecting…', 'info');
    return;
  }
  await api(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({
      context_uri: contextUri,
      offset: { position: offset },
      position_ms: 0
    })
  });
}

async function playTrackInContext(contextUri, trackUri) {
  if (!deviceId) {
    showToast('Connecting…', 'info');
    return;
  }
  const body = {};
  if (contextUri && !contextUri.startsWith('spotify:track:')) {
    body.context_uri = contextUri;
    body.offset = { uri: trackUri };
  } else {
    body.uris = [trackUri];
  }
  body.position_ms = 0;
  await api(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

async function adjustVolume(delta) {
  volume = Math.max(0, Math.min(1, volume + delta));
  if (player) player.setVolume(volume);
  saveVolume(volume);
  showVolumeToast();
}

// ============ Data Fetching ============

async function fetchPlaylists() {
  const data = await api('/me/playlists?limit=50');
  if (data && data.items) {
    playlists = data.items.map(p => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url || '',
      uri: p.uri,
      trackCount: p.tracks?.total || 0,
      owner: p.owner?.display_name || ''
    }));
  }
}

async function fetchPlaylistTracks(playlistId) {
  try {
    if (Date.now() >= tokenExpiry - 60000) {
      await refreshToken();
    }
    console.log('Fetching playlist tracks for:', playlistId, 'Token:', accessToken ? 'exists' : 'missing');
    const data = await api(`/playlists/${playlistId}/tracks?limit=100`);
    console.log('Playlist data:', data);
    if (data && data.items) {
      playlistTracks = data.items
        .filter(item => item.track && item.track.uri)
        .map(item => ({
          name: item.track.name,
          artist: item.track.artists?.map(a => a.name).join(', ') || '',
          album: item.track.album?.name || '',
          artwork: item.track.album?.images?.[0]?.url || '',
          uri: item.track.uri,
          durationMs: item.track.duration_ms
        }));
    } else {
      playlistTracks = [];
    }
  } catch (err) {
    console.error('Fetch playlist tracks error:', err);
    showToast('Unable to load playlist. It may be private.', 'error');
    playlistTracks = [];
  }
}

async function fetchHomeSections() {
  try {
    const [recentData, topTracksShort, topTracksLong, topArtistsData, savedAlbums, showsData, audiobooksData] = await Promise.all([
      api('/me/player/recently-played?limit=6'),
      api('/me/top/tracks?time_range=short_term&limit=6'),
      api('/me/top/tracks?time_range=long_term&limit=6'),
      api('/me/top/artists?time_range=medium_term&limit=6'),
      api('/me/albums?limit=6'),
      api('/me/shows?limit=6'),
      api('/me/audiobooks?limit=6')
    ]);

    homeSections = [];

    if (recentData?.items?.length) {
      const img = recentData.items[0]?.track?.album?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Recents', 
        image: img,
        categoryType: 'recents',
        contentType: 'music'
      });
    }

    if (topTracksShort?.items?.length) {
      const img = topTracksShort.items[0]?.album?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Jump Back In', 
        image: img,
        categoryType: 'jump-back-in',
        contentType: 'music'
      });
    }

    if (topArtistsData?.items?.length) {
      const img = topArtistsData.items[0]?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Your Top Artists', 
        image: img,
        categoryType: 'top-artists',
        contentType: 'music'
      });
    }

    if (topTracksLong?.items?.length) {
      const img = topTracksLong.items[0]?.album?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'All-Time Favourites', 
        image: img,
        categoryType: 'all-time-favourites',
        contentType: 'music'
      });
    }

    if (savedAlbums?.items?.length) {
      const img = savedAlbums.items[0]?.album?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Saved Albums', 
        image: img,
        categoryType: 'saved-albums',
        contentType: 'music'
      });
    }

    if (showsData?.items?.length) {
      const img = showsData.items[0]?.show?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Your Podcasts', 
        image: img,
        categoryType: 'podcasts',
        contentType: 'podcasts'
      });
    }

    if (audiobooksData?.items?.length) {
      const img = audiobooksData.items[0]?.images?.[0]?.url || '';
      homeSections.push({ 
        title: 'Your Audiobooks', 
        image: img,
        categoryType: 'audiobooks',
        contentType: 'audiobooks'
      });
    }

    if (playlists.length) {
      const madeForYou = playlists.filter(p => 
        p.owner === 'Spotify' || 
        p.name.toLowerCase().includes('daily mix') ||
        p.name.toLowerCase().includes('discover') ||
        p.name.toLowerCase().includes('release radar') ||
        p.name.toLowerCase().includes('repeat') ||
        p.name.toLowerCase().includes('on repeat') ||
        p.name.toLowerCase().includes('time capsule')
      );
      if (madeForYou.length) {
        homeSections.push({
          title: 'Made For You',
          image: madeForYou[0]?.image || '',
          categoryType: 'made-for-you',
          contentType: 'music'
        });
      }

      const dailyMixes = playlists.filter(p => 
        p.name.toLowerCase().includes('daily mix')
      );
      if (dailyMixes.length) {
        homeSections.push({
          title: 'Daily Mixes',
          image: dailyMixes[0]?.image || '',
          categoryType: 'daily-mixes',
          contentType: 'music'
        });
      }

      homeSections.push({ 
        title: 'Your Library', 
        image: playlists[0]?.image || '',
        categoryType: 'library',
        contentType: 'music'
      });
    }
  } catch (err) {
    console.error('Home sections error:', err);
    homeSections = [];
  }
}

async function fetchArtist(artistId) {
  const [artist, topTracks, albumsData, related] = await Promise.all([
    api(`/artists/${artistId}`),
    api(`/artists/${artistId}/top-tracks?market=from_token`),
    api(`/artists/${artistId}/albums?limit=50`),
    api(`/artists/${artistId}/related-artists`).catch(() => null)
  ]);

  if (!artist) return null;

  artistData = {
    id: artist.id,
    name: artist.name,
    image: artist.images?.[0]?.url || '',
    followers: artist.followers?.total || 0,
    genres: artist.genres || [],
    popularity: artist.popularity || 0,
    uri: artist.uri,
    topTracks: (topTracks?.tracks || []).slice(0, 5).map(t => ({
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || '',
      artwork: t.album?.images?.[0]?.url || '',
      uri: t.uri,
      contextUri: t.album?.uri || '',
      durationMs: t.duration_ms
    })),
    albums: (albumsData?.items || []).filter(a => a.album_type === 'album').slice(0, 20).map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri,
      year: a.release_date?.substring(0, 4) || '', type: 'album'
    })),
    singles: (albumsData?.items || []).filter(a => a.album_type === 'single').slice(0, 20).map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri,
      year: a.release_date?.substring(0, 4) || '', type: 'single'
    })),
    appearsOn: (albumsData?.items || []).filter(a => a.album_group === 'appears_on').slice(0, 20).map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri,
      year: a.release_date?.substring(0, 4) || '', type: 'appears_on'
    })),
    related: (related?.artists || []).slice(0, 10).map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri,
      followers: a.followers?.total || 0
    }))
  };
  return artistData;
}

async function fetchAlbumTracks(albumId) {
  const data = await api(`/albums/${albumId}`);
  if (data) {
    selectedAlbum = {
      id: data.id,
      name: data.name,
      image: data.images?.[0]?.url || '',
      artist: data.artists?.map(a => a.name).join(', ') || '',
      uri: data.uri,
      year: data.release_date?.substring(0, 4) || ''
    };
    albumTracks = (data.tracks?.items || []).map(t => ({
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || '',
      uri: t.uri,
      durationMs: t.duration_ms,
      artwork: data.images?.[0]?.url || ''
    }));
  }
}

async function searchSpotify(query) {
  if (!query.trim()) { searchResults = []; return; }
  const data = await api(`/search?q=${encodeURIComponent(query)}&type=artist,album,track,playlist&limit=5`);
  if (!data) return;

  searchResults = [];
  if (data.artists?.items) {
    data.artists.items.forEach(a => {
      searchResults.push({
        type: 'Artist', name: a.name, subtitle: '',
        artwork: a.images?.[0]?.url || '', id: a.id, uri: a.uri
      });
    });
  }
  if (data.albums?.items) {
    data.albums.items.forEach(a => {
      searchResults.push({
        type: 'Album', name: a.name, subtitle: a.artists?.[0]?.name || '',
        artwork: a.images?.[0]?.url || '', id: a.id, uri: a.uri
      });
    });
  }
  if (data.tracks?.items) {
    data.tracks.items.forEach(t => {
      searchResults.push({
        type: 'Song', name: t.name,
        subtitle: t.artists?.map(a => a.name).join(', ') || '',
        artwork: t.album?.images?.[0]?.url || '',
        uri: t.uri, contextUri: t.album?.uri || ''
      });
    });
  }
  if (data.playlists?.items) {
    data.playlists.items.filter(Boolean).forEach(p => {
      searchResults.push({
        type: 'Playlist', name: p.name, subtitle: p.owner?.display_name || '',
        artwork: p.images?.[0]?.url || '', uri: p.uri, id: p.id
      });
    });
  }
}

function formatFollowers(n) {
  if (!n || n === 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return n.toString();
}

// ============ Progress Timer ============

function startProgressTimer() {
  stopProgressTimer();
  if (!isPlaying) return;
  progressInterval = setInterval(() => {
    if (isPlaying) {
      progressMs += 500;
      if (progressMs > durationMs) progressMs = durationMs;
      updateProgressBar();
    }
  }, 500);
}

function stopProgressTimer() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

function updateProgressBar() {
  const bar = document.querySelector('.progress-fill');
  if (bar && durationMs > 0) {
    bar.style.width = `${(progressMs / durationMs) * 100}%`;
  }
  const timeEl = document.querySelector('.track-time');
  if (timeEl) {
    timeEl.textContent = `${formatTime(progressMs)} / ${formatTime(durationMs)}`;
  }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ============ Main Render ============

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  switch (currentView) {
    case 'login': renderLogin(app); break;
    case 'home': renderHome(app); break;
    case 'section': renderSection(app); break;
    case 'playlist': renderPlaylist(app); break;
    case 'album': renderAlbum(app); break;
    case 'nowplaying': renderNowPlaying(app); break;
    case 'search': renderSearch(app); break;
    case 'artist': renderArtist(app); break;
    case 'discography': renderDiscography(app); break;
  }
}

// ============ Login View ============

function renderLogin(app) {
  app.innerHTML = `
    <div class="view-login">
      <div class="login-logo">${spotifyLogo()}</div>
      <div class="login-title">Spotify</div>
      <div class="login-subtitle">Connect your account to play music on your R1</div>
      <button class="login-btn" id="login-btn">Log in with Spotify</button>
      <div class="login-hint">Requires Spotify Premium</div>
    </div>
  `;
  document.getElementById('login-btn').addEventListener('click', startAuth);
}

// ============ Onboarding Overlay ============

function showOnboarding() {
  if (onboardingShown) return;
  onboardingShown = true;
  try { localStorage.setItem('spotify_onboarded', '1'); } catch (e) {}

  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboard-content">
      <div class="onboard-title">Controls</div>
      <div class="onboard-row"><span class="onboard-icon">${swipeRightIcon()}</span><span>Swipe right — go back</span></div>
      <div class="onboard-row"><span class="onboard-icon">${swipeLeftIcon()}</span><span>Swipe left — search</span></div>
      <div class="onboard-row"><span class="onboard-icon">${scrollIcon()}</span><span>Scroll — browse / volume</span></div>
      <div class="onboard-row"><span class="onboard-icon">${tapIcon()}</span><span>Tap — select</span></div>
      <div class="onboard-dismiss">Tap anywhere to start</div>
    </div>
  `;
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('app').appendChild(overlay);
  setTimeout(() => overlay.remove(), 6000);
}

// ============ Home View (Category Cards - full width stacked) ============

function renderHome(app) {
  const header = createHeader('Home', true);
  app.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  filterBar.innerHTML = `
    <button class="filter-btn ${homeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
    <button class="filter-btn ${homeFilter === 'music' ? 'active' : ''}" data-filter="music">Music</button>
    <button class="filter-btn ${homeFilter === 'podcasts' ? 'active' : ''}" data-filter="podcasts">Podcasts</button>
    <button class="filter-btn ${homeFilter === 'audiobooks' ? 'active' : ''}" data-filter="audiobooks">Audiobooks</button>
  `;
  filterBar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      homeFilter = btn.dataset.filter;
      render();
    });
  });
  app.appendChild(filterBar);

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  const filteredSections = homeFilter === 'all' 
    ? homeSections 
    : homeSections.filter(s => s.contentType === homeFilter);

  if (filteredSections.length === 0) {
    container.innerHTML = `<div class="empty-state">No content</div>`;
  } else {
    filteredSections.forEach((section, i) => {
      const card = document.createElement('div');
      card.className = `cat-card ${i === scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i;
      card.style.backgroundImage = `url('${section.image}')`;
      card.innerHTML = `
        <div class="cat-card-overlay"></div>
        <div class="cat-card-content">
          <span class="cat-card-title">${section.title}</span>
          ${chevronRight()}
        </div>
      `;
      card.addEventListener('click', () => openSection(section));
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Section View (Content Cards - items within a category) ============

let currentSection = null;

function renderSection(app) {
  if (!currentSection) { goBack(); return; }

  const header = createHeader(currentSection.title, true);
  app.appendChild(header);

  if (currentSection.hasFilters && currentSection.filterOptions) {
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    currentSection.filterOptions.forEach(f => {
      const btn = document.createElement('button');
      btn.className = `filter-btn ${sectionFilter === f ? 'active' : ''}`;
      btn.textContent = capitalize(f);
      btn.addEventListener('click', () => {
        sectionFilter = f;
        scrollIndex = 0;
        render();
      });
      filterBar.appendChild(btn);
    });
    app.appendChild(filterBar);
  }

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  let items = currentSection.items;
  if (currentSection.hasFilters && sectionFilter !== 'all') {
    items = items.filter(item => item.filterType === sectionFilter);
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading…</div>`;
  } else {
    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i;
      card.style.backgroundImage = `url('${item.image}')`;
      
      let typeLabel = capitalize(item.type);
      let sublabel = '';
      if (item.type === 'artist') {
        sublabel = '';
      } else if (item.artist) {
        sublabel = `<span>${typeLabel}</span><span class="dot">·</span><span>${truncate(item.artist, 20)}</span>`;
      } else {
        sublabel = `<span>${typeLabel}</span>`;
      }
      
      card.innerHTML = `
        <div class="content-card-overlay"></div>
        <div class="content-card-content">
          <div class="content-card-labels">
            <div class="content-card-name">${truncate(item.name, 26)}</div>
            ${sublabel ? `<div class="content-card-sub">${sublabel}</div>` : ''}
          </div>
          ${chevronRight()}
        </div>
      `;
      card.addEventListener('click', () => handleContentCardClick(item));
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

function handleContentCardClick(item) {
  if (item.type === 'playlist') {
    openPlaylistById(item.id, item.name, item.uri);
  } else if (item.type === 'artist') {
    openArtist(item.id);
  } else if (item.type === 'album') {
    openAlbum(item.id);
  } else if (item.type === 'track') {
    playTrackInContext(item.contextUri || item.uri, item.uri);
    navigate('nowplaying');
  }
}

async function openSection(section) {
  currentSection = { 
    title: section.title, 
    items: [], 
    categoryType: section.categoryType,
    categoryId: section.categoryId
  };
  navigate('section');
  await fetchSectionItems(section.categoryType);
  if (currentView === 'section') render();
}

async function fetchSectionItems(categoryType) {
  try {
    let data;
    switch (categoryType) {
      case 'recents':
        data = await api('/me/player/recently-played?limit=20');
        if (data?.items) {
          const seen = new Set();
          currentSection.items = data.items.filter(i => {
            if (!i.track?.uri || seen.has(i.track.uri)) return false;
            seen.add(i.track.uri);
            return true;
          }).map(i => ({
            name: i.track.name,
            artist: i.track.artists?.[0]?.name || '',
            image: i.track.album?.images?.[0]?.url || '',
            type: 'track',
            uri: i.track.uri
          }));
        }
        break;

      case 'made-for-you':
        currentSection.items = playlists.filter(p => 
          p.owner === 'Spotify' || 
          p.name.toLowerCase().includes('daily mix') ||
          p.name.toLowerCase().includes('discover') ||
          p.name.toLowerCase().includes('release radar') ||
          p.name.toLowerCase().includes('repeat')
        ).map(p => ({
          name: p.name,
          artist: p.owner || 'Spotify',
          image: p.image,
          type: 'playlist',
          uri: p.uri,
          id: p.id
        }));
        break;

      case 'jump-back-in':
        data = await api('/me/top/tracks?time_range=short_term&limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(t => ({
            name: t.name,
            artist: t.artists?.[0]?.name || '',
            image: t.album?.images?.[0]?.url || '',
            type: 'track',
            uri: t.uri
          }));
        }
        break;

      case 'top-artists':
        data = await api('/me/top/artists?time_range=medium_term&limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(a => ({
            name: a.name,
            artist: '',
            image: a.images?.[0]?.url || '',
            type: 'artist',
            uri: a.uri,
            id: a.id
          }));
        }
        break;

      case 'all-time-favourites':
        data = await api('/me/top/tracks?time_range=long_term&limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(t => ({
            name: t.name,
            artist: t.artists?.[0]?.name || '',
            image: t.album?.images?.[0]?.url || '',
            type: 'track',
            uri: t.uri
          }));
        }
        break;

      case 'saved-albums':
        data = await api('/me/albums?limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(item => ({
            name: item.album.name,
            artist: item.album.artists?.[0]?.name || '',
            image: item.album.images?.[0]?.url || '',
            type: 'album',
            uri: item.album.uri,
            id: item.album.id
          }));
        }
        break;

      case 'podcasts':
        data = await api('/me/shows?limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(item => ({
            name: item.show.name,
            artist: item.show.publisher || '',
            image: item.show.images?.[0]?.url || '',
            type: 'show',
            uri: item.show.uri,
            id: item.show.id
          }));
        }
        break;

      case 'audiobooks':
        data = await api('/me/audiobooks?limit=20');
        if (data?.items) {
          currentSection.items = data.items.map(item => ({
            name: item.name,
            artist: item.authors?.[0]?.name || '',
            image: item.images?.[0]?.url || '',
            type: 'audiobook',
            uri: item.uri,
            id: item.id
          }));
        }
        break;

      case 'daily-mixes':
        currentSection.items = playlists.filter(p => 
          p.name.toLowerCase().includes('daily mix')
        ).map(p => ({
          name: p.name,
          artist: 'Spotify',
          image: p.image,
          type: 'playlist',
          uri: p.uri,
          id: p.id
        }));
        break;

      case 'library': {
        const [libAlbums, libArtists, libShows] = await Promise.all([
          api('/me/albums?limit=50'),
          api('/me/following?type=artist&limit=50'),
          api('/me/shows?limit=50')
        ]);
        let allItems = [];
        allItems.push(...playlists.map(p => ({
          name: p.name, artist: `${p.trackCount || 0} tracks`, image: p.image,
          type: 'playlist', uri: p.uri, id: p.id, filterType: 'playlists'
        })));
        if (libAlbums?.items) {
          allItems.push(...libAlbums.items.map(item => ({
            name: item.album.name, artist: item.album.artists?.[0]?.name || '',
            image: item.album.images?.[0]?.url || '', type: 'album',
            uri: item.album.uri, id: item.album.id, filterType: 'albums'
          })));
        }
        if (libArtists?.artists?.items) {
          allItems.push(...libArtists.artists.items.map(a => ({
            name: a.name, artist: '', image: a.images?.[0]?.url || '',
            type: 'artist', uri: a.uri, id: a.id, filterType: 'artists'
          })));
        }
        if (libShows?.items) {
          allItems.push(...libShows.items.map(item => ({
            name: item.show.name, artist: item.show.publisher || '',
            image: item.show.images?.[0]?.url || '', type: 'show',
            uri: item.show.uri, id: item.show.id, filterType: 'podcasts'
          })));
        }
        currentSection.items = allItems;
        currentSection.hasFilters = true;
        currentSection.filterOptions = ['all', 'playlists', 'albums', 'artists', 'podcasts'];
        break;
      }

      default:
        currentSection.items = [];
    }
  } catch (err) {
    console.error('Fetch section items error:', err);
    currentSection.items = [];
  }
}

// ============ Playlist View (Content Cards) ============

function renderPlaylist(app) {
  const header = createHeader(truncate(selectedPlaylist?.name || 'Playlist', 18), false);
  app.appendChild(header);

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  if (playlistTracks.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading tracks…</div>`;
  } else {
    playlistTracks.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i;
      card.style.backgroundImage = `url('${track.artwork}')`;
      card.innerHTML = `
        <div class="content-card-overlay"></div>
        <div class="content-card-content">
          <div class="content-card-labels">
            <div class="content-card-name">${truncate(track.name, 26)}</div>
            <div class="content-card-sub"><span>Song</span><span class="dot">·</span><span>${truncate(track.artist, 20)}</span></div>
          </div>
          ${chevronRight()}
        </div>
      `;
      card.addEventListener('click', () => {
        playTrackInContext(selectedPlaylist.uri, track.uri);
        navigate('nowplaying');
      });
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Album View (Content Cards) ============

function renderAlbum(app) {
  const header = createHeader(truncate(selectedAlbum?.name || 'Album', 18), false);
  app.appendChild(header);

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  if (albumTracks.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading…</div>`;
  } else {
    albumTracks.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i;
      card.style.backgroundImage = `url('${track.artwork}')`;
      card.innerHTML = `
        <div class="content-card-overlay"></div>
        <div class="content-card-content">
          <div class="content-card-labels">
            <div class="content-card-name">${truncate(track.name, 26)}</div>
            <div class="content-card-sub"><span>Song</span><span class="dot">·</span><span>${truncate(track.artist, 20)}</span></div>
          </div>
          ${chevronRight()}
        </div>
      `;
      card.addEventListener('click', () => {
        playContext(selectedAlbum.uri, i);
        navigate('nowplaying');
      });
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Artist View ============

function renderArtist(app) {
  if (!artistData) { app.innerHTML = `<div class="empty-state">Loading…</div>`; return; }

  const container = document.createElement('div');
  container.className = 'artist-view';
  container.id = 'list-container';

  container.innerHTML = `
    <div class="artist-hero" style="background-image:url('${artistData.image}')">
      <div class="artist-hero-overlay">
        <button class="artist-back" id="artist-back">${chevronLeft()}</button>
        <div class="artist-hero-bottom">
          <div class="artist-name">${artistData.name}</div>
          <div class="artist-stats">${formatFollowers(artistData.followers)} listeners</div>
          <div class="artist-actions">
            <button class="artist-play-btn" id="artist-play">${playIcon()} Play</button>
            <button class="artist-follow-btn" id="artist-follow">${followIcon()} Follow</button>
          </div>
        </div>
      </div>
    </div>
    <div class="artist-explore">
      <div class="artist-expand" id="artist-expand">
        <span>Discography</span>${chevronDown()}
      </div>
    </div>
  `;

  app.appendChild(container);

  setTimeout(() => {
    document.getElementById('artist-back')?.addEventListener('click', goBack);
    document.getElementById('artist-play')?.addEventListener('click', () => {
      if (artistData.topTracks.length) {
        api('/me/player/play', {
          method: 'PUT',
          body: JSON.stringify({ uris: artistData.topTracks.map(t => t.uri) })
        });
        navigate('nowplaying');
      }
    });
    document.getElementById('artist-follow')?.addEventListener('click', async () => {
      await api(`/me/following?type=artist&ids=${artistData.id}`, { method: 'PUT' });
      showToast('Following ' + artistData.name, 'info');
    });
    document.getElementById('artist-expand')?.addEventListener('click', () => {
      navigate('discography');
    });
  }, 0);

  if (currentTrack) app.appendChild(createMiniPlayer());
}

// ============ Discography View (Content Cards) ============

function renderDiscography(app) {
  if (!artistData) { goBack(); return; }

  const header = createHeader(truncate(artistData.name, 16), true);
  app.appendChild(header);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  const filters = ['all', 'popular', 'albums', 'singles', 'appears on', 'related'];
  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${discographyFilter === f ? 'active' : ''}`;
    btn.textContent = capitalize(f);
    btn.addEventListener('click', () => {
      discographyFilter = f;
      scrollIndex = 0;
      render();
    });
    filterBar.appendChild(btn);
  });
  app.appendChild(filterBar);

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  let allItems = [];

  if (discographyFilter === 'all' || discographyFilter === 'popular') {
    artistData.topTracks.forEach(t => {
      allItems.push({ name: t.name, artist: t.artist, image: t.artwork, type: 'track', uri: t.uri, contextUri: t.contextUri, filterType: 'popular' });
    });
  }
  if (discographyFilter === 'all' || discographyFilter === 'albums') {
    artistData.albums.forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'albums' });
    });
  }
  if (discographyFilter === 'all' || discographyFilter === 'singles') {
    artistData.singles.forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'singles' });
    });
  }
  if (discographyFilter === 'all' || discographyFilter === 'appears on') {
    (artistData.appearsOn || []).forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'appears on' });
    });
  }
  if (discographyFilter === 'all' || discographyFilter === 'related') {
    artistData.related.forEach(a => {
      allItems.push({ name: a.name, artist: '', image: a.image, type: 'artist', id: a.id, uri: a.uri, filterType: 'related' });
    });
  }

  allItems.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = `content-card ${i === scrollIndex ? 'focused' : ''}`;
    card.dataset.idx = i;
    card.style.backgroundImage = `url('${item.image}')`;

    let typeLabel = capitalize(item.type);
    let sublabel = '';
    if (item.type === 'artist') {
      sublabel = '';
    } else if (item.artist) {
      sublabel = `<span>${typeLabel}</span><span class="dot">·</span><span>${truncate(item.artist, 18)}</span>`;
    } else {
      sublabel = `<span>${typeLabel}</span>`;
    }

    card.innerHTML = `
      <div class="content-card-overlay"></div>
      <div class="content-card-content">
        <div class="content-card-labels">
          <div class="content-card-name">${truncate(item.name, 26)}</div>
          ${sublabel ? `<div class="content-card-sub">${sublabel}</div>` : ''}
        </div>
        ${chevronRight()}
      </div>
    `;
    card.addEventListener('click', () => handleContentCardClick(item));
    container.appendChild(card);
  });

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Now Playing View ============

function renderNowPlaying(app) {
  const track = currentTrack || { name: 'Not playing', artist: '', album: '', artwork: '' };

  app.innerHTML = `
    <div class="view-nowplaying">
      <div class="np-header">
        <button class="np-back" id="np-back">${chevronDown()}</button>
        <div class="np-context">Now Playing</div>
      </div>
      <div class="np-artwork">
        ${track.artwork ? `<img src="${track.artwork}" alt="">` : `<div class="np-artwork-placeholder">${noteIcon()}</div>`}
      </div>
      <div class="np-track-info">
        <div class="np-track-name">${truncate(track.name, 26)}</div>
        <div class="np-track-artist">${truncate(track.artist, 30)}</div>
      </div>
      <div class="np-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${durationMs ? (progressMs / durationMs * 100) : 0}%"></div></div>
        <div class="track-time">${formatTime(progressMs)} / ${formatTime(durationMs)}</div>
      </div>
      <div class="np-controls">
        <button class="ctrl-btn" id="ctrl-prev">${prevIcon()}</button>
        <button class="ctrl-btn ctrl-play" id="ctrl-play">${isPlaying ? pauseIcon() : playIcon()}</button>
        <button class="ctrl-btn" id="ctrl-next">${nextIcon()}</button>
      </div>
    </div>
  `;

  document.getElementById('np-back').addEventListener('click', goBack);
  document.getElementById('ctrl-prev').addEventListener('click', prevTrack);
  document.getElementById('ctrl-play').addEventListener('click', togglePlayback);
  document.getElementById('ctrl-next').addEventListener('click', nextTrack);
}

function updateNowPlaying() {
  if (currentView === 'nowplaying') {
    const nameEl = document.querySelector('.np-track-name');
    const artistEl = document.querySelector('.np-track-artist');
    const artEl = document.querySelector('.np-artwork img');
    const playBtn = document.getElementById('ctrl-play');

    if (nameEl && currentTrack) nameEl.textContent = truncate(currentTrack.name, 26);
    if (artistEl && currentTrack) artistEl.textContent = truncate(currentTrack.artist, 30);
    if (artEl && currentTrack?.artwork) artEl.src = currentTrack.artwork;
    if (playBtn) playBtn.innerHTML = isPlaying ? pauseIcon() : playIcon();
    updateProgressBar();
  } else {
    const mini = document.querySelector('.mini-player');
    if (mini && currentTrack) {
      mini.querySelector('.mini-name').textContent = truncate(currentTrack.name, 18);
      mini.querySelector('.mini-artist').textContent = truncate(currentTrack.artist, 20);
      const btn = mini.querySelector('.mini-play');
      if (btn) btn.innerHTML = isPlaying ? pauseIcon() : playIcon();
    }
  }
}

// ============ Search View (Content Cards) ============

function renderSearch(app) {
  const header = createHeader('Search', false);
  app.appendChild(header);

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  searchBox.innerHTML = `<input type="text" class="search-input" id="search-input" placeholder="What do you want to play?" autocomplete="off">`;
  app.appendChild(searchBox);

  const container = document.createElement('div');
  container.className = 'list-container';
  container.id = 'list-container';

  if (searchResults.length === 0) {
    container.innerHTML = `<div class="empty-state">Type to search</div>`;
  } else {
    renderSearchCards(container);
  }

  app.appendChild(container);
  if (currentTrack) app.appendChild(createMiniPlayer());

  const input = document.getElementById('search-input');
  input.focus();
  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      scrollIndex = 0;
      await searchSpotify(input.value);
      const listEl = document.getElementById('list-container');
      if (listEl) {
        listEl.innerHTML = '';
        if (searchResults.length) {
          renderSearchCards(listEl);
        } else if (input.value) {
          listEl.innerHTML = `<div class="empty-state">No results</div>`;
        }
      }
    }, 350);
  });

  scrollFocusedIntoView();
}

function renderSearchCards(container) {
  searchResults.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = `content-card ${i === scrollIndex ? 'focused' : ''}`;
    card.dataset.idx = i;
    card.style.backgroundImage = `url('${item.artwork}')`;
    card.innerHTML = `
      <div class="content-card-overlay"></div>
      <div class="content-card-content">
        <div class="content-card-labels">
          <div class="content-card-name">${truncate(item.name, 26)}</div>
          <div class="content-card-sub">${item.subtitle ? `<span>${item.type}</span><span class="dot">·</span><span>${truncate(item.subtitle, 18)}</span>` : `<span>${item.type}</span>`}</div>
        </div>
        ${chevronRight()}
      </div>
    `;
    card.addEventListener('click', () => handleSearchItemClick(item));
    container.appendChild(card);
  });
}

function handleSearchItemClick(item) {
  if (item.type === 'Artist') {
    openArtist(item.id);
  } else if (item.type === 'Album') {
    openAlbum(item.id);
  } else if (item.type === 'Playlist') {
    openPlaylistById(item.id, item.name, item.uri);
  } else if (item.type === 'Song') {
    playTrackInContext(item.contextUri || item.uri, item.uri);
    navigate('nowplaying');
  }
}

// ============ Shared Components ============

function createHeader(title, showSearch) {
  const header = document.createElement('div');
  header.className = 'header';

  let leftBtn = '';
  if (viewStack.length > 0) {
    leftBtn = `<button class="header-btn back-btn" id="header-back">${chevronLeft()}</button>`;
  } else {
    leftBtn = `<div class="header-logo">${spotifyIcon()}</div>`;
  }

  let rightBtn = '';
  if (showSearch) {
    const isSearchView = currentView === 'search';
    rightBtn = `<button class="header-btn ${isSearchView ? 'disabled' : ''}" id="header-search">${searchIcon()}</button>`;
  }

  header.innerHTML = `${leftBtn}<div class="header-title">${title}</div>${rightBtn}`;

  setTimeout(() => {
    const backBtn = document.getElementById('header-back');
    if (backBtn) backBtn.addEventListener('click', goBack);
    const searchBtn = document.getElementById('header-search');
    if (searchBtn && currentView !== 'search') {
      searchBtn.addEventListener('click', () => navigate('search'));
    }
  }, 0);

  return header;
}

function createMiniPlayer() {
  const mini = document.createElement('div');
  mini.className = 'mini-player';
  mini.innerHTML = `
    <img class="mini-art" src="${currentTrack?.artwork || ''}" alt="">
    <div class="mini-info">
      <div class="mini-name">${truncate(currentTrack?.name || '', 18)}</div>
    </div>
    <div class="mini-indicator">${isPlaying ? 'PLAYING' : 'PAUSED'}</div>
  `;
  mini.addEventListener('click', () => navigate('nowplaying'));
  return mini;
}

// ============ Navigation ============

function navigate(view) {
  viewStack.push({ view: currentView, scrollIndex });
  currentView = view;
  scrollIndex = 0;
  render();
}

function goBack() {
  if (viewStack.length > 0) {
    const prev = viewStack.pop();
    currentView = prev.view;
    scrollIndex = prev.scrollIndex || 0;
  } else {
    currentView = 'home';
    scrollIndex = 0;
  }
  render();
}

async function openPlaylist(pl, idx) {
  selectedPlaylist = pl;
  playlistTracks = [];
  navigate('playlist');
  await fetchPlaylistTracks(pl.id);
  if (currentView === 'playlist') render();
}

async function openPlaylistById(id, name, uri) {
  selectedPlaylist = { id, name, uri };
  playlistTracks = [];
  navigate('playlist');
  await fetchPlaylistTracks(id);
  if (currentView === 'playlist') render();
}

async function openArtist(artistId) {
  artistData = null;
  navigate('artist');
  await fetchArtist(artistId);
  if (currentView === 'artist') render();
}

async function openAlbum(albumId) {
  albumTracks = [];
  selectedAlbum = null;
  navigate('album');
  await fetchAlbumTracks(albumId);
  if (currentView === 'album') render();
}

// ============ List Scroll Management ============

function scrollFocusedIntoView() {
  updateFocusedCard();
  
  const container = document.getElementById('list-container');
  if (!container) return;

  const items = container.querySelectorAll('.cat-card, .content-card');
  const stickyIndex = 2;
  const cardHeight = items[0]?.offsetHeight || 44;
  
  // Scroll to position the focused item at the sticky index
  if (scrollIndex >= stickyIndex && scrollIndex < items.length - stickyIndex) {
    const targetScrollTop = (scrollIndex - stickyIndex) * cardHeight;
    container.scrollTop = targetScrollTop;
  } else if (scrollIndex < stickyIndex) {
    container.scrollTop = 0;
  } else {
    // Near the bottom, scroll to end
    container.scrollTop = container.scrollHeight;
  }
}

function getListLength() {
  if (currentView === 'home') {
    const filtered = homeFilter === 'all' ? homeSections : homeSections.filter(s => s.contentType === homeFilter);
    return filtered.length;
  }
  if (currentView === 'section') {
    if (!currentSection) return 0;
    let items = currentSection.items;
    if (currentSection.hasFilters && sectionFilter !== 'all') {
      items = items.filter(item => item.filterType === sectionFilter);
    }
    return items.length;
  }
  if (currentView === 'playlist') return playlistTracks.length;
  if (currentView === 'album') return albumTracks.length;
  if (currentView === 'search') return searchResults.length;
  if (currentView === 'discography') {
    if (!artistData) return 0;
    let count = 0;
    if (discographyFilter === 'all' || discographyFilter === 'popular') count += artistData.topTracks.length;
    if (discographyFilter === 'all' || discographyFilter === 'albums') count += artistData.albums.length;
    if (discographyFilter === 'all' || discographyFilter === 'singles') count += artistData.singles.length;
    if (discographyFilter === 'all' || discographyFilter === 'appears on') count += (artistData.appearsOn || []).length;
    if (discographyFilter === 'all' || discographyFilter === 'related') count += artistData.related.length;
    return count;
  }
  return 0;
}

// ============ Volume Toast ============

let volumeToastTimeout = null;

function showVolumeToast() {
  let toast = document.querySelector('.volume-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'volume-toast';
    document.getElementById('app').appendChild(toast);
  }
  toast.innerHTML = `
    <div class="vol-track-sm"><div class="vol-fill-sm" style="width:${volume * 100}%"></div></div>
    <span class="vol-pct-sm">${Math.round(volume * 100)}%</span>
  `;
  toast.classList.add('visible');

  if (volumeToastTimeout) clearTimeout(volumeToastTimeout);
  volumeToastTimeout = setTimeout(() => toast.classList.remove('visible'), 1200);
}

// ============ Toast Messages ============

function showToast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('app').appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, type === 'error' ? 4000 : 2500);
}

// ============ Utility ============

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============ Icons ============

function spotifyLogo() {
  return `<svg viewBox="0 0 168 168" fill="#1DB954"><path d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.5 121.2c-1.5 2.5-4.7 3.2-7.1 1.7-19.5-11.9-44-14.6-72.9-8-2.8.6-5.6-1.1-6.2-3.9-.6-2.8 1.1-5.6 3.9-6.2 31.6-7.2 58.7-4.1 80.6 9.3 2.5 1.5 3.2 4.7 1.7 7.1zm10.3-22.8c-1.9 3.1-5.9 4-9 2.1-22.3-13.7-56.3-17.7-82.7-9.7-3.4 1-7.1-.9-8.1-4.3-1-3.4.9-7.1 4.3-8.1 30.1-9.1 67.5-4.7 93.1 11 3.1 1.9 4 5.9 2.4 9zm.9-23.8c-26.7-15.9-70.9-17.3-96.4-9.6-4.1 1.2-8.4-1.1-9.6-5.2-1.2-4.1 1.1-8.4 5.2-9.6 29.3-8.9 78-7.2 108.8 11.1 3.7 2.2 4.9 7 2.7 10.6-2.2 3.7-7 4.9-10.7 2.7z"/></svg>`;
}

function spotifyIcon() {
  return `<svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.3c-.2.3-.7.5-1 .2-2.8-1.7-6.3-2.1-10.4-1.1-.4.1-.8-.2-.9-.5-.1-.4.2-.8.5-.9 4.5-1 8.4-.6 11.5 1.3.4.2.5.6.3 1zm1.5-3.3c-.3.4-.8.5-1.3.3-3.2-2-8-2.5-11.8-1.4-.5.1-1-.1-1.2-.6-.1-.5.1-1 .6-1.2 4.3-1.3 9.7-.7 13.3 1.6.5.3.6.9.4 1.3zm.1-3.4c-3.8-2.3-10.1-2.5-13.8-1.4-.6.2-1.2-.2-1.3-.8-.2-.6.2-1.2.8-1.3 4.2-1.3 11.2-1 15.6 1.6.5.3.7 1 .4 1.6-.3.5-1 .7-1.7.3z"/></svg>`;
}

function playIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

function pauseIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
}

function prevIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
}

function nextIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
}

function searchIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
}

function chevronLeft() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
}

function chevronDown() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`;
}

function chevronRight() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" class="chevron-right"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
}

function followIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`;
}

function noteIcon() {
  return `<svg viewBox="0 0 24 24" fill="#535353"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
}

function eqIcon() {
  return `<span class="eq-bars"><span></span><span></span><span></span></span>`;
}

function swipeRightIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M4 12h12l-4-4 1.4-1.4L19.8 12l-6.4 6.4L12 17l4-4H4z"/></svg>`;
}

function swipeLeftIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 12H8l4 4-1.4 1.4L4.2 12l6.4-6.4L12 7l-4 4h12z"/></svg>`;
}

function scrollIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2l-4 4h3v4h2V6h3L12 2zm0 20l4-4h-3v-4h-2v4H8l4 4z"/></svg>`;
}

function tapIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2a4 4 0 00-4 4c0 1.1.45 2.1 1.17 2.83L12 6l2.83 2.83A4 4 0 0012 2zm-1 10v9l-3-1.5v-2L11 16v-4h2v4l3 1.5v2L13 21v-9h-2z"/></svg>`;
}

// ============ R1 Hardware Events ============

window.addEventListener('scrollUp', () => handleScroll(-1));
window.addEventListener('scrollDown', () => handleScroll(1));

function handleScroll(dir) {
  if (currentView === 'nowplaying') {
    adjustVolume(dir * -0.05);
  } else if (currentView === 'artist') {
    // no scroll on artist hero, just trigger explore
  } else {
    const maxIdx = getListLength() - 1;
    if (maxIdx < 0) return;
    
    const container = document.getElementById('list-container');
    if (!container) return;
    
    const stickyIndex = 2; // Selection stays at this index in viewport
    const items = container.querySelectorAll('.cat-card, .content-card');
    if (items.length === 0) return;
    
    const cardHeight = items[0]?.offsetHeight || 44;
    
    // If at the top and scrolling down, move selection to sticky position
    if (scrollIndex === 0 && dir === 1) {
      scrollIndex = stickyIndex;
      updateFocusedCard();
      return;
    }
    // If at bottom and scrolling up, move selection up
    if (scrollIndex === maxIdx && dir === -1) {
      scrollIndex = maxIdx - stickyIndex;
      updateFocusedCard();
      return;
    }
    
    // Scroll the container
    container.scrollTop += dir * cardHeight;
    
    // Update which item appears at sticky position based on scroll
    const scrollTop = container.scrollTop;
    const newIndex = Math.min(maxIdx, Math.max(0, Math.floor(scrollTop / cardHeight) + stickyIndex));
    
    if (newIndex !== scrollIndex && newIndex >= 0 && newIndex <= maxIdx) {
      scrollIndex = newIndex;
      updateFocusedCard();
    }
  }
}

function updateFocusedCard() {
  const items = document.querySelectorAll('.cat-card, .content-card');
  items.forEach((item, i) => {
    if (i === scrollIndex) {
      item.classList.add('focused');
    } else {
      item.classList.remove('focused');
    }
  });
}

window.addEventListener('sideClick', () => {
  if (currentView === 'login') {
    startAuth();
  } else if (currentView === 'nowplaying') {
    togglePlayback();
  } else if (currentView === 'artist') {
    navigate('discography');
  } else {
    const focused = document.querySelector('.cat-card.focused, .content-card.focused');
    if (focused) focused.click();
  }
});

// ============ Touch & Wheel Scroll ============

let touchStartY = 0;
let touchLastY = 0;
let touchAccumulated = 0;
const TOUCH_STEP_PX = 50;

document.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
  touchLastY = touchStartY;
  touchAccumulated = 0;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (currentView === 'login' || currentView === 'nowplaying') return;
  const y = e.touches[0].clientY;
  touchAccumulated += (touchLastY - y);

  while (Math.abs(touchAccumulated) >= TOUCH_STEP_PX) {
    if (touchAccumulated > 0) {
      handleScroll(1);
      touchAccumulated -= TOUCH_STEP_PX;
    } else {
      handleScroll(-1);
      touchAccumulated += TOUCH_STEP_PX;
    }
  }
  touchLastY = y;
}, { passive: true });

document.addEventListener('wheel', (e) => {
  if (currentView === 'login') return;
  e.preventDefault();
  touchAccumulated += e.deltaY;
  while (Math.abs(touchAccumulated) >= TOUCH_STEP_PX) {
    if (touchAccumulated > 0) {
      handleScroll(1);
      touchAccumulated -= TOUCH_STEP_PX;
    } else {
      handleScroll(-1);
      touchAccumulated += TOUCH_STEP_PX;
    }
  }
}, { passive: false });

// Horizontal swipe for tab switching
let touchStartX = 0;
document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 60) {
    if (dx > 0 && viewStack.length > 0) goBack();
    else if (dx < 0 && currentView === 'home') navigate('search');
  }
}, { passive: true });

// ============ Init ============

document.addEventListener('DOMContentLoaded', async () => {
  volume = await loadVolume();

  // Check onboarding state
  try { onboardingShown = !!localStorage.getItem('spotify_onboarded'); } catch (e) {}

  // Check for OAuth callback
  const callbackHandled = await handleCallback();

  if (!callbackHandled) {
    const stored = await loadToken();
    if (stored && stored.token && Date.now() < stored.expiry) {
      accessToken = stored.token;
      tokenExpiry = stored.expiry;
    } else if (stored && stored.refresh) {
      const refreshed = await refreshToken();
      if (!refreshed) { currentView = 'login'; render(); return; }
    } else {
      currentView = 'login';
      render();
      return;
    }
  }

  // Authenticated — show home
  currentView = 'home';
  render();
  initPlayer();

  // Fetch data in parallel
  await fetchPlaylists();
  await fetchHomeSections();
  render();

  // Show onboarding on first launch
  if (!onboardingShown) {
    setTimeout(showOnboarding, 500);
  }

  // Dev keyboard fallback
  if (typeof PluginMessageHandler === 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); window.dispatchEvent(new CustomEvent('sideClick')); }
      if (e.code === 'ArrowUp') { e.preventDefault(); window.dispatchEvent(new CustomEvent('scrollUp')); }
      if (e.code === 'ArrowDown') { e.preventDefault(); window.dispatchEvent(new CustomEvent('scrollDown')); }
      if (e.code === 'Escape') goBack();
    });
  }
});

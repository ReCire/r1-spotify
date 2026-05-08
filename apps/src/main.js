// Spotify R1 Player
// ============ Configuration ============

const CONFIG = {
  clientId: '8ef09899795a4fdab465bfa82c97c534', // Set your Spotify Client ID here
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
    'playlist-read-private',
    'playlist-read-collaborative'
  ].join(' ')
};

// ============ State ============

let accessToken = null;
let tokenExpiry = 0;
let player = null;
let deviceId = null;
let currentView = 'login'; // login | home | playlist | nowplaying | search
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

function initPlayer() {
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (!accessToken) return;
    createPlayer();
  };

  if (window.Spotify) {
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
  await api('/me/player/play', {
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
  await api('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify({
      context_uri: contextUri,
      offset: { uri: trackUri },
      position_ms: 0
    })
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
  const data = await api(`/playlists/${playlistId}/tracks?limit=50`);
  if (data && data.items) {
    playlistTracks = data.items
      .filter(item => item.track)
      .map(item => ({
        name: item.track.name,
        artist: item.track.artists?.map(a => a.name).join(', ') || '',
        album: item.track.album?.name || '',
        artwork: item.track.album?.images?.[0]?.url || '',
        uri: item.track.uri,
        durationMs: item.track.duration_ms
      }));
  }
}

async function searchSpotify(query) {
  if (!query.trim()) { searchResults = []; return; }
  const data = await api(`/search?q=${encodeURIComponent(query)}&type=track,playlist&limit=10`);
  if (!data) return;

  searchResults = [];
  if (data.tracks?.items) {
    data.tracks.items.forEach(t => {
      searchResults.push({
        type: 'track',
        name: t.name,
        artist: t.artists?.map(a => a.name).join(', ') || '',
        artwork: t.album?.images?.[0]?.url || '',
        uri: t.uri,
        contextUri: t.album?.uri || ''
      });
    });
  }
  if (data.playlists?.items) {
    data.playlists.items.forEach(p => {
      if (p) searchResults.push({
        type: 'playlist',
        name: p.name,
        artist: p.owner?.display_name || '',
        artwork: p.images?.[0]?.url || '',
        uri: p.uri,
        id: p.id
      });
    });
  }
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
    case 'playlist': renderPlaylist(app); break;
    case 'nowplaying': renderNowPlaying(app); break;
    case 'search': renderSearch(app); break;
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

// ============ Home View (Library) ============

function renderHome(app) {
  const header = createHeader('Library', true);
  app.appendChild(header);

  const list = document.createElement('div');
  list.className = 'list-container';
  list.id = 'list-container';

  if (playlists.length === 0) {
    list.innerHTML = `<div class="empty-state">Loading playlists…</div>`;
  } else {
    playlists.forEach((pl, i) => {
      const item = document.createElement('div');
      item.className = `list-item ${i === scrollIndex ? 'focused' : ''}`;
      item.dataset.idx = i;
      item.innerHTML = `
        <img class="list-item-art" src="${pl.image || ''}" alt="">
        <div class="list-item-info">
          <div class="list-item-name">${truncate(pl.name, 22)}</div>
          <div class="list-item-meta">${pl.trackCount} tracks</div>
        </div>
      `;
      item.addEventListener('click', () => openPlaylist(pl, i));
      list.appendChild(item);
    });
  }

  app.appendChild(list);

  // Now playing mini bar
  if (currentTrack) {
    app.appendChild(createMiniPlayer());
  }

  updateListScroll();
}

// ============ Playlist View ============

function renderPlaylist(app) {
  const header = createHeader(truncate(selectedPlaylist?.name || 'Playlist', 20), false);
  app.appendChild(header);

  const list = document.createElement('div');
  list.className = 'list-container';
  list.id = 'list-container';

  if (playlistTracks.length === 0) {
    list.innerHTML = `<div class="empty-state">No tracks</div>`;
  } else {
    playlistTracks.forEach((track, i) => {
      const isActive = currentTrack && currentTrack.uri === track.uri && isPlaying;
      const item = document.createElement('div');
      item.className = `list-item ${i === scrollIndex ? 'focused' : ''} ${isActive ? 'active' : ''}`;
      item.dataset.idx = i;
      item.innerHTML = `
        <div class="list-item-num">${isActive ? eqIcon() : (i + 1)}</div>
        <div class="list-item-info">
          <div class="list-item-name">${truncate(track.name, 22)}</div>
          <div class="list-item-meta">${truncate(track.artist, 28)}</div>
        </div>
        <div class="list-item-dur">${formatTime(track.durationMs)}</div>
      `;
      item.addEventListener('click', () => {
        playTrackInContext(selectedPlaylist.uri, track.uri);
        currentView = 'nowplaying';
        render();
      });
      list.appendChild(item);
    });
  }

  app.appendChild(list);

  if (currentTrack) {
    app.appendChild(createMiniPlayer());
  }

  updateListScroll();
}

// ============ Now Playing View ============

function renderNowPlaying(app) {
  const track = currentTrack || { name: 'Not playing', artist: '', album: '', artwork: '' };

  app.innerHTML = `
    <div class="view-nowplaying">
      <div class="np-header">
        <button class="np-back" id="np-back">${chevronDown()}</button>
        <div class="np-context">Playing from playlist</div>
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
  } else if (currentView === 'home' || currentView === 'playlist') {
    const mini = document.querySelector('.mini-player');
    if (mini && currentTrack) {
      mini.querySelector('.mini-name').textContent = truncate(currentTrack.name, 18);
      mini.querySelector('.mini-artist').textContent = truncate(currentTrack.artist, 20);
      const btn = mini.querySelector('.mini-play');
      if (btn) btn.innerHTML = isPlaying ? pauseIcon() : playIcon();
    }
  }
}

// ============ Search View ============

function renderSearch(app) {
  const header = createHeader('Search', true);
  app.appendChild(header);

  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  searchBox.innerHTML = `
    <input type="text" class="search-input" id="search-input" placeholder="Search songs, playlists…" autocomplete="off">
  `;
  app.appendChild(searchBox);

  const list = document.createElement('div');
  list.className = 'list-container search-results';
  list.id = 'list-container';

  searchResults.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = `list-item ${i === scrollIndex ? 'focused' : ''}`;
    el.dataset.idx = i;
    el.innerHTML = `
      <img class="list-item-art" src="${item.artwork || ''}" alt="">
      <div class="list-item-info">
        <div class="list-item-name">${truncate(item.name, 20)}</div>
        <div class="list-item-meta">${item.type === 'playlist' ? 'Playlist' : truncate(item.artist, 24)}</div>
      </div>
    `;
    el.addEventListener('click', () => {
      if (item.type === 'playlist') {
        openPlaylistById(item.id, item.name, item.uri);
      } else {
        playTrackInContext(item.contextUri, item.uri);
        currentView = 'nowplaying';
        render();
      }
    });
    list.appendChild(el);
  });

  if (searchResults.length === 0) {
    list.innerHTML = `<div class="empty-state">Type to search</div>`;
  }

  app.appendChild(list);

  if (currentTrack) {
    app.appendChild(createMiniPlayer());
  }

  const input = document.getElementById('search-input');
  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      scrollIndex = 0;
      await searchSpotify(input.value);
      const listEl = document.getElementById('list-container');
      if (listEl) {
        listEl.innerHTML = '';
        searchResults.forEach((item, i) => {
          const el = document.createElement('div');
          el.className = `list-item ${i === scrollIndex ? 'focused' : ''}`;
          el.innerHTML = `
            <img class="list-item-art" src="${item.artwork || ''}" alt="">
            <div class="list-item-info">
              <div class="list-item-name">${truncate(item.name, 20)}</div>
              <div class="list-item-meta">${item.type === 'playlist' ? 'Playlist' : truncate(item.artist, 24)}</div>
            </div>
          `;
          el.addEventListener('click', () => {
            if (item.type === 'playlist') {
              openPlaylistById(item.id, item.name, item.uri);
            } else {
              playTrackInContext(item.contextUri, item.uri);
              currentView = 'nowplaying';
              render();
            }
          });
          listEl.appendChild(el);
        });
        if (searchResults.length === 0 && input.value) {
          listEl.innerHTML = `<div class="empty-state">No results</div>`;
        }
      }
    }, 400);
  });

  updateListScroll();
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
  if (showSearch && currentView !== 'search') {
    rightBtn = `<button class="header-btn" id="header-search">${searchIcon()}</button>`;
  }

  header.innerHTML = `${leftBtn}<div class="header-title">${title}</div>${rightBtn}`;

  setTimeout(() => {
    const backBtn = document.getElementById('header-back');
    if (backBtn) backBtn.addEventListener('click', goBack);
    const searchBtn = document.getElementById('header-search');
    if (searchBtn) searchBtn.addEventListener('click', () => navigate('search'));
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
      <div class="mini-artist">${truncate(currentTrack?.artist || '', 20)}</div>
    </div>
    <button class="mini-play">${isPlaying ? pauseIcon() : playIcon()}</button>
  `;
  mini.querySelector('.mini-play').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayback();
  });
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

// ============ List Scroll Management ============

function updateListScroll() {
  const container = document.getElementById('list-container');
  if (!container) return;

  const items = container.querySelectorAll('.list-item');
  items.forEach((item, i) => {
    item.classList.toggle('focused', i === scrollIndex);
  });

  // Scroll focused into view
  const focused = container.querySelector('.list-item.focused');
  if (focused) {
    const containerRect = container.getBoundingClientRect();
    const itemRect = focused.getBoundingClientRect();
    if (itemRect.bottom > containerRect.bottom) {
      focused.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } else if (itemRect.top < containerRect.top) {
      focused.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
}

function getListLength() {
  if (currentView === 'home') return playlists.length;
  if (currentView === 'playlist') return playlistTracks.length;
  if (currentView === 'search') return searchResults.length;
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

function noteIcon() {
  return `<svg viewBox="0 0 24 24" fill="#535353"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
}

function eqIcon() {
  return `<span class="eq-bars"><span></span><span></span><span></span></span>`;
}

// ============ R1 Hardware Events ============

window.addEventListener('scrollUp', () => handleScroll(-1));
window.addEventListener('scrollDown', () => handleScroll(1));

function handleScroll(dir) {
  if (currentView === 'nowplaying') {
    adjustVolume(dir * -0.05);
  } else if (currentView === 'home' || currentView === 'playlist' || currentView === 'search') {
    const maxIdx = getListLength() - 1;
    scrollIndex = Math.max(0, Math.min(maxIdx, scrollIndex + dir));
    updateListScroll();
  }
}

window.addEventListener('sideClick', () => {
  if (currentView === 'login') {
    startAuth();
  } else if (currentView === 'nowplaying') {
    togglePlayback();
  } else if (currentView === 'home' && playlists[scrollIndex]) {
    openPlaylist(playlists[scrollIndex], scrollIndex);
  } else if (currentView === 'playlist' && playlistTracks[scrollIndex]) {
    playTrackInContext(selectedPlaylist.uri, playlistTracks[scrollIndex].uri);
    currentView = 'nowplaying';
    render();
  } else if (currentView === 'search' && searchResults[scrollIndex]) {
    const item = searchResults[scrollIndex];
    if (item.type === 'playlist') {
      openPlaylistById(item.id, item.name, item.uri);
    } else {
      playTrackInContext(item.contextUri, item.uri);
      currentView = 'nowplaying';
      render();
    }
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

  // Authenticated
  currentView = 'home';
  render();
  initPlayer();
  await fetchPlaylists();
  render();

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

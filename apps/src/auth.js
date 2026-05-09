// Spotify R1 Player - Authentication
import { CONFIG, state } from './state.js';

// ============ Storage (R1 creationStorage or localStorage) ============

export async function saveToken(token, expiry, refresh) {
  const data = JSON.stringify({ token, expiry, refresh });
  if (window.creationStorage) {
    try { await window.creationStorage.plain.setItem('spotify_auth', btoa(data)); } catch (e) {}
  } else {
    localStorage.setItem('spotify_auth', data);
  }
}

export async function loadToken() {
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

export async function clearToken() {
  if (window.creationStorage) {
    try { await window.creationStorage.plain.removeItem('spotify_auth'); } catch (e) {}
  } else {
    localStorage.removeItem('spotify_auth');
  }
}

export async function saveVolume(vol) {
  if (window.creationStorage) {
    try { await window.creationStorage.plain.setItem('spotify_vol', btoa(JSON.stringify(vol))); } catch (e) {}
  } else {
    localStorage.setItem('spotify_vol', JSON.stringify(vol));
  }
}

export async function loadVolume() {
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

export async function startAuth() {
  if (!CONFIG.clientId) {
    showToast('Set Client ID in config', 'error');
    return;
  }

  const codeVerifier = generateRandomString(64);
  sessionStorage.setItem('code_verifier', codeVerifier);

  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  const oauthState = generateRandomString(16);
  sessionStorage.setItem('auth_state', oauthState);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    scope: CONFIG.scopes,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: CONFIG.redirectUri,
    state: oauthState
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthState = params.get('state');

  if (!code) return false;

  const storedState = sessionStorage.getItem('auth_state');
  if (oauthState !== storedState) {
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

    state.accessToken = data.access_token;
    state.tokenExpiry = Date.now() + data.expires_in * 1000;
    await saveToken(state.accessToken, state.tokenExpiry, data.refresh_token || '');

    window.history.replaceState({}, document.title, window.location.pathname);
    sessionStorage.removeItem('code_verifier');
    sessionStorage.removeItem('auth_state');
    return true;
  } catch (e) {
    showToast('Login failed', 'error');
    return false;
  }
}

export async function refreshToken() {
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
    state.accessToken = data.access_token;
    state.tokenExpiry = Date.now() + data.expires_in * 1000;
    await saveToken(state.accessToken, state.tokenExpiry, data.refresh_token || stored.refresh);
    return true;
  } catch (e) {
    return false;
  }
}

// Temporary showToast for auth module - will be moved to ui.js
function showToast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('app').appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, type === 'error' ? 4000 : 2500);
}

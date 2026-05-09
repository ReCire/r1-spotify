// Spotify R1 Player - API & Data Fetching
import { state } from './state.js';
import { refreshToken, saveToken, saveVolume } from './auth.js';

// Local showToast to avoid circular dependency with ui.js
function showToast(msg, type = 'info') {
  let el = document.querySelector('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('app').appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, type === 'error' ? 4000 : 2500);
}

// ============ Spotify API Helpers ============

export async function api(endpoint, options = {}) {
  if (Date.now() >= state.tokenExpiry - 60000) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      state.currentView = 'login';
      return null;
    }
  }

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) return api(endpoint, options);
    state.currentView = 'login';
    return null;
  }

  if (res.status === 204) return {};
  if (!res.ok) return null;
  return res.json();
}

// ============ Spotify Web Playback SDK ============

// Define callback globally before SDK loads
window.onSpotifyWebPlaybackSDKReady = () => {
  if (state.accessToken && !state.player) {
    createPlayer();
  }
};

export function initPlayer() {
  if (window.Spotify && state.accessToken && !state.player) {
    createPlayer();
  }
}

function createPlayer() {
  if (state.player) return;

  state.player = new Spotify.Player({
    name: 'Rabbit R1',
    getOAuthToken: async (cb) => {
      if (Date.now() >= state.tokenExpiry - 60000) await refreshToken();
      cb(state.accessToken);
    },
    volume: state.volume
  });

  state.player.addListener('ready', ({ device_id }) => {
    state.deviceId = device_id;
    transferPlayback(device_id);
  });

  state.player.addListener('not_ready', () => {
    state.deviceId = null;
  });

  state.player.addListener('player_state_changed', (playerState) => {
    if (!playerState) {
      state.isPlaying = false;
      state.currentTrack = null;
      // Don't call render() here to avoid circular dependency
      return;
    }

    state.isPlaying = !playerState.paused;
    state.progressMs = playerState.position;
    state.durationMs = playerState.duration;

    const track = playerState.track_window.current_track;
    if (track) {
      state.currentTrack = {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        artwork: track.album.images[0]?.url || '',
        uri: track.uri
      };
    }

    // Emit event instead of calling render to avoid circular dependency
    window.dispatchEvent(new CustomEvent('playerStateChanged'));
    startProgressTimer();
  });

  state.player.addListener('initialization_error', ({ message }) => {
    console.error('Player init error:', message);
  });

  state.player.addListener('authentication_error', ({ message }) => {
    console.error('Auth expired:', message);
    state.currentView = 'login';
    // Emit event instead of calling render to avoid circular dependency
    window.dispatchEvent(new CustomEvent('authError'));
  });

  state.player.connect();
}

async function transferPlayback(devId) {
  await api('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [devId], play: false })
  });
}

// ============ Playback Controls ============

export async function togglePlayback() {
  if (!state.deviceId) {
    showToast('No player connected', 'error');
    return;
  }
  if (state.isPlaying) {
    await api('/me/player/pause', { method: 'PUT' });
  } else {
    await api('/me/player/play', { method: 'PUT' });
  }
}

export async function nextTrack() {
  await api('/me/player/next', { method: 'POST' });
}

export async function prevTrack() {
  await api('/me/player/previous', { method: 'POST' });
}

export async function playContext(contextUri, offset = 0) {
  if (!state.deviceId) {
    showToast('Connecting…', 'info');
    return;
  }
  await api(`/me/player/play?device_id=${state.deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({
      context_uri: contextUri,
      offset: { position: offset },
      position_ms: 0
    })
  });
}

export async function playTrackInContext(contextUri, trackUri) {
  if (!state.deviceId) {
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
  await api(`/me/player/play?device_id=${state.deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

export async function adjustVolume(delta) {
  state.volume = Math.max(0, Math.min(1, state.volume + delta));
  if (state.player) state.player.setVolume(state.volume);
  saveVolume(state.volume);
  window.dispatchEvent(new CustomEvent('volumeChanged'));
}

// ============ Data Fetching ============

export async function fetchPlaylists() {
  const data = await api('/me/playlists?limit=50');
  if (data && data.items) {
    state.playlists = data.items.map(p => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url || '',
      uri: p.uri,
      trackCount: p.tracks?.total || 0,
      owner: p.owner?.display_name || ''
    }));
  }
}

export async function fetchPlaylistTracks(playlistId) {
  try {
    if (Date.now() >= state.tokenExpiry - 60000) {
      await refreshToken();
    }
    console.log('Fetching playlist tracks for:', playlistId, 'Token:', state.accessToken ? 'exists' : 'missing');
    const data = await api(`/playlists/${playlistId}/tracks?limit=100`);
    console.log('Playlist data:', data);
    if (data && data.items) {
      state.playlistTracks = data.items
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
      state.playlistTracks = [];
    }
  } catch (err) {
    console.error('Fetch playlist tracks error:', err);
    showToast('Unable to load playlist. It may be private.', 'error');
    state.playlistTracks = [];
  }
}

export async function fetchHomeSections() {
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

    state.homeSections = [];

    if (recentData?.items?.length) {
      const img = recentData.items[0]?.track?.album?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Recents', 
        image: img,
        categoryType: 'recents',
        contentType: 'music'
      });
    }

    if (topTracksShort?.items?.length) {
      const img = topTracksShort.items[0]?.album?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Jump Back In', 
        image: img,
        categoryType: 'jump-back-in',
        contentType: 'music'
      });
    }

    if (topArtistsData?.items?.length) {
      const img = topArtistsData.items[0]?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Your Top Artists', 
        image: img,
        categoryType: 'top-artists',
        contentType: 'music'
      });
    }

    if (topTracksLong?.items?.length) {
      const img = topTracksLong.items[0]?.album?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'All-Time Favourites', 
        image: img,
        categoryType: 'all-time-favourites',
        contentType: 'music'
      });
    }

    if (savedAlbums?.items?.length) {
      const img = savedAlbums.items[0]?.album?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Saved Albums', 
        image: img,
        categoryType: 'saved-albums',
        contentType: 'music'
      });
    }

    if (showsData?.items?.length) {
      const img = showsData.items[0]?.show?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Your Podcasts', 
        image: img,
        categoryType: 'podcasts',
        contentType: 'podcasts'
      });
    }

    if (audiobooksData?.items?.length) {
      const img = audiobooksData.items[0]?.images?.[0]?.url || '';
      state.homeSections.push({ 
        title: 'Your Audiobooks', 
        image: img,
        categoryType: 'audiobooks',
        contentType: 'audiobooks'
      });
    }

    if (state.playlists.length) {
      const madeForYou = state.playlists.filter(p => 
        p.owner === 'Spotify' || 
        p.name.toLowerCase().includes('daily mix') ||
        p.name.toLowerCase().includes('discover') ||
        p.name.toLowerCase().includes('release radar') ||
        p.name.toLowerCase().includes('repeat') ||
        p.name.toLowerCase().includes('on repeat') ||
        p.name.toLowerCase().includes('time capsule')
      );
      if (madeForYou.length) {
        state.homeSections.push({
          title: 'Made For You',
          image: madeForYou[0]?.image || '',
          categoryType: 'made-for-you',
          contentType: 'music'
        });
      }

      const dailyMixes = state.playlists.filter(p => 
        p.name.toLowerCase().includes('daily mix')
      );
      if (dailyMixes.length) {
        state.homeSections.push({
          title: 'Daily Mixes',
          image: dailyMixes[0]?.image || '',
          categoryType: 'daily-mixes',
          contentType: 'music'
        });
      }

      state.homeSections.push({ 
        title: 'Your Library', 
        image: state.playlists[0]?.image || '',
        categoryType: 'library',
        contentType: 'music'
      });
    }
  } catch (err) {
    console.error('Home sections error:', err);
    state.homeSections = [];
  }
}

export async function fetchArtist(artistId) {
  const artist = await api(`/artists/${artistId}`);
  if (!artist) return null;

  // 2. BACKDOOR: Relaxed Search query to bypass the 403/400 restrictions
  const query = encodeURIComponent(artist.name);
  const searchRes = await api(`/search?q=${query}&type=track,album&limit=50`);
  
  const tracks = searchRes?.tracks?.items || [];
  const albumsList = searchRes?.albums?.items || [];

  // Filter to ensure exact artist match
  const topTracks = tracks.filter(t => t.artists.some(a => a.id === artistId)).slice(0, 5);
  const exactAlbums = albumsList.filter(a => a.artists.some(a => a.id === artistId));

  state.artistData = {
    id: artist.id,
    name: artist.name,
    image: artist.images?.[0]?.url || '',
    followers: artist.followers?.total || 0,
    uri: artist.uri,
    topTracks: topTracks.map(t => ({
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || '',
      artwork: t.album?.images?.[0]?.url || '',
      uri: t.uri,
      contextUri: t.album?.uri || '',
      durationMs: t.duration_ms
    })),
    albums: exactAlbums.filter(a => a.album_type === 'album').map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri, type: 'album'
    })),
    singles: exactAlbums.filter(a => a.album_type === 'single').map(a => ({
      id: a.id, name: a.name, image: a.images?.[0]?.url || '', uri: a.uri, type: 'single'
    }))
  };
  return state.artistData;
}

export async function fetchAlbumTracks(albumId) {
  const data = await api(`/albums/${albumId}`);
  if (data) {
    state.selectedAlbum = {
      id: data.id,
      name: data.name,
      image: data.images?.[0]?.url || '',
      artist: data.artists?.map(a => a.name).join(', ') || '',
      uri: data.uri,
      year: data.release_date?.substring(0, 4) || ''
    };
    state.albumTracks = (data.tracks?.items || []).map(t => ({
      name: t.name,
      artist: t.artists?.map(a => a.name).join(', ') || '',
      uri: t.uri,
      durationMs: t.duration_ms,
      artwork: data.images?.[0]?.url || ''
    }));
  }
}

export async function searchSpotify(query) {
  if (!query.trim()) { state.searchResults = []; return; }
  const data = await api(`/search?q=${encodeURIComponent(query)}&type=artist,album,track,playlist&limit=5`);
  if (!data) return;

  state.searchResults = [];
  if (data.artists?.items) {
    data.artists.items.forEach(a => {
      state.searchResults.push({
        type: 'Artist', name: a.name, subtitle: '',
        artwork: a.images?.[0]?.url || '', id: a.id, uri: a.uri
      });
    });
  }
  if (data.albums?.items) {
    data.albums.items.forEach(a => {
      state.searchResults.push({
        type: 'Album', name: a.name, subtitle: a.artists?.[0]?.name || '',
        artwork: a.images?.[0]?.url || '', id: a.id, uri: a.uri
      });
    });
  }
  if (data.tracks?.items) {
    data.tracks.items.forEach(t => {
      state.searchResults.push({
        type: 'Song', name: t.name,
        subtitle: t.artists?.map(a => a.name).join(', ') || '',
        artwork: t.album?.images?.[0]?.url || '',
        uri: t.uri, contextUri: t.album?.uri || ''
      });
    });
  }
  if (data.playlists?.items) {
    data.playlists.items.filter(Boolean).forEach(p => {
      state.searchResults.push({
        type: 'Playlist', name: p.name, subtitle: p.owner?.display_name || '',
        artwork: p.images?.[0]?.url || '', uri: p.uri, id: p.id
      });
    });
  }
}

export function formatFollowers(n) {
  if (!n || n === 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return n.toString();
}

// ============ Progress Timer ============

export function startProgressTimer() {
  stopProgressTimer();
  if (!state.isPlaying) return;
  state.progressInterval = setInterval(() => {
    if (state.isPlaying) {
      state.progressMs += 500;
      if (state.progressMs > state.durationMs) state.progressMs = state.durationMs;
      window.dispatchEvent(new CustomEvent('progressTick'));
    }
  }, 500);
}

export function stopProgressTimer() {
  if (state.progressInterval) { clearInterval(state.progressInterval); state.progressInterval = null; }
}



export async function fetchSectionItems(categoryType) {
  try {
    let data;
    switch (categoryType) {
      case 'recents':
        data = await api('/me/player/recently-played?limit=20');
        if (data?.items) {
          const seen = new Set();
          state.currentSection.items = data.items.filter(i => {
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
        state.currentSection.items = state.playlists.filter(p => 
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
          state.currentSection.items = data.items.map(t => ({
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
          state.currentSection.items = data.items.map(a => ({
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
          state.currentSection.items = data.items.map(t => ({
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
          state.currentSection.items = data.items.map(item => ({
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
          state.currentSection.items = data.items.map(item => ({
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
          state.currentSection.items = data.items.map(item => ({
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
        state.currentSection.items = state.playlists.filter(p => 
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
        allItems.push(...state.playlists.map(p => ({
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
        state.currentSection.items = allItems;
        state.currentSection.hasFilters = true;
        state.currentSection.filterOptions = ['all', 'playlists', 'albums', 'artists', 'podcasts'];
        break;
      }

      default:
        state.currentSection.items = [];
    }
  } catch (err) {
    console.error('Fetch section items error:', err);
    state.currentSection.items = [];
  }
}


// Spotify R1 Player - UI Rendering
import { state } from './state.js';
import { startAuth } from './auth.js';
import { playContext, playTrackInContext, api, fetchSectionItems, fetchPlaylistTracks, fetchArtist, fetchAlbumTracks, startProgressTimer, togglePlayback, prevTrack, nextTrack, searchSpotify } from './api.js';

// ============ Main Render ============

export function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  switch (state.currentView) {
    case 'login': renderLogin(app); break;
    case 'home': renderHome(app); break;
    case 'section': renderSection(app); break;
    case 'playlist': renderPlaylist(app); break;
    case 'album': renderAlbum(app); break;
    case 'nowplaying': renderNowPlaying(app); break;
    case 'search': renderSearch(app); break;
    case 'artist': renderArtist(app); break;
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

export function showOnboarding() {
  if (state.onboardingShown) return;
  state.onboardingShown = true;
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
    <button class="filter-btn ${state.homeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
    <button class="filter-btn ${state.homeFilter === 'music' ? 'active' : ''}" data-filter="music">Music</button>
    <button class="filter-btn ${state.homeFilter === 'podcasts' ? 'active' : ''}" data-filter="podcasts">Podcasts</button>
    <button class="filter-btn ${state.homeFilter === 'audiobooks' ? 'active' : ''}" data-filter="audiobooks">Audiobooks</button>
  `;
  filterBar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.homeFilter = btn.dataset.filter;
      render();
    });
  });
  app.appendChild(filterBar);

  const container = document.createElement('div');
  container.className = 'list-container';
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  const filteredSections = state.homeFilter === 'all' 
    ? state.homeSections 
    : state.homeSections.filter(s => s.contentType === state.homeFilter);

  if (filteredSections.length === 0) {
    container.innerHTML = `<div class="empty-state">No content</div>`;
  } else {
    filteredSections.forEach((section, i) => {
      const card = document.createElement('div');
      card.className = `cat-card ${i === state.scrollIndex ? 'focused' : ''}`;
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
  if (state.currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Section View (Content Cards - items within a category) ============

function renderSection(app) {
  if (!state.currentSection) { goBack(); return; }

  const header = createHeader(state.currentSection.title, true);
  app.appendChild(header);

  if (state.currentSection.hasFilters && state.currentSection.filterOptions) {
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    state.currentSection.filterOptions.forEach(f => {
      const btn = document.createElement('button');
      btn.className = `filter-btn ${state.sectionFilter === f ? 'active' : ''}`;
      btn.textContent = capitalize(f);
      btn.addEventListener('click', () => {
        state.sectionFilter = f;
        state.scrollIndex = 0;
        render();
      });
      filterBar.appendChild(btn);
    });
    app.appendChild(filterBar);
  }

  const container = document.createElement('div');
  container.className = 'list-container';
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  let items = state.currentSection.items;
  if (state.currentSection.hasFilters && state.sectionFilter !== 'all') {
    items = items.filter(item => item.filterType === state.sectionFilter);
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading…</div>`;
  } else {
    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === state.scrollIndex ? 'focused' : ''}`;
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
  if (state.currentTrack) app.appendChild(createMiniPlayer());
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
  state.currentSection = { 
    title: section.title, 
    items: [], 
    categoryType: section.categoryType,
    categoryId: section.categoryId
  };
  navigate('section');
  await fetchSectionItems(section.categoryType);
  if (state.currentView === 'section') render();
}

// ============ Playlist View (Content Cards) ============

function renderPlaylist(app) {
  const header = createHeader(truncate(state.selectedPlaylist?.name || 'Playlist', 18), false);
  app.appendChild(header);

  const container = document.createElement('div');
  container.className = 'list-container';
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  if (state.playlistTracks.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading tracks…</div>`;
  } else {
    state.playlistTracks.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === state.scrollIndex ? 'focused' : ''}`;
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
        playTrackInContext(state.selectedPlaylist.uri, track.uri);
        navigate('nowplaying');
      });
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (state.currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Album View (Content Cards) ============

function renderAlbum(app) {
  const header = createHeader(truncate(state.selectedAlbum?.name || 'Album', 18), false);
  app.appendChild(header);

  const container = document.createElement('div');
  container.className = 'list-container';
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  if (state.albumTracks.length === 0) {
    container.innerHTML = `<div class="empty-state">Loading…</div>`;
  } else {
    state.albumTracks.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === state.scrollIndex ? 'focused' : ''}`;
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
        playContext(state.selectedAlbum.uri, i);
        navigate('nowplaying');
      });
      container.appendChild(card);
    });
  }

  app.appendChild(container);
  if (state.currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Artist View ============

function renderArtist(app) {
  if (!state.artistData) { app.innerHTML = `<div class="empty-state">Loading…</div>`; return; }

  const container = document.createElement('div');
  container.className = 'list-container';
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  // Card 0: Full Screen Hero
  const heroCard = document.createElement('div');
  heroCard.className = `artist-hero-card ${state.scrollIndex === 0 ? 'focused' : ''}`;
  heroCard.dataset.idx = 0;
  heroCard.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, #121212 100%), url('${state.artistData.image}')`;
  
  heroCard.innerHTML = `
    <button class="artist-back" id="artist-back">${chevronLeft()}</button>
    <div class="artist-hero-content">
      <div class="artist-name">${truncate(state.artistData.name, 22)}</div>
      <div class="artist-stats">${formatFollowers(state.artistData.followers)} followers</div>
      <div class="artist-actions">
        <button class="artist-play-btn" id="artist-play">${playIcon()} Play</button>
      </div>
    </div>
    <div class="scroll-down-indicator">${chevronDown()}</div>
  `;
  container.appendChild(heroCard);

  // Filter bar (not a scroll index item)
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';
  const filters = ['all', 'popular', 'albums', 'singles', 'appears on', 'related'];
  const a = state.artistData;
  const hasContent = {
    all: true,
    popular: (a.topTracks || []).length > 0,
    albums: (a.albums || []).length > 0,
    singles: (a.singles || []).length > 0,
    'appears on': (a.appearsOn || []).length > 0,
    related: (a.related || []).length > 0
  };
  filters.filter(f => hasContent[f]).forEach(f => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${state.discographyFilter === f ? 'active' : ''}`;
    btn.textContent = capitalize(f);
    btn.addEventListener('click', () => {
      state.discographyFilter = f;
      state.scrollIndex = 0;
      render();
    });
    filterBar.appendChild(btn);
  });
  container.appendChild(filterBar);

  // Content cards (idx 1+)
  let allItems = [];
  if (state.discographyFilter === 'all' || state.discographyFilter === 'popular') {
    (a.topTracks || []).forEach(t => {
      allItems.push({ name: t.name, artist: t.artist, image: t.artwork, type: 'track', uri: t.uri, contextUri: t.contextUri, filterType: 'popular' });
    });
  }
  if (state.discographyFilter === 'all' || state.discographyFilter === 'albums') {
    (a.albums || []).forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'albums' });
    });
  }
  if (state.discographyFilter === 'all' || state.discographyFilter === 'singles') {
    (a.singles || []).forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'singles' });
    });
  }
  if (state.discographyFilter === 'all' || state.discographyFilter === 'appears on') {
    (a.appearsOn || []).forEach(a => {
      allItems.push({ name: a.name, artist: a.year, image: a.image, type: 'album', id: a.id, uri: a.uri, filterType: 'appears on' });
    });
  }
  if (state.discographyFilter === 'all' || state.discographyFilter === 'related') {
    (a.related || []).forEach(a => {
      allItems.push({ name: a.name, artist: '', image: a.image, type: 'artist', id: a.id, uri: a.uri, filterType: 'related' });
    });
  }

  if (allItems.length === 0) {
    container.innerHTML += `<div class="empty-state">No content</div>`;
  } else {
    allItems.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i + 1 === state.scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i + 1;
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
  }

  app.appendChild(container);

  setTimeout(() => {
    document.getElementById('artist-back')?.addEventListener('click', goBack);
    document.getElementById('artist-play')?.addEventListener('click', () => {
      playContext(state.artistData.uri);
      navigate('nowplaying');
    });
  }, 0);

  if (state.currentTrack) app.appendChild(createMiniPlayer());
  scrollFocusedIntoView();
}

// ============ Now Playing View ============

function renderNowPlaying(app) {
  const track = state.currentTrack || { name: 'Not playing', artist: '', album: '', artwork: '' };

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
        <div class="progress-track"><div class="progress-fill" style="width:${state.durationMs ? (state.progressMs / state.durationMs * 100) : 0}%"></div></div>
        <div class="track-time">${formatTime(state.progressMs)} / ${formatTime(state.durationMs)}</div>
      </div>
      <div class="np-controls">
        <button class="ctrl-btn" id="ctrl-prev">${prevIcon()}</button>
        <button class="ctrl-btn ctrl-play" id="ctrl-play">${state.isPlaying ? pauseIcon() : playIcon()}</button>
        <button class="ctrl-btn" id="ctrl-next">${nextIcon()}</button>
      </div>
    </div>
  `;

  document.getElementById('np-back').addEventListener('click', goBack);
  document.getElementById('ctrl-prev').addEventListener('click', prevTrack);
  document.getElementById('ctrl-play').addEventListener('click', togglePlayback);
  document.getElementById('ctrl-next').addEventListener('click', nextTrack);
}

export function updateNowPlaying() {
  if (state.currentView === 'nowplaying') {
    const nameEl = document.querySelector('.np-track-name');
    const artistEl = document.querySelector('.np-track-artist');
    const artEl = document.querySelector('.np-artwork img');
    const playBtn = document.getElementById('ctrl-play');

    if (nameEl && state.currentTrack) nameEl.textContent = truncate(state.currentTrack.name, 26);
    if (artistEl && state.currentTrack) artistEl.textContent = truncate(state.currentTrack.artist, 30);
    if (artEl && state.currentTrack?.artwork) artEl.src = state.currentTrack.artwork;
    if (playBtn) playBtn.innerHTML = state.isPlaying ? pauseIcon() : playIcon();
    updateProgressBar();
  } else {
    const mini = document.querySelector('.mini-player');
    if (mini && state.currentTrack) {
      mini.querySelector('.mini-name').textContent = truncate(state.currentTrack.name, 18);
      const indicator = mini.querySelector('.mini-indicator');
      if (indicator) indicator.textContent = state.isPlaying ? 'PLAYING' : 'PAUSED';
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
  if (state.currentTrack) container.classList.add('with-player');
  container.id = 'list-container';

  if (state.searchResults.length === 0) {
    container.innerHTML = `<div class="empty-state">Type to search</div>`;
  } else {
    updateSearchCards(container);
  }

  app.appendChild(container);
  if (state.currentTrack) app.appendChild(createMiniPlayer());

  const input = document.getElementById('search-input');
  input.focus();
  let searchTimeout;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      state.scrollIndex = 0;
      await searchSpotify(input.value);
      const listEl = document.getElementById('list-container');
      if (listEl) {
        if (state.searchResults.length) {
          updateSearchCards(listEl);
        } else if (input.value) {
          listEl.innerHTML = `<div class="empty-state">No results</div>`;
        } else {
          listEl.innerHTML = `<div class="empty-state">Type to search</div>`;
        }
      }
    }, 350);
  });

  scrollFocusedIntoView();
}

export function updateSearchCards(container) {
  const existingCards = container.querySelectorAll('.content-card');
  
  // If the count doesn't match, fallback to standard render (innerHTML rebuild)
  if (existingCards.length !== state.searchResults.length) {
    container.innerHTML = '';
    if (state.searchResults.length === 0) {
       container.innerHTML = `<div class="empty-state">No results</div>`;
       return;
    }
    state.searchResults.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = `content-card ${i === state.scrollIndex ? 'focused' : ''}`;
      card.dataset.idx = i;
      card.style.backgroundImage = `url('${item.artwork}')`;
      card.innerHTML = `
        <div class="content-card-overlay"></div>
        <div class="content-card-content">
          <div class="content-card-labels">
            <div class="content-card-name">${item.name}</div>
            <div class="content-card-sub">
              ${item.subtitle ? `<span>${item.type}</span><span class="dot">·</span><span>${item.subtitle}</span>` : `<span>${item.type}</span>`}
            </div>
          </div>
          ${chevronRight()}
        </div>
      `;
      card.addEventListener('click', () => handleSearchItemClick(item));
      container.appendChild(card);
    });
    return;
  }

  // High performance path: Recycle existing DOM nodes
  state.searchResults.forEach((item, i) => {
    const card = existingCards[i];
    card.className = `content-card ${i === state.scrollIndex ? 'focused' : ''}`;
    card.dataset.idx = i;
    card.style.backgroundImage = `url('${item.artwork}')`;
    card.querySelector('.content-card-name').textContent = item.name;
    
    const subEl = card.querySelector('.content-card-sub');
    subEl.innerHTML = item.subtitle 
      ? `<span>${item.type}</span><span class="dot">·</span><span>${item.subtitle}</span>` 
      : `<span>${item.type}</span>`;
      
    card.onclick = () => handleSearchItemClick(state.searchResults[i]);
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
  if (state.viewStack.length > 0) {
    leftBtn = `<button class="header-btn back-btn" id="header-back">${chevronLeft()}</button>`;
  } else {
    leftBtn = `<div class="header-logo">${spotifyIcon()}</div>`;
  }

  let rightBtn = '';
  if (showSearch) {
    const isSearchView = state.currentView === 'search';
    rightBtn = `<button class="header-btn ${isSearchView ? 'disabled' : ''}" id="header-search">${searchIcon()}</button>`;
  }

  header.innerHTML = `${leftBtn}<div class="header-title">${title}</div>${rightBtn}`;

  setTimeout(() => {
    const backBtn = document.getElementById('header-back');
    if (backBtn) backBtn.addEventListener('click', goBack);
    const searchBtn = document.getElementById('header-search');
    if (searchBtn && state.currentView !== 'search') {
      searchBtn.addEventListener('click', () => navigate('search'));
    }
  }, 0);

  return header;
}

function createMiniPlayer() {
  const mini = document.createElement('div');
  mini.className = 'mini-player';
  mini.innerHTML = `
    <img class="mini-art" src="${state.currentTrack?.artwork || ''}" alt="">
    <div class="mini-info">
      <div class="mini-name">${truncate(state.currentTrack?.name || '', 18)}</div>
    </div>
    <div class="mini-indicator">${state.isPlaying ? 'PLAYING' : 'PAUSED'}</div>
  `;
  mini.addEventListener('click', () => navigate('nowplaying'));
  return mini;
}

// ============ Navigation ============

export function navigate(view) {
  state.viewStack.push({ view: state.currentView, scrollIndex: state.scrollIndex });
  state.currentView = view;
  state.scrollIndex = 0;
  render();
}

export function goBack() {
  if (state.viewStack.length > 0) {
    const prev = state.viewStack.pop();
    state.currentView = prev.view;
    state.scrollIndex = prev.scrollIndex || 0;
  } else {
    state.currentView = 'home';
    state.scrollIndex = 0;
  }
  render();
}

async function openPlaylist(pl, idx) {
  state.selectedPlaylist = pl;
  state.playlistTracks = [];
  navigate('playlist');
  await fetchPlaylistTracks(pl.id);
  if (state.currentView === 'playlist') render();
}

async function openPlaylistById(id, name, uri) {
  state.selectedPlaylist = { id, name, uri };
  state.playlistTracks = [];
  navigate('playlist');
  await fetchPlaylistTracks(id);
  if (state.currentView === 'playlist') render();
}

async function openArtist(artistId) {
  state.artistData = null;
  state.discographyFilter = 'all';
  navigate('artist');
  await fetchArtist(artistId);
  if (state.currentView === 'artist') render();
}

async function openAlbum(albumId) {
  state.albumTracks = [];
  state.selectedAlbum = null;
  navigate('album');
  await fetchAlbumTracks(albumId);
  if (state.currentView === 'album') render();
}

// ============ List Scroll Management ============

export function scrollFocusedIntoView() {
  const container = document.getElementById('list-container');
  if (!container) return;

  const items = container.querySelectorAll('.cat-card, .content-card, .artist-hero-card');
  if (items.length === 0) return;

  items.forEach((item, i) => item.classList.toggle('focused', i === state.scrollIndex));

  const focusedItem = items[state.scrollIndex];
  if (!focusedItem) return;

  const containerRect = container.getBoundingClientRect();
  const itemRect = focusedItem.getBoundingClientRect();
  
  // Bulletproof calculation for mixed-height cards
  const itemTop = (itemRect.top - containerRect.top) + container.scrollTop;
  const targetScroll = itemTop + (itemRect.height / 2) - (containerRect.height / 2);

  container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
}

export function getListLength() {
  if (state.currentView === 'home') {
    const filtered = state.homeFilter === 'all' ? state.homeSections : state.homeSections.filter(s => s.contentType === state.homeFilter);
    return filtered.length;
  }
  if (state.currentView === 'section') {
    if (!state.currentSection) return 0;
    let items = state.currentSection.items;
    if (state.currentSection.hasFilters && state.sectionFilter !== 'all') {
      items = items.filter(item => item.filterType === state.sectionFilter);
    }
    return items.length;
  }
  if (state.currentView === 'playlist') return state.playlistTracks.length;
  if (state.currentView === 'album') return state.albumTracks.length;
  if (state.currentView === 'search') return state.searchResults.length;
  if (state.currentView === 'artist') {
    if (!state.artistData) return 0;
    let count = 1; // hero card
    const d = state.discographyFilter;
    const a = state.artistData;
    if (d === 'all' || d === 'popular') count += (a.topTracks || []).length;
    if (d === 'all' || d === 'albums') count += (a.albums || []).length;
    if (d === 'all' || d === 'singles') count += (a.singles || []).length;
    if (d === 'all' || d === 'appears on') count += (a.appearsOn || []).length;
    if (d === 'all' || d === 'related') count += (a.related || []).length;
    return count;
  }
  if (state.currentView === 'discography') {
    if (!state.artistData) return 0;
    let count = 0;
    if (state.discographyFilter === 'all' || state.discographyFilter === 'popular') count += (state.artistData.topTracks || []).length;
    if (state.discographyFilter === 'all' || state.discographyFilter === 'albums') count += (state.artistData.albums || []).length;
    if (state.discographyFilter === 'all' || state.discographyFilter === 'singles') count += (state.artistData.singles || []).length;
    if (state.discographyFilter === 'all' || state.discographyFilter === 'appears on') count += (state.artistData.appearsOn || []).length;
    if (state.discographyFilter === 'all' || state.discographyFilter === 'related') count += (state.artistData.related || []).length;
    return count;
  }
  return 0;
}

// ============ Toast Messages ============

export function showToast(msg, type = 'info') {
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

export function triggerHaptic() {
  // Try to trigger a crisp 10ms vibration. Fails silently if unsupported or disabled.
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(10);
    } catch (e) {}
  }
}

export function updateProgressBar() {
  const bar = document.querySelector('.progress-fill');
  if (bar && state.durationMs > 0) {
    bar.style.width = `${(state.progressMs / state.durationMs) * 100}%`;
  }
  const timeEl = document.querySelector('.track-time');
  if (timeEl) {
    timeEl.textContent = `${formatTime(state.progressMs)} / ${formatTime(state.durationMs)}`;
  }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

let volumeToastTimeout = null;
export function showVolumeToast() {
  let toast = document.querySelector('.volume-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'volume-toast';
    document.getElementById('app').appendChild(toast);
  }
  toast.innerHTML = `
    <div class="vol-track-sm"><div class="vol-fill-sm" style="width:${state.volume * 100}%"></div></div>
    <span class="vol-pct-sm">${Math.round(state.volume * 100)}%</span>
  `;
  toast.classList.add('visible');

  if (volumeToastTimeout) clearTimeout(volumeToastTimeout);
  volumeToastTimeout = setTimeout(() => toast.classList.remove('visible'), 1200);
}

function formatFollowers(n) {
  if (!n || n === 0) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return n.toString();
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

// NTS Radio R1 Plugin
const NTS_API = 'https://www.nts.live/api/v2/live';
const STREAMS = {
  1: 'https://stream-relay-geo.ntslive.net/stream',
  2: 'https://stream-relay-geo.ntslive.net/stream2'
};

const MIXTAPES = [
  { id: 'mx-poolside', name: 'Poolside', desc: 'Balearic, boogie, and sophisti-pop for poolsides, beaches and car stereos.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape4', artwork: 'https://media3.ntslive.co.uk/resize/200x200/cf5afb01-5a68-4fa0-a1c6-415b35d09ed6_1542931200.jpeg' },
  { id: 'mx-slow-focus', name: 'Slow Focus', desc: 'Meditative, relaxing and beatless: ambient, drone and ragas.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape', artwork: 'https://media3.ntslive.co.uk/resize/200x200/01f7cbe6-235f-4e33-8f2f-70152c91edf1_1542931200.jpeg' },
  { id: 'mx-low-key', name: 'Low Key', desc: 'Keeping it simple with lo-fi hip-hop and smooth R\'n\'B.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape2', artwork: 'https://media3.ntslive.co.uk/resize/200x200/b667c612-1ef6-4bfd-ae87-0cec0a19629d_1626307200.jpeg' },
  { id: 'mx-memory-lane', name: 'Memory Lane', desc: 'Turn on, tune in, drop out.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape6', artwork: 'https://media3.ntslive.co.uk/resize/200x200/f889399d-6277-46e2-9be9-840bbdd25cc5_1560470400.jpeg' },
  { id: 'mx-4-to-the-floor', name: '4 To The Floor', desc: 'House and techno from past to present.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape5', artwork: 'https://media3.ntslive.co.uk/resize/200x200/c3bad52d-418b-4bf6-aff5-eea3b9ff1186_1542931200.jpeg' },
  { id: 'mx-island-time', name: 'Island Time', desc: 'Easy skanking – reggae, dub, and plenty more.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape21', artwork: 'https://media3.ntslive.co.uk/resize/200x200/68541b02-903c-4caf-bba2-538d0b9bfedc_1590451200.jpeg' },
  { id: 'mx-the-tube', name: 'The Tube', desc: 'Oddball post-punk, industrial provocation, and minimal wave.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape26', artwork: 'https://media3.ntslive.co.uk/resize/200x200/f3657c6b-aa6b-4ad9-9c12-d9e9cbe7f68d_1626220800.jpeg' },
  { id: 'mx-sheet-music', name: 'Sheet Music', desc: 'The best of classical and contemporary composition.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape35', artwork: 'https://media3.ntslive.co.uk/resize/200x200/fe3dc346-2549-44cc-96c7-c3117056aa74_1668038400.jpeg' },
  { id: 'mx-feelings', name: 'Feelings', desc: 'Sweet soul, gospel, boogie, and beyond.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape27', artwork: 'https://media3.ntslive.co.uk/resize/200x200/53026366-cf7c-4a57-af5c-c894d2375dc6_1626220800.jpeg' },
  { id: 'mx-expansions', name: 'Expansions', desc: 'Jazz and its many mind-expanding variations.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape3', artwork: 'https://media3.ntslive.co.uk/resize/200x200/acc3ad65-05bd-495d-90cb-f5d81221464b_1542931200.jpeg' },
  { id: 'mx-rap-house', name: 'Rap House', desc: '808s and champagne.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape22', artwork: 'https://media3.ntslive.co.uk/resize/200x200/916a2aa3-dcc5-4eb6-abea-b2f1914fb49a_1590451200.jpeg' },
  { id: 'mx-labyrinth', name: 'Labyrinth', desc: 'Enter the void.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape31', artwork: 'https://media3.ntslive.co.uk/resize/200x200/4ce92a36-4942-4f35-9cc4-1d3e6c2be746_1638230400.jpeg' },
  { id: 'mx-sweat', name: 'Sweat', desc: 'A new wave of international party music.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape24', artwork: 'https://media3.ntslive.co.uk/resize/200x200/f0c77a19-670b-4979-ac6e-e93f6089b5bc_1622592000.png' },
  { id: 'mx-otaku', name: 'Otaku', desc: 'Video game and anime soundtracks, for fanboys and fangirls.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape36', artwork: 'https://media3.ntslive.co.uk/resize/200x200/0c693fdb-544c-4b85-9679-3268afa3a273_1668038400.jpeg' },
  { id: 'mx-the-pit', name: 'The Pit', desc: 'Behold the songs of the ancient metal bards.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape34', artwork: 'https://media3.ntslive.co.uk/resize/200x200/9c9efb53-ce34-4a5e-997b-f8251be464a1_1668038400.jpeg' },
  { id: 'mx-field-recordings', name: 'Field Recordings', desc: 'Natural ambience from NTS listeners around the world.', stream: 'https://stream-mixtape-geo.ntslive.net/mixtape23', artwork: 'https://media3.ntslive.co.uk/resize/200x200/807d8db6-049d-4eeb-8515-57c02b251e73_1622592000.png' }
];

let audio = null;
let currentStation = null; // station id (1, 2) or mixtape id ('mx-...')
let volume = 0.7;
let stations = [];
let isPlaying = false;
let currentTab = 'live'; // 'live' or 'mixtapes'
let mixtapeScrollIndex = 0;
let visualizerInterval = null;

// ============ Storage ============

async function saveVolume(vol) {
  if (window.creationStorage) {
    try {
      await window.creationStorage.plain.setItem('nts_volume', btoa(JSON.stringify(vol)));
    } catch (e) {}
  } else {
    localStorage.setItem('nts_volume', JSON.stringify(vol));
  }
}

async function loadVolume() {
  if (window.creationStorage) {
    try {
      const stored = await window.creationStorage.plain.getItem('nts_volume');
      if (stored) return JSON.parse(atob(stored));
    } catch (e) {}
  } else {
    const stored = localStorage.getItem('nts_volume');
    if (stored) return JSON.parse(stored);
  }
  return 0.7;
}

// ============ NTS API ============

async function fetchShowData() {
  try {
    const res = await fetch(NTS_API);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    const results = data.results || [];

    stations = results.map((ch, idx) => {
      const now = ch.now || {};
      const details = now.embeds?.details || {};
      const media = details.media || {};
      const genres = (details.genres || []).map(g => g.value);

      return {
        id: parseInt(ch.channel_name) || (idx + 1),
        name: `NTS ${ch.channel_name}`,
        title: now.broadcast_title || 'Live',
        description: details.description || '',
        location: details.location_long || '',
        artwork: media.picture_medium || media.picture_large || '',
        artworkLarge: media.picture_large || media.picture_medium || '',
        genres: genres,
        startTime: now.start_timestamp || '',
        endTime: now.end_timestamp || ''
      };
    });
  } catch (e) {
    if (stations.length === 0) {
      stations = [
        { id: 1, name: 'NTS 1', title: 'NTS Radio 1', description: 'Live from London', location: 'London', artwork: '', artworkLarge: '', genres: [], startTime: '', endTime: '' },
        { id: 2, name: 'NTS 2', title: 'NTS Radio 2', description: 'Live from London', location: 'London', artwork: '', artworkLarge: '', genres: [], startTime: '', endTime: '' }
      ];
    }
    showToast('Could not load show info.', 'error');
  }
  render();
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

// ============ Main Render ============

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.className = '';

  // Header
  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `
    <svg class="logo" viewBox="0 0 26 26" fill="currentColor"><path d="M22.7 6.9L22.3 9h-1.5l.5-2c.1-.6.1-1.1-.6-1.1s-1 .5-1.1 1.1l-.4 1.7c-.1.5-.1 1 0 1.5l1.4 4.1c.2.6.3 1.3.1 2l-.6 2.6c-.4 1.5-1.5 2.4-2.9 2.4-1.6 0-2.3-.7-1.9-2.4l.5-2.2h1.5l-.5 2.1c-.2.8 0 1.2.7 1.2.6 0 1-.5 1.2-1.2l.5-2.3c.1-.5.1-1.1-.1-1.6l-1.3-3.8c-.2-.7-.3-1.2-.2-2.1l.4-2c.4-1.6 1.4-2.4 2.9-2.4 1.7 0 2.2.8 1.8 2.3zM11.2 21.1L14.6 6H13l.3-1.3h4.8L17.8 6h-1.7l-3.4 15.1h-1.5zm-4.5 0L8.1 6.6 4.8 21.1H3.5L7.2 4.8h2.2L8 18.7l3.2-14h1.3L8.8 21.1H6.7zM0 26h26V0H0v26z"/></svg>
    <div class="nav-tabs">
      <button class="nav-tab ${currentTab === 'live' ? 'active' : ''}" data-tab="live"><span class="live-dot"></span>LIVE</button>
      <button class="nav-tab ${currentTab === 'mixtapes' ? 'active' : ''}" data-tab="mixtapes">MIXTAPES</button>
    </div>
  `;
  app.appendChild(header);
  header.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      render();
    });
  });

  // Content
  if (currentTab === 'live') {
    renderLive(app);
  } else {
    renderMixtapes(app);
  }

  if (isPlaying) startVisualizer();
}

// ============ Render Live ============

function renderLive(app) {
  const list = document.createElement('div');
  list.className = 'station-list';

  const activeStation = isPlaying && typeof currentStation === 'number'
    ? stations.find(s => s.id === currentStation)
    : null;

  stations.forEach(station => {
    const isActive = activeStation && activeStation.id === station.id;
    const card = document.createElement('div');
    card.className = `station-card ${isActive ? 'expanded' : ''}`;

    const artUrl = station.artworkLarge || station.artwork;
    if (artUrl) {
      card.style.backgroundImage = `url(${artUrl})`;
    }

    // Gradient overlay
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    // Top info: station name + show title
    const topInfo = document.createElement('div');
    topInfo.className = 'card-top';
    topInfo.innerHTML = `
      <div class="card-station-name">${station.name}</div>
      <div class="card-title">${station.title}</div>
    `;
    overlay.appendChild(topInfo);

    // Play/pause button centered on art
    const playBtn = document.createElement('button');
    playBtn.className = 'card-play-btn';
    playBtn.innerHTML = (currentStation === station.id && isPlaying) ? pauseIcon() : playIcon();
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay(station.id);
    });
    overlay.appendChild(playBtn);

    // Bottom info: description (only show on expanded/active card)
    if (station.description && isActive) {
      const bottomInfo = document.createElement('div');
      bottomInfo.className = 'card-bottom expanded';
      bottomInfo.innerHTML = `<div class="card-desc">${truncate(station.description, 120)}</div>`;
      overlay.appendChild(bottomInfo);
    }

    // Visualizer on active card
    if (isActive) {
      const vizEl = document.createElement('div');
      vizEl.className = 'card-visualizer';
      vizEl.innerHTML = createVisualizerBars();
      overlay.appendChild(vizEl);
    }

    card.appendChild(overlay);
    card.addEventListener('click', () => togglePlay(station.id));
    list.appendChild(card);
  });

  app.appendChild(list);
}

// ============ Render Mixtapes ============

function renderMixtapes(app) {
  const container = document.createElement('div');
  container.className = 'mixtape-container';

  // Show 3 visible at a time, centered on current
  const visibleCount = 3;
  const startIdx = Math.max(0, mixtapeScrollIndex - 1);

  for (let i = startIdx; i < Math.min(MIXTAPES.length, startIdx + visibleCount); i++) {
    const mx = MIXTAPES[i];
    const isCurrent = i === mixtapeScrollIndex;
    const isPlayingThis = currentStation === mx.id && isPlaying;

    const card = document.createElement('div');
    card.className = `mixtape-card ${isCurrent ? 'focused' : ''} ${isPlayingThis ? 'playing' : ''}`;
    card.style.backgroundImage = `url(${mx.artwork})`;

    const overlay = document.createElement('div');
    overlay.className = 'mixtape-overlay';

    if (isCurrent) {
      const playBtn = document.createElement('button');
      playBtn.className = 'card-play-btn';
      playBtn.innerHTML = isPlayingThis ? pauseIcon() : playIcon();
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMixtapePlay(mx.id);
      });
      overlay.appendChild(playBtn);
    }

    const info = document.createElement('div');
    info.className = 'mixtape-info';
    info.innerHTML = `
      <div class="mixtape-name">${mx.name}</div>
      ${isCurrent ? `<div class="mixtape-desc">${mx.desc}</div>` : ''}
    `;
    overlay.appendChild(info);

    card.appendChild(overlay);
    card.addEventListener('click', () => {
      mixtapeScrollIndex = i;
      toggleMixtapePlay(mx.id);
    });
    container.appendChild(card);
  }

  // Scroll indicator
  const indicator = document.createElement('div');
  indicator.className = 'scroll-indicator';
  indicator.textContent = `${mixtapeScrollIndex + 1} / ${MIXTAPES.length}`;
  container.appendChild(indicator);

  app.appendChild(container);
}

// ============ Volume UI (floating toast) ============

let volumeToastTimeout = null;

function showVolumeToast() {
  let toast = document.querySelector('.volume-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'volume-toast';
    document.getElementById('app').appendChild(toast);
  }
  toast.innerHTML = `<span class="vol-icon-sm">${volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔇'}</span><div class="vol-track-sm"><div class="vol-fill-sm" style="width:${volume * 100}%"></div></div><span class="vol-pct-sm">${Math.round(volume * 100)}%</span>`;
  toast.classList.add('visible');

  if (volumeToastTimeout) clearTimeout(volumeToastTimeout);
  volumeToastTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 1500);
}

// ============ Visualizer ============

function createVisualizerBars() {
  return `<div class="viz-bar"></div><div class="viz-bar"></div><div class="viz-bar"></div><div class="viz-bar"></div><div class="viz-bar"></div>`;
}

function startVisualizer() {
  stopVisualizer();
  visualizerInterval = setInterval(() => {
    const bars = document.querySelectorAll('.viz-bar');
    bars.forEach(bar => {
      const h = Math.random() * 80 + 20;
      bar.style.height = h + '%';
    });
  }, 200);
}

function stopVisualizer() {
  if (visualizerInterval) {
    clearInterval(visualizerInterval);
    visualizerInterval = null;
  }
}

// ============ Audio Playback ============

function getStreamUrl(stationId) {
  if (typeof stationId === 'number') {
    return STREAMS[stationId];
  }
  const mx = MIXTAPES.find(m => m.id === stationId);
  return mx ? mx.stream : null;
}

function togglePlay(stationId) {
  if (currentStation === stationId && isPlaying) {
    stopPlayback();
    render();
  } else {
    startPlayback(stationId);
  }
}

function toggleMixtapePlay(mixtapeId) {
  if (currentStation === mixtapeId && isPlaying) {
    stopPlayback();
    render();
  } else {
    startPlayback(mixtapeId);
  }
}

function startPlayback(stationId) {
  stopPlayback();
  const streamUrl = getStreamUrl(stationId);
  if (!streamUrl) {
    showToast('Stream not available.', 'error');
    return;
  }

  audio = new Audio();
  audio.volume = volume;
  audio.preload = 'none';
  audio.src = streamUrl;

  audio.addEventListener('error', () => {
    const mediaError = audio.error;
    let errorMsg = 'Stream playback failed.';
    if (mediaError) {
      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED: errorMsg = 'Playback aborted.'; break;
        case MediaError.MEDIA_ERR_NETWORK: errorMsg = 'Network error.'; break;
        case MediaError.MEDIA_ERR_DECODE: errorMsg = 'Decode error.'; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'Stream unavailable.'; break;
      }
    }
    showToast(errorMsg, 'error');
    isPlaying = false;
    currentStation = null;
    stopVisualizer();
    render();
  });

  audio.addEventListener('stalled', () => {
    showToast('Buffering…', 'warning');
  });

  audio.play().then(() => {
    isPlaying = true;
    currentStation = stationId;
    render();
    startVisualizer();
  }).catch((err) => {
    let errorMsg = 'Could not start playback.';
    if (err.name === 'NotAllowedError') errorMsg = 'Tap to start audio.';
    else if (err.name === 'NotSupportedError') errorMsg = 'Audio not supported.';
    else if (err.name === 'AbortError') errorMsg = 'No audio output.';
    showToast(errorMsg, 'error');
    isPlaying = false;
    currentStation = null;
    stopVisualizer();
    render();
  });
}

function stopPlayback() {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  isPlaying = false;
  stopVisualizer();
}

// ============ Toast Messages ============

function showToast(msg, type = 'info') {
  let errEl = document.querySelector('.toast');
  if (errEl) errEl.remove();
  errEl = document.createElement('div');
  errEl.className = `toast toast-${type}`;
  errEl.textContent = msg;
  document.getElementById('app').appendChild(errEl);
  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => { if (errEl.parentNode) errEl.remove(); }, duration);
}

// ============ Volume & Scroll Control ============

function adjustVolume(delta) {
  volume = Math.max(0, Math.min(1, volume + delta));
  if (audio) audio.volume = volume;
  saveVolume(volume);
  showVolumeToast();
}

function handleScrollUp() {
  if (isPlaying) {
    adjustVolume(0.05);
  } else if (currentTab === 'mixtapes') {
    mixtapeScrollIndex = Math.max(0, mixtapeScrollIndex - 1);
    render();
  }
}

function handleScrollDown() {
  if (isPlaying) {
    adjustVolume(-0.05);
  } else if (currentTab === 'mixtapes') {
    mixtapeScrollIndex = Math.min(MIXTAPES.length - 1, mixtapeScrollIndex + 1);
    render();
  }
}

// ============ Icons ============

function playIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>`;
}

function pauseIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`;
}

// ============ Touch Scroll with Momentum & Easing ============

let touchStartY = 0;
let touchStartX = 0;
let touchLastY = 0;
let touchLastTime = 0;
let touchVelocity = 0;
let touchAccumulated = 0;
let momentumRAF = null;
let easingRAF = null;
const TOUCH_STEP_PX = 50; // pixels of drag per scroll step

// Easing function: ease-out-cubic
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function cancelMomentum() {
  if (momentumRAF) {
    cancelAnimationFrame(momentumRAF);
    momentumRAF = null;
  }
  if (easingRAF) {
    cancelAnimationFrame(easingRAF);
    easingRAF = null;
  }
}

// Smooth eased scroll transition
function smoothScrollStep(direction) {
  const duration = 150; // ms
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    
    if (progress >= 1) {
      if (direction > 0) handleScrollDown();
      else handleScrollUp();
      easingRAF = null;
    } else {
      easingRAF = requestAnimationFrame(animate);
    }
  }
  
  // Fire immediately, then animate
  if (direction > 0) handleScrollDown();
  else handleScrollUp();
  
  easingRAF = requestAnimationFrame(animate);
}

document.addEventListener('touchstart', (e) => {
  cancelMomentum();
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchLastY = touchStartY;
  touchLastTime = Date.now();
  touchVelocity = 0;
  touchAccumulated = 0;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  const y = e.touches[0].clientY;
  const now = Date.now();
  const dt = now - touchLastTime;

  // Track velocity (px/ms)
  if (dt > 0) {
    touchVelocity = (touchLastY - y) / dt;
  }

  // Accumulate drag distance and fire scroll steps with easing
  touchAccumulated += (touchLastY - y);
  while (Math.abs(touchAccumulated) >= TOUCH_STEP_PX) {
    if (touchAccumulated > 0) {
      handleScrollDown();
      touchAccumulated -= TOUCH_STEP_PX;
    } else {
      handleScrollUp();
      touchAccumulated += TOUCH_STEP_PX;
    }
  }

  touchLastY = y;
  touchLastTime = now;
}, { passive: true });

document.addEventListener('touchend', () => {
  // Apply momentum based on release velocity with easing
  const releaseVelocity = touchVelocity; // px/ms
  if (Math.abs(releaseVelocity) < 0.05) return; // very low threshold for momentum

  let vel = releaseVelocity * 30; // more aggressive momentum multiplier
  let accum = 0;
  const friction = 0.95; // less friction for longer coasting
  const startVel = vel;
  let frameCount = 0;

  function momentumStep() {
    frameCount++;
    const decayProgress = Math.min(frameCount / 40, 1); // 40 frames to full decay
    const easedFriction = 1 - (1 - friction) * easeOutCubic(decayProgress);
    
    accum += vel;
    while (Math.abs(accum) >= TOUCH_STEP_PX) {
      if (accum > 0) {
        handleScrollDown();
        accum -= TOUCH_STEP_PX;
      } else {
        handleScrollUp();
        accum += TOUCH_STEP_PX;
      }
    }
    vel *= easedFriction;
    if (Math.abs(vel) > 0.1) { // lower cutoff for longer scrolling
      momentumRAF = requestAnimationFrame(momentumStep);
    }
  }
  momentumRAF = requestAnimationFrame(momentumStep);
}, { passive: true });

// ============ R1 Hardware Events ============

window.addEventListener('scrollUp', handleScrollUp);
window.addEventListener('scrollDown', handleScrollDown);

window.addEventListener('sideClick', () => {
  if (currentStation && isPlaying) {
    stopPlayback();
    render();
  } else if (currentTab === 'live' && stations.length > 0) {
    togglePlay(currentStation || 1);
  } else if (currentTab === 'mixtapes') {
    toggleMixtapePlay(MIXTAPES[mixtapeScrollIndex].id);
  }
});

// ============ Init ============

document.addEventListener('DOMContentLoaded', async () => {
  volume = await loadVolume();
  await fetchShowData();

  // Refresh show data every 2 minutes
  setInterval(fetchShowData, 120000);

  // Dev keyboard fallback
  if (typeof PluginMessageHandler === 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); window.dispatchEvent(new CustomEvent('sideClick')); }
      if (e.code === 'ArrowUp') { e.preventDefault(); window.dispatchEvent(new CustomEvent('scrollUp')); }
      if (e.code === 'ArrowDown') { e.preventDefault(); window.dispatchEvent(new CustomEvent('scrollDown')); }
      if (e.code === 'ArrowLeft') { currentTab = 'live'; render(); }
      if (e.code === 'ArrowRight') { currentTab = 'mixtapes'; render(); }
    });
  }
});

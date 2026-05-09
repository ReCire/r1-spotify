// Spotify R1 Player - Entry Point
import { state } from './state.js';
import { loadToken, refreshToken, startAuth, handleCallback, loadVolume } from './auth.js';
import { fetchPlaylists, fetchHomeSections, initPlayer, togglePlayback, nextTrack, prevTrack, adjustVolume } from './api.js';
import { render, navigate, goBack, scrollFocusedIntoView, getListLength, showOnboarding, updateNowPlaying, updateProgressBar, showVolumeToast, triggerHaptic } from './ui.js';

// ============ R1 Hardware Events ============

window.addEventListener('scrollUp', () => handleScroll(-1, true));
window.addEventListener('scrollDown', () => handleScroll(1, true));

let lastScrollTime = 0;
const SCROLL_COOLDOWN = 120; // 120ms cooldown for hardware wheel

function handleScroll(dir, isHardware = false) {
  const now = Date.now();
  if (isHardware && now - lastScrollTime < SCROLL_COOLDOWN) return;
  if (isHardware) lastScrollTime = now;

  if (state.currentView === 'nowplaying') {
    adjustVolume(dir * -0.05);
    triggerHaptic(); 
  } else {
    const maxIdx = getListLength() - 1;
    if (maxIdx < 0) return;

    const prevIndex = state.scrollIndex;
    state.scrollIndex = Math.max(0, Math.min(maxIdx, state.scrollIndex + dir));

    if (prevIndex !== state.scrollIndex) {
      triggerHaptic();
      scrollFocusedIntoView();
    }
  }
}

window.addEventListener('sideClick', () => {
  if (state.currentView === 'login') {
    startAuth();
  } else if (state.currentView === 'nowplaying') {
    togglePlayback();
  } else if (state.currentView === 'artist') {
    const focused = document.querySelector('.artist-hero-card.focused, .cat-card.focused, .content-card.focused');
    if (focused) focused.click();
  } else if (state.currentView === 'popular-tracks') {
    const focused = document.querySelector('.content-card.focused');
    if (focused) focused.click();
  } else if (state.currentView === 'discography') {
    const focused = document.querySelector('.content-card.focused');
    if (focused) focused.click();
  } else {
    const focused = document.querySelector('.cat-card.focused, .content-card.focused');
    if (focused) focused.click();
  }
});

// ============ Custom Event Listeners ============

window.addEventListener('playerStateChanged', () => {
  updateNowPlaying();
});

window.addEventListener('authError', () => {
  render(); // Re-render to show the login view safely
});

window.addEventListener('progressTick', () => {
  updateProgressBar();
});

window.addEventListener('volumeChanged', () => {
  showVolumeToast();
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
  if (state.currentView === 'login' || state.currentView === 'nowplaying') return;
  const y = e.touches[0].clientY;
  touchAccumulated += (touchLastY - y);

  while (Math.abs(touchAccumulated) >= TOUCH_STEP_PX) {
    if (touchAccumulated > 0) {
      handleScroll(1, false);
      touchAccumulated -= TOUCH_STEP_PX;
    } else {
      handleScroll(-1, false);
      touchAccumulated += TOUCH_STEP_PX;
    }
  }
  touchLastY = y;
}, { passive: true });

document.addEventListener('wheel', (e) => {
  if (state.currentView === 'login') return;
  e.preventDefault();
  touchAccumulated += e.deltaY;
  while (Math.abs(touchAccumulated) >= TOUCH_STEP_PX) {
    if (touchAccumulated > 0) {
      handleScroll(1, false);
      touchAccumulated -= TOUCH_STEP_PX;
    } else {
      handleScroll(-1, false);
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
    if (dx > 0 && state.viewStack.length > 0) goBack();
    else if (dx < 0 && state.currentView === 'home') navigate('search');
  }
}, { passive: true });

// ============ Init ============

document.addEventListener('DOMContentLoaded', async () => {
  state.volume = await loadVolume();

  // Check onboarding state
  try { state.onboardingShown = !!localStorage.getItem('spotify_onboarded'); } catch (e) {}

  // Check for OAuth callback
  const callbackHandled = await handleCallback();

  if (!callbackHandled) {
    const stored = await loadToken();
    if (stored && stored.token && Date.now() < stored.expiry) {
      state.accessToken = stored.token;
      state.tokenExpiry = stored.expiry;
    } else if (stored && stored.refresh) {
      const refreshed = await refreshToken();
      if (!refreshed) { state.currentView = 'login'; render(); return; }
    } else {
      state.currentView = 'login';
      render();
      return;
    }
  }

  // Authenticated — show home
  state.currentView = 'home';
  render();
  initPlayer();

  // Fetch data in parallel
  await fetchPlaylists();
  await fetchHomeSections();
  render();

  // Show onboarding on first launch
  if (!state.onboardingShown) {
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

// Spotify R1 Player - State Management
// ============ Configuration ============

export const CONFIG = {
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

export const state = {
  accessToken: null,
  tokenExpiry: 0,
  player: null,
  deviceId: null,
  currentView: 'login',
  isPlaying: false,
  currentTrack: null,
  progressMs: 0,
  durationMs: 0,
  volume: 0.7,
  playlists: [],
  playlistTracks: [],
  searchResults: [],
  scrollIndex: 0,
  selectedPlaylist: null,
  progressInterval: null,
  viewStack: [],
  homeSections: [],
  homeFilter: 'all',
  sectionFilter: 'all',
  discographyFilter: 'all',
  artistData: null,
  artistDiscography: null,
  albumTracks: [],
  selectedAlbum: null,
  onboardingShown: false,
  currentSection: null
};

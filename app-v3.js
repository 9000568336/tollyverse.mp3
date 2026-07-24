// ============================================================
//  tollyverse.mp3 — Customer App Core Logic
//  • No login required to browse / listen
//  • Login required only to: rate, save to playlist
// ============================================================

window.onerror = function(message, source, lineno, colno, error) {
  console.error('JS Error:', message, source, lineno, colno, error);
  return true;
};

let currentUser   = null;
let allSongs      = [];
let currentSongId = null;
let userRatings   = {};
let userPlaylists = [];
let userPreferences = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.search.includes('reset=1')) {
    localStorage.clear();
    window.location.href = 'app.html';
    return;
  }

  // Hide loading screen safely
  setTimeout(() => {
    const loader = document.getElementById('loadingScreen');
    if (loader) loader.classList.add('hidden');
  }, 1200);

  // Dynamic Greeting
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  const greetEl = document.getElementById('greetingText');
  if (greetEl) {
    greetEl.textContent = `${greeting}! 🎵`;
  }

  try {
    const appShell = document.getElementById('appShell');
    if (appShell) appShell.style.display = 'grid';
    
    const playerBar = document.getElementById('playerBar');
    if (playerBar) playerBar.style.display = 'grid';
  } catch(e) {}

  // 2. Welcome text based on time of day
  try {
    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greetEl = document.getElementById('greetingText') || document.getElementById('welcomeText');
    if (greetEl) greetEl.textContent = `${greeting}! 🎵`;
  } catch(e){}

  // Initialize Realtime Weather & Night/Rain effects
  try {
    initRealtimeWeather();
  } catch(e){}

  // 3. Load songs, Recently Played & Spotify language hits
  try {
    loadSongs();
    renderRecentlyPlayed();
    loadSpotifyLanguageTopSongs('Telugu');
  } catch(e){}

  // 4. Listen for auth changes (if Firebase is loaded)
  try {
    if (typeof auth !== 'undefined') {
      auth.onAuthStateChanged(async user => {
        currentUser = user || null;
        if (typeof loadLocalSearchHistory === 'function') loadLocalSearchHistory();
        if (typeof loadLocalRecentlyPlayed === 'function') loadLocalRecentlyPlayed();
        if (user) {
          closeModal('authModal');
          await loadUserData();
          // Fallback to localStorage if userPreferences is still null
          if (!userPreferences) {
            try {
              userPreferences = JSON.parse(localStorage.getItem(`tv_prefs_${user.uid}`) || 'null');
            } catch (e) {}
          }
          setLoggedInUI(user);
          if (!userPreferences) {
            document.getElementById('onboardingModal').classList.add('open');
          } else {
            document.getElementById('onboardingModal').classList.remove('open');
            loadSongs();
          }
        } else {
          userPreferences = null;
          document.getElementById('onboardingModal').classList.remove('open');
          setGuestUI();
        }
      });
    } else {
      setGuestUI();
    }
  } catch(e){
    setGuestUI();
  }
});

// ── Logged-in UI ──────────────────────────────────────────────
function setLoggedInUI(user) {
  closeModal('authModal');
  const name  = user.displayName || 'Listener';
  const email = user.email || '';
  const photo = 'https://cdn.phototourl.com/free/2026-07-24-805f4af5-d81c-4bb8-ba56-02b2e61a9196.jpg';

  document.getElementById('userName').textContent  = name;
  document.getElementById('userEmail').textContent = email;
  document.getElementById('userAvatar').src        = photo;

  document.getElementById('sidebarUser').style.display  = '';
  document.getElementById('sidebarGuest').style.display = 'none';

  // Toggle topbar elements
  const topbarGuest = document.getElementById('topbarGuest');
  const topbarUser = document.getElementById('topbarUser');
  if (topbarGuest) topbarGuest.style.display = 'none';
  if (topbarUser) {
    topbarUser.style.display = 'flex';
    const avatar = document.getElementById('topbarUserAvatar');
    const uName = document.getElementById('topbarUserName');
    if (avatar) avatar.src = photo;
    if (uName) uName.textContent = name.split(' ')[0];
  }

  // Update welcome greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('greetingText');
  if (greetEl) {
    greetEl.textContent = `${greeting}, ${name.split(' ')[0]}! 🎵`;
  }

  // Update star rating UI (active)
  document.querySelectorAll('#starRating .star').forEach(s => s.style.pointerEvents = '');

  renderPlaylists();
}

// ── Guest UI ──────────────────────────────────────────────────
function setGuestUI() {
  document.getElementById('sidebarUser').style.display  = 'none';
  document.getElementById('sidebarGuest').style.display = '';

  // Toggle topbar elements
  const topbarGuest = document.getElementById('topbarGuest');
  const topbarUser = document.getElementById('topbarUser');
  if (topbarGuest) topbarGuest.style.display = 'flex';
  if (topbarUser) topbarUser.style.display = 'none';

  // Player bar
  // (Buttons now handle auth state dynamically)

  // Stars look inactive for guests (still clickable — will trigger auth modal)
  document.querySelectorAll('#starRating .star').forEach(s => s.style.opacity = '0.5');

  // Clear playlists in sidebar
  document.getElementById('sidebarPlaylistList').innerHTML =
    '<p class="playlist-empty-msg">Sign in to create playlists</p>';

  // Update welcome greeting to be generic
  const greetEl = document.getElementById('greetingText');
  if (greetEl) {
    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    greetEl.textContent = `${greeting}! 🎵`;
  }
}

// ── Auth guard helper ─────────────────────────────────────────
// Call before any action requiring login. Returns true if OK, false if not.
function requireAuth(context) {
  if (currentUser) return true;
  openAuthModal(context || 'default');
  return false;
}

// ── Load User Data ────────────────────────────────────────────
async function loadUserData() {
  if (!currentUser) return;
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      const data      = doc.data();
      userRatings     = data.ratings   || {};
      userPlaylists   = data.playlists || [];
      userPreferences = data.preferences || null;
      if (!userPreferences) {
        try {
          userPreferences = JSON.parse(localStorage.getItem(`tv_prefs_${currentUser.uid}`) || 'null');
        } catch (e) {}
      }
      // Load playlists from localStorage if Firestore returned empty
      if (userPlaylists.length === 0) {
        try {
          const savedPl = JSON.parse(localStorage.getItem(`tv_playlists_${currentUser.uid}`) || '[]');
          if (Array.isArray(savedPl) && savedPl.length > 0) userPlaylists = savedPl;
        } catch (e) {}
      }
    } else {
      // New user — create doc (non-blocking)
      db.collection('users').doc(currentUser.uid).set({
        displayName: currentUser.displayName || '',
        email:       currentUser.email || '',
        photoURL:    currentUser.photoURL || '',
        playlists:   [],
        ratings:     {},
        preferences: null,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.warn('Firestore user create failed:', err));
    }
  } catch (err) {
    console.warn('Load user data error (using localStorage fallback):', err);
    // Fallback: load everything from localStorage
    try {
      userPreferences = JSON.parse(localStorage.getItem(`tv_prefs_${currentUser.uid}`) || 'null');
    } catch(e) {}
    try {
      const savedPl = JSON.parse(localStorage.getItem(`tv_playlists_${currentUser.uid}`) || '[]');
      if (Array.isArray(savedPl)) userPlaylists = savedPl;
    } catch(e) {}
  }
}

// ── Load Songs (everyone) ─────────────────────────────────────
async function loadSongs() {
  let fbSongs = [];
  let serverSongs = [];
  let localSongs = [];

  // 1. Try Firebase Firestore
  try {
    const snap = await db.collection('songs').orderBy('createdAt', 'desc').get();
    fbSongs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Firestore load failed:', err);
  }

  // 2. Try Local Server API
  try {
    const res = await fetch('/api/songs');
    if (res.ok) {
      serverSongs = await res.json();
    }
  } catch (err) {
    console.warn('Local server API load failed:', err);
  }

  // 3. Try Local Storage
  try {
    localSongs = JSON.parse(localStorage.getItem('tv_demo_songs') || '[]');
  } catch (err) {
    console.warn('LocalStorage load failed:', err);
  }

  // Quietly migrate localStorage songs to the local server database if server is empty
  if (localSongs.length > 0 && serverSongs.length === 0) {
    localSongs.forEach(song => {
      fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      }).catch(e => {});
    });
  }

  // Merge all sources
  const merged = [...localSongs, ...serverSongs, ...fbSongs];
  const unique = [];
  const seen = new Set();
  for (const s of merged) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      unique.push(s);
    }
  }

  if (userPreferences) {
    const prefDirectors = userPreferences.directors || [];
    const prefAge = parseInt(userPreferences.age) || 22;
    const prefCategory = userPreferences.category || '';

    allSongs = unique.map(song => {
      let score = 0;
      const songArtist = typeof song.artist === 'string' ? song.artist.toLowerCase() : '';
      const songGenre = typeof song.genre === 'string' ? song.genre.toLowerCase() : '';

      // 1. Music Director Match (+15 pts)
      const matchesDirector = prefDirectors.some(dir => 
        songArtist.includes(dir.toLowerCase())
      );
      if (matchesDirector) {
        score += 15;
      }

      // 2. Genre/Category Match (+25 pts)
      if (prefCategory && songGenre === prefCategory.toLowerCase()) {
        score += 25;
      }

      // 3. Age-Appropriate Match (+5 pts)
      if (songGenre) {
        if (prefAge >= 18 && prefAge <= 35) {
          if (songGenre === 'mass' || songGenre === 'love') score += 5;
        } else if (prefAge > 35) {
          if (songGenre === 'classical' || songGenre === 'melody') score += 5;
        }
      }

      return { ...song, personalizationScore: score };
    });

    allSongs.sort((a, b) => b.personalizationScore - a.personalizationScore);
  } else {
    allSongs = unique.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeB - timeA;
    });
  }

  if (allSongs.length === 0) {
    renderPlaceholderSongs();
  } else {
    renderAllSongsList(allSongs);
  }
  populateSidebarCategories();
  renderPlaylists();
}

// ── Sidebar Category Population & Filtering ───────────────────
let activeCategory = 'all';

function populateSidebarCategories() {
  const container = document.getElementById('sidebarCategoryList');
  if (!container) return;

  // Collect unique genres from all songs
  const genres = new Set();
  allSongs.forEach(s => {
    if (s.genre && typeof s.genre === 'string' && s.genre.trim()) {
      genres.add(s.genre.trim());
    }
  });

  container.innerHTML = '';

  // "All Songs" chip
  const allBtn = document.createElement('button');
  allBtn.className = `category-chip${activeCategory === 'all' ? ' active' : ''}`;
  allBtn.setAttribute('data-genre', 'all');
  allBtn.textContent = `All Songs (${allSongs.length})`;
  allBtn.onclick = () => filterByCategory('all', allBtn);
  container.appendChild(allBtn);

  // Individual genre chips
  const sortedGenres = Array.from(genres).sort();
  sortedGenres.forEach(genre => {
    const count = allSongs.filter(s => s.genre && s.genre.trim().toLowerCase() === genre.toLowerCase()).length;
    const btn = document.createElement('button');
    btn.className = `category-chip${activeCategory === genre.toLowerCase() ? ' active' : ''}`;
    btn.setAttribute('data-genre', genre);
    btn.textContent = `${genre} (${count})`;
    btn.onclick = () => filterByCategory(genre, btn);
    container.appendChild(btn);
  });
}

window.filterByCategory = function(genre, btnEl) {
  activeCategory = genre === 'all' ? 'all' : genre.toLowerCase();

  // Update active chip styling
  document.querySelectorAll('#sidebarCategoryList .category-chip').forEach(c => c.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Filter and render
  if (genre === 'all') {
    renderAllSongsList(allSongs);
  } else {
    const filtered = allSongs.filter(s => s.genre && s.genre.trim().toLowerCase() === genre.toLowerCase());
    renderAllSongsList(filtered);
  }

  // Update section title
  const sectionTitle = document.querySelector('#viewHome .section-title');
  if (sectionTitle) {
    sectionTitle.textContent = genre === 'all' ? 'All Songs' : `${genre} Songs`;
  }
};

// ── Render Featured Grid ──────────────────────────────────────
function renderFeaturedGrid(songs) {
  const grid = document.getElementById('featuredGrid');
  grid.innerHTML = '';
  if (!songs.length) {
    grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1">No songs yet.</p>';
    return;
  }
  songs.forEach(song => {
    const avgRating = song.ratingCount ? (song.totalRating / song.ratingCount) : 0;
    const card = document.createElement('div');
    card.className = 'song-card';
    card.onclick   = () => playSong(song);
    card.innerHTML = `
      <div class="song-card-cover">
        <img src="${getSongCover(song)}" alt="${escHtml(song.title)}" loading="lazy" />
        <div class="play-overlay">
          <button class="play-overlay-btn">
            <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
          </button>
        </div>
      </div>
      <div class="song-card-title">${escHtml(song.title)}</div>
      <div class="song-card-artist">${escHtml(song.artist)}</div>
      <div class="song-card-rating">
        ${renderStarsHTML(avgRating, 'card-star')}
        <span class="card-rating-val">(${avgRating.toFixed(1)})</span>
      </div>`;
    grid.appendChild(card);
  });

  // Apply 3D Tilt Effect
  if (window.VanillaTilt) {
    VanillaTilt.init(document.querySelectorAll(".song-card"), {
      max: 15,
      speed: 400,
      glare: true,
      "max-glare": 0.2,
      perspective: 1000,
      scale: 1.05
    });
  }
}

// ── Render Songs List ─────────────────────────────────────────
function renderAllSongsList(songs, containerId = 'allSongsList') {
  const list = document.getElementById(containerId);
  if (!list) return;
  list.innerHTML = '';
  if (!songs.length) {
    list.innerHTML = '<p class="empty-msg">No songs found.</p>';
    return;
  }
  songs.forEach((song, idx) => {
    const avgRating = song.ratingCount ? (song.totalRating / song.ratingCount) : 0;
    const isPlaying = song.id === currentSongId;
    const row = document.createElement('div');
    row.className = `song-row${isPlaying ? ' playing' : ''}`;
    row.id        = `song-row-${song.id}`;
    row.onclick   = () => playSong(song);
    row.innerHTML = `
      <span class="song-row-num">${isPlaying ? '▶' : idx + 1}</span>
      <div class="song-row-cover">
        <img src="${getSongCover(song)}" alt="${escHtml(song.title)}" loading="lazy" />
      </div>
      <div class="song-row-info">
        <div class="song-row-title">${escHtml(song.title)}</div>
        <div class="song-row-artist">${escHtml(song.artist)}</div>
      </div>
      <span class="song-row-genre">${escHtml(song.genre || '')}</span>
      <div class="song-row-rating">${renderStarsHTML(avgRating, 'row-star')}</div>
      <button class="song-row-more" onclick="event.stopPropagation(); showSongMenu(event,'${song.id}')" title="More">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>`;
    list.appendChild(row);
  });
}

// ── Play Song ─────────────────────────────────────────────────
window.playSong = function(song) {
  currentSongId = song.id;
  window.currentSongObj = song;
  if (typeof saveRecentlyPlayed === 'function') saveRecentlyPlayed(song);

  document.getElementById('playerTitle').textContent  = song.title;
  document.getElementById('playerArtist').textContent = song.artist;

  const coverEl = document.getElementById('playerCover');
  coverEl.innerHTML = `<img src="${getSongCover(song)}" alt="${escHtml(song.title)}" />`;

  // Show user rating if logged in
  updateStarDisplay(currentUser ? (userRatings[song.id] || 0) : 0);

  // Highlight active row
  document.querySelectorAll('.song-row').forEach(r => r.classList.remove('playing'));
  const row = document.getElementById(`song-row-${song.id}`);
  if (row) row.classList.add('playing');

  // Count play (non-blocking)
  db.collection('songs').doc(song.id).update({
    playCount: firebase.firestore.FieldValue.increment(1)
  }).catch(() => {});

  // Activate visualizer
  const visualizer = document.getElementById('audioVisualizer');
  if (visualizer) visualizer.classList.add('playing');

  // Load Spotify embed player
  const spotifyUrl = song.spotifyEmbedUrl || song.spotifyUrl;
  loadSpotifyEmbed(spotifyUrl);

  // Fetch real cover art from Spotify API if available
  if (spotifyUrl && spotifyUrl.includes('spotify.com')) {
    fetchSpotifyCoverArt(spotifyUrl, song.id);
  }
};

// ── Spotify Web API — Fetch Cover Art ─────────────────────────
async function fetchSpotifyCoverArt(spotifyUrl, songId) {
  try {
    const match = spotifyUrl.match(/\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) return;

    const type = match[1];
    const id   = match[2];
    
    // Only fetch track details through our proxy for now
    if (type !== 'track') return;

    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
    const res = await fetch(`${baseUrl}/api/spotify/track/${id}`);

    if (!res.ok) return;
    const data = await res.json();

    // Extract album art
    let imageUrl = '';
    if (data.album && data.album.images && data.album.images.length > 0) {
      imageUrl = data.album.images[0].url; // Highest res
    }

    if (imageUrl && songId === currentSongId) {
      // Update player cover
      const coverEl = document.getElementById('playerCover');
      if (coverEl) coverEl.innerHTML = `<img src="${imageUrl}" alt="Cover" style="animation: fadeIn 0.3s ease" />`;

      // Update song row cover
      const rowEl = document.getElementById(`song-row-${songId}`);
      if (rowEl) {
        const rowImg = rowEl.querySelector('.song-row-cover img');
        if (rowImg) rowImg.src = imageUrl;
      }
    }
  } catch (err) {
    console.warn('Spotify API cover fetch skipped:', err.message);
  }
}

let userSearchHistory = [];

window.loadLocalSearchHistory = function() {
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      const saved = localStorage.getItem(`tv_search_${currentUser.uid}`);
      if (saved) userSearchHistory = JSON.parse(saved) || [];
    } catch(e) {}
  } else {
    userSearchHistory = [];
  }
  renderSearchHistory();
};

window.saveSearchHistory = function(query) {
  if (!query || (typeof currentUser === 'undefined') || !currentUser) return;
  userSearchHistory = userSearchHistory.filter(q => q !== query);
  userSearchHistory.unshift(query);
  if (userSearchHistory.length > 10) userSearchHistory.pop();
  
  try {
    localStorage.setItem(`tv_search_${currentUser.uid}`, JSON.stringify(userSearchHistory));
  } catch(e) {}
  renderSearchHistory();
};

window.clearSearchHistory = function() {
  userSearchHistory = [];
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      localStorage.removeItem(`tv_search_${currentUser.uid}`);
    } catch(e) {}
  }
  renderSearchHistory();
};

window.renderSearchHistory = function() {
  const container = document.getElementById('recentSearchesContainer');
  const list = document.getElementById('recentSearchesList');
  if (!container || !list) return;
  
  if (userSearchHistory.length === 0 || typeof currentUser === 'undefined' || !currentUser) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  list.innerHTML = userSearchHistory.map(q => `
    <div class="search-history-chip" onclick="executeHistorySearch('${escHtml(q)}')">
      ${escHtml(q)}
    </div>
  `).join('');
};

window.executeHistorySearch = function(query) {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = query;
    handleSearch(query);
  }
};

window.showSearchViewIfEmpty = function() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) {
    showView('search');
    renderSearchHistory();
  }
};

let userRecentlyPlayed = [];

window.loadLocalRecentlyPlayed = function() {
  userRecentlyPlayed = [];
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      const saved = localStorage.getItem(`tv_recent_${currentUser.uid}`);
      if (saved) userRecentlyPlayed = JSON.parse(saved) || [];
    } catch(e) {}
  } else {
    try {
      const savedGuest = localStorage.getItem(`tv_recent_guest`);
      if (savedGuest) userRecentlyPlayed = JSON.parse(savedGuest) || [];
    } catch(e) {}
  }
  renderRecentlyPlayed();
};

window.saveRecentlyPlayed = function(song) {
  if (!song) return;
  userRecentlyPlayed = userRecentlyPlayed.filter(s => s.id !== song.id);
  userRecentlyPlayed.unshift(song);
  if (userRecentlyPlayed.length > 10) userRecentlyPlayed.pop();
  
  try {
    if (typeof currentUser !== 'undefined' && currentUser) {
      localStorage.setItem(`tv_recent_${currentUser.uid}`, JSON.stringify(userRecentlyPlayed));
    } else {
      localStorage.setItem(`tv_recent_guest`, JSON.stringify(userRecentlyPlayed));
    }
  } catch(e) {}
  renderRecentlyPlayed();
};

window.resolveRecentlyPlayedTrack = async function(trackId) {
  if (!trackId) return;
  try {
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
    const res = await fetch(`${baseUrl}/api/spotify/track/${trackId}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.name) return;

    const artistName = Array.isArray(data.artists) ? data.artists.map(a => a.name).join(', ') : 'Spotify Artist';
    const coverUrl = (data.album && data.album.images && data.album.images.length > 0) ? data.album.images[0].url : '';

    const updatedSong = {
      id: trackId,
      title: data.name,
      artist: artistName,
      coverArt: coverUrl,
      spotifyUrl: `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`,
      isSpotify: true
    };

    // Update in userRecentlyPlayed array permanently
    const idx = userRecentlyPlayed.findIndex(s => (typeof s === 'string' ? s : s.id) === trackId);
    if (idx !== -1) {
      userRecentlyPlayed[idx] = updatedSong;
      if (typeof currentUser !== 'undefined' && currentUser) {
        try {
          localStorage.setItem(`tv_recent_${currentUser.uid}`, JSON.stringify(userRecentlyPlayed));
        } catch(e) {}
      }
    }

    // Update DOM card directly
    const titleEl = document.getElementById(`recent-title-${trackId}`);
    const artistEl = document.getElementById(`recent-artist-${trackId}`);
    const coverContainer = document.getElementById(`recent-cover-${trackId}`);

    if (titleEl) titleEl.textContent = updatedSong.title;
    if (artistEl) artistEl.textContent = updatedSong.artist;
    if (coverContainer && coverUrl) {
      coverContainer.innerHTML = `<img src="${coverUrl}" alt="${escHtml(updatedSong.title)}" style="width:100%; height:100%; object-fit:cover;" />`;
    }
  } catch(e) {
    console.warn('Failed to resolve recently played track:', e);
  }
};

window.renderRecentlyPlayed = function() {
  const container = document.getElementById('recentlyPlayedContainer');
  const list = document.getElementById('recentlyPlayedList');
  if (!container || !list) return;
  
  if (!userRecentlyPlayed || userRecentlyPlayed.length === 0) {
    userRecentlyPlayed = [
      { id: '1bxzr3JK05', title: 'Chuttamalle', artist: 'Anirudh Ravichander, Shilpa Rao', coverArt: 'https://i.scdn.co/image/ab67616d0000b2734a23a31c5ee91cbca1dd4a6f', isSpotify: true },
      { id: '4uwUk23qJY', title: 'Fear Song', artist: 'Anirudh Ravichander', coverArt: 'https://i.scdn.co/image/ab67616d0000b2734a23a31c5ee91cbca1dd4a6f', isSpotify: true }
    ];
  }
  
  container.style.display = 'block';
  list.innerHTML = userRecentlyPlayed.map(item => {
    let song = typeof item === 'string' ? { id: item, title: 'Loading song details...', artist: 'Spotify', coverArt: '', isSpotify: true, needsResolve: true } : item;
    if (!song.title || song.title.startsWith('Track ')) {
      song.needsResolve = true;
    }

    const coverSrc = typeof getSongCover === 'function' ? getSongCover(song) : (song.coverArt || '');
    const isNeedsResolve = song.needsResolve || song.title === 'Loading song details...' || song.title.startsWith('Track ');

    if (isNeedsResolve && song.id) {
      setTimeout(() => resolveRecentlyPlayedTrack(song.id), 50);
    }

    return `
      <div class="recent-card" onclick="playSongId('${song.id}')" style="min-width: 140px; cursor: pointer; text-align: center; flex-shrink: 0; transition: transform 0.2s;">
        <div id="recent-cover-${song.id}" style="width: 140px; height: 140px; border-radius: 12px; overflow: hidden; margin-bottom: 0.5rem; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center;">
          ${coverSrc 
            ? `<img src="${coverSrc}" alt="${escHtml(song.title)}" style="width:100%; height:100%; object-fit:cover;">`
            : `<span style="font-size:2rem;">🎵</span>`}
        </div>
        <div id="recent-title-${song.id}" style="font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-light);">${escHtml(song.title)}</div>
        <div id="recent-artist-${song.id}" style="font-size: 0.8rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(song.artist || 'Spotify')}</div>
      </div>
    `;
  }).join('');
};

window.playSongId = function(id) {
  const song = userRecentlyPlayed.find(s => (typeof s === 'string' ? s : s.id) === id);
  if (!song) return;

  const sObj = typeof song === 'string' ? { id: song, title: 'Spotify Track', isSpotify: true } : song;

  if (sObj.isSpotify || (sObj.id && String(sObj.id).length > 15)) {
    if (typeof playSpotifySong === 'function') {
      playSpotifySong({
        id: sObj.id,
        name: sObj.title || 'Spotify Track',
        artists: [{ name: sObj.artist || 'Artist' }],
        album: { images: sObj.coverArt ? [{ url: sObj.coverArt }] : [] }
      });
    } else if (typeof playSong === 'function') {
      playSong(sObj);
    }
  } else if (typeof playSong === 'function') {
    playSong(sObj);
  }
};

// ── REALTIME WEATHER & VISUAL EFFECTS ─────────────────────────
window.initRealtimeWeather = function() {
  const hour = new Date().getHours();
  const isEvening = hour >= 18 || hour < 6;

  // Show Evening Moon & Stars if evening/night
  const starsContainer = document.getElementById('eveningStarsContainer');
  if (starsContainer) {
    starsContainer.style.display = isEvening ? 'flex' : 'none';
  }

  // Fetch location & weather via Open-Meteo API
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => fetchOpenMeteoWeather(pos.coords.latitude, pos.coords.longitude),
      err => fetchOpenMeteoWeather(17.3850, 78.4867) // Fallback: Hyderabad
    );
  } else {
    fetchOpenMeteoWeather(17.3850, 78.4867);
  }
};

async function fetchOpenMeteoWeather(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    if (!res.ok) throw new Error('Weather API error');
    const data = await res.json();
    if (!data || !data.current_weather) return;

    const cw = data.current_weather;
    const temp = Math.round(cw.temperature);
    const code = cw.weathercode;
    const hour = new Date().getHours();
    const isEvening = hour >= 18 || hour < 6;

    let icon = isEvening ? '🌙' : '☀️';
    let desc = isEvening ? 'Clear Night' : 'Sunny Day';
    let conditionType = 'heat';

    if (code >= 51 && code <= 99) {
      icon = '🌧️';
      desc = 'Rainy';
      conditionType = 'rain';
    } else if (isEvening) {
      icon = '⭐';
      desc = 'Starry Night';
      conditionType = 'night';
    } else if (temp >= 26 || code === 0 || code === 1) {
      icon = '☀️';
      desc = temp >= 30 ? 'Hot & Sunny' : 'Sunny Day';
      conditionType = 'heat';
    } else if (code === 2 || code === 3) {
      icon = isEvening ? '✨' : '⛅';
      desc = 'Partly Cloudy';
    }

    const iconEl = document.getElementById('weatherIcon');
    const tempEl = document.getElementById('weatherTemp');
    const descEl = document.getElementById('weatherDesc');
    const tbIconEl = document.getElementById('topbarWeatherIcon');
    const tbTempEl = document.getElementById('topbarWeatherTemp');

    if (iconEl) iconEl.textContent = icon;
    if (tempEl) tempEl.textContent = `${temp}°C`;
    if (descEl) descEl.textContent = desc;
    if (tbIconEl) tbIconEl.textContent = icon;
    if (tbTempEl) tbTempEl.textContent = `${temp}°C`;

    // Run 5-second weather effect on website entry!
    triggerEntryWeatherEffect(conditionType);
  } catch (err) {
    console.warn('Weather fetch failed:', err);
    const hour = new Date().getHours();
    const isEvening = hour >= 18 || hour < 6;
    const iconEl = document.getElementById('weatherIcon');
    const tempEl = document.getElementById('weatherTemp');
    const descEl = document.getElementById('weatherDesc');
    const tbIconEl = document.getElementById('topbarWeatherIcon');
    const tbTempEl = document.getElementById('topbarWeatherTemp');

    const defaultIcon = isEvening ? '⭐' : '🌤️';
    if (iconEl) iconEl.textContent = defaultIcon;
    if (tempEl) tempEl.textContent = '32°C';
    if (descEl) descEl.textContent = isEvening ? 'Starry Night' : 'Warm Day';
    if (tbIconEl) tbIconEl.textContent = defaultIcon;
    if (tbTempEl) tbTempEl.textContent = '32°C';

    triggerEntryWeatherEffect(isEvening ? 'night' : 'heat');
  }
}

window.triggerEntryWeatherEffect = function(conditionType = 'heat') {
  let oldContainer = document.getElementById('weatherEntryOverlay');
  if (oldContainer) oldContainer.remove();

  const container = document.createElement('div');
  container.id = 'weatherEntryOverlay';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '2';
  container.style.transition = 'opacity 1s ease';

  if (conditionType === 'rain') {
    container.className = 'rain-container-overlay';
    for (let i = 0; i < 50; i++) {
      const drop = document.createElement('div');
      drop.className = 'rain-drop';
      drop.style.left = (Math.random() * 100) + 'vw';
      drop.style.animationDuration = (0.4 + Math.random() * 0.4) + 's';
      drop.style.animationDelay = (Math.random() * 2) + 's';
      drop.style.height = (30 + Math.random() * 25) + 'px';
      container.appendChild(drop);
    }
  } else if (conditionType === 'heat') {
    container.className = 'heat-container-overlay';
    container.style.background = 'radial-gradient(circle at 80% 20%, rgba(255, 180, 50, 0.35) 0%, rgba(255, 100, 0, 0.15) 45%, transparent 75%)';
    const ray = document.createElement('div');
    ray.className = 'sun-ray';
    container.appendChild(ray);
  } else if (conditionType === 'night') {
    container.className = 'night-container-overlay';
    container.style.background = 'radial-gradient(circle at 85% 15%, rgba(147, 51, 234, 0.3) 0%, rgba(15, 23, 42, 0.6) 65%, transparent 95%)';
    
    // Photorealistic Pinpoint Starscape (No cartoon emojis!)
    for (let i = 0; i < 40; i++) {
      const star = document.createElement('div');
      star.className = 'real-star-dot';
      const size = (1.5 + Math.random() * 2.5) + 'px';
      star.style.width = size;
      star.style.height = size;
      star.style.left = (Math.random() * 98) + 'vw';
      star.style.top = (Math.random() * 90) + 'vh';
      star.style.animationDelay = (Math.random() * 2) + 's';
      star.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      container.appendChild(star);
    }

    // Shooting Meteors Falling Diagonally from Top-Right (Hardware Accelerated)
    for (let i = 0; i < 7; i++) {
      const meteor = document.createElement('div');
      meteor.className = 'meteor-item';
      meteor.style.top = (-20 + Math.random() * 25) + 'vh';
      meteor.style.left = (60 + Math.random() * 35) + 'vw';
      meteor.style.animationDelay = (i * 0.45 + Math.random() * 0.3) + 's';
      meteor.style.animationDuration = (2.2 + Math.random() * 0.7) + 's';
      container.appendChild(meteor);
    }
  }

  document.body.appendChild(container);

  // Fade out & remove after EXACTLY 5 seconds!
  setTimeout(() => {
    container.style.opacity = '0';
    setTimeout(() => container.remove(), 1000);
  }, 5000);
};

window.triggerRainEffect = function(isUserClick = false) {
  triggerEntryWeatherEffect('rain');
};

// ── Search ────────────────────────────────────────────────────
let searchTimeout = null;

window.handleSearch = function(query) {
  const q = query.toLowerCase().trim();
  document.getElementById('searchClear').style.display = q ? 'block' : 'none';
  
  if (q.length > 0) {
    const rC = document.getElementById('recentSearchesContainer');
    if (rC) rC.style.display = 'none';
    showView('search');
    
    // 1. Local Search
    const results = allSongs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.genre || '').toLowerCase().includes(q)
    );
    renderAllSongsList(results, 'searchResultsList');
    
    // 2. Spotify Search (Debounced)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      saveSearchHistory(q);
      searchSpotify(q);
    }, 500);
    
  } else {
    if (document.getElementById('viewSearch').classList.contains('active')) {
      renderSearchHistory();
      document.getElementById('searchResultsList').innerHTML = '<p class="empty-msg">Start typing to search songs…</p>';
      document.getElementById('spotifyResultsList').innerHTML = '<p class="empty-msg">Search to discover songs from Spotify\'s entire catalog 🎵</p>';
    } else {
      showView('home');
    }
  }
};

async function searchSpotify(query) {
  const list = document.getElementById('spotifyResultsList');
  list.innerHTML = '<p class="empty-msg">Searching Spotify...</p>';
  
  try {
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
    const res = await fetch(`${baseUrl}/api/spotify/search?q=${encodeURIComponent(query)}&type=track&limit=50`);
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || errData.error || 'Spotify API Error');
    }
    
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message || 'Spotify Search Error');
    }
    
    if (!data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
      list.innerHTML = '<p class="empty-msg">No Spotify results found for "' + escHtml(query) + '".</p>';
      return;
    }

    // Cache results for track details lookup
    window.spotifySearchCache = data.tracks.items.map(track => ({
      id: track.id,
      title: track.name,
      artist: track.artists ? track.artists.map(a => a.name).join(', ') : 'Artist',
      coverArt: (track.album && track.album.images && track.album.images.length > 0) ? track.album.images[0].url : '',
      isSpotify: true
    }));
    
    list.innerHTML = '';
    data.tracks.items.forEach((track, idx) => {
      const cover = (track.album && track.album.images && track.album.images.length > 0) ? track.album.images[0].url : '';
      const artist = track.artists ? track.artists.map(a => a.name).join(', ') : 'Artist';
      
      const row = document.createElement('div');
      row.className = 'song-row';
      row.onclick = () => playSpotifySong(track);
      
      row.innerHTML = `
        <span class="song-row-num">${idx + 1}</span>
        <div class="song-row-cover">
          ${cover ? `<img src="${cover}" alt="${escHtml(track.name)}" loading="lazy" />` : '<span class="song-row-cover-icon">🎵</span>'}
        </div>
        <div class="song-row-info">
          <div class="song-row-title">${escHtml(track.name)}</div>
          <div class="song-row-artist">${escHtml(artist)}</div>
        </div>
        <span class="song-row-genre" style="color:#1DB954; font-size: 0.7rem; font-weight: 600">SPOTIFY</span>
        <div class="song-row-rating"></div>
        <button class="song-row-more" title="Play Track">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    console.error('Spotify search failed:', err);
    let errMsg = err.message || 'Failed to load Spotify results.';
    list.innerHTML = `<p class="empty-msg" style="color:var(--muted); line-height:1.5; font-size:0.85rem">${errMsg}</p>`;
  }
}

window.loadLanguageSongs = window.loadSpotifyLanguageTopSongs = async function(lang = 'telugu', btnEl) {
  if (btnEl) {
    document.querySelectorAll('.lang-pill').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  const container = document.getElementById('langSongsCarousel') || document.getElementById('spotifyLangSongsList');
  if (!container) return;
  
  const langLower = String(lang).toLowerCase();
  const langTitle = langLower.charAt(0).toUpperCase() + langLower.slice(1);
  container.innerHTML = '<p class="empty-msg" style="padding:1rem;">Loading Top ' + escHtml(langTitle) + ' Hits...</p>';
  
  try {
    const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';
    const queryMap = {
      'telugu': 'Telugu Top Hits 2024',
      'hindi': 'Hindi Top Hits 2024',
      'tamil': 'Tamil Top Hits 2024',
      'kannada': 'Kannada Top Hits 2024',
      'malayalam': 'Malayalam Top Hits 2024',
      'english': 'Global Top Hits 2024'
    };
    const query = queryMap[langLower] || `${langTitle} Top Hits`;
    
    const res = await fetch(`${baseUrl}/api/spotify/search?q=${encodeURIComponent(query)}&type=track&limit=15`);
    if (!res.ok) throw new Error('Spotify API HTTP error');
    
    const data = await res.json();
    if (!data || !data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
      container.innerHTML = `<p class="empty-msg" style="padding:1rem;">No ${escHtml(langTitle)} top songs found.</p>`;
      return;
    }

    container.innerHTML = '';
    data.tracks.items.forEach(track => {
      const cover = (track.album && track.album.images && track.album.images.length > 0) ? track.album.images[0].url : '';
      const artist = track.artists ? track.artists.map(a => a.name).join(', ') : 'Artist';
      
      const card = document.createElement('div');
      card.className = 'song-card';
      card.style.flex = '0 0 160px';
      card.style.minWidth = '160px';
      card.style.cursor = 'pointer';
      card.onclick = () => playSpotifySong(track);
      
      card.innerHTML = `
        <div class="song-card-cover">
          ${cover ? `<img src="${cover}" alt="${escHtml(track.name)}" loading="lazy" />` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">🎵</div>'}
          <div class="play-overlay">
            <button class="play-overlay-btn">
              <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
            </button>
          </div>
        </div>
        <div class="song-card-title">${escHtml(track.name)}</div>
        <div class="song-card-artist">${escHtml(artist)}</div>
      `;
      container.appendChild(card);
    });

    if (window.VanillaTilt) {
      VanillaTilt.init(container.querySelectorAll(".song-card"), {
        max: 12, speed: 400, glare: true, "max-glare": 0.2
      });
    }

  } catch (err) {
    console.warn('Spotify language songs fetch failed:', err);
    container.innerHTML = `<p class="empty-msg" style="color:var(--muted); padding:1rem;">Unable to load ${escHtml(langTitle)} Spotify hits.</p>`;
  }
};
window.switchSpotifyLang = window.loadLanguageSongs;

window.playSpotifySong = function(track) {
  currentSongId = track.id;
  
  const artist = Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : (track.artist || 'Spotify Artist');
  const coverUrl = (track.album && track.album.images && track.album.images.length > 0) ? track.album.images[0].url : (track.coverArt || '');
  const previewUrl = track.preview_url || '';
  
  const sObj = {
    id: track.id,
    title: track.name || track.title || 'Spotify Track',
    artist: artist,
    coverArt: coverUrl,
    spotifyUrl: `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0&autoplay=1`,
    previewUrl: previewUrl,
    isSpotify: true
  };
  window.currentSongObj = sObj;
  if (typeof saveRecentlyPlayed === 'function') saveRecentlyPlayed(sObj);

  // Update track queue for Next/Previous buttons
  if (window.spotifySearchCache && window.spotifySearchCache.length > 0) {
    window.currentSpotifyQueue = window.spotifySearchCache;
    const idx = window.currentSpotifyQueue.findIndex(t => t.id === track.id);
    window.currentSpotifyIndex = idx !== -1 ? idx : 0;
  }

  document.getElementById('playerTitle').textContent = sObj.title;
  document.getElementById('playerArtist').textContent = sObj.artist;
  
  const coverEl = document.getElementById('playerCover');
  if (coverEl) coverEl.innerHTML = coverUrl ? `<img src="${coverUrl}" alt="${escHtml(sObj.title)}" />` : `<span style="font-size:1.5rem">🎵</span>`;
  
  updateStarDisplay(0);
  
  document.querySelectorAll('.song-row').forEach(r => r.classList.remove('playing'));
  
  const visualizer = document.getElementById('audioVisualizer');
  if (visualizer) visualizer.classList.add('playing');

  const audio = document.getElementById('audioPlayer');
  if (previewUrl && audio) {
    audio.src = previewUrl;
    audio.play().then(() => {
      window.isPlaying = true;
      updatePlayBtnState();
    }).catch(err => {
      console.warn('HTML5 Autoplay warning:', err);
    });
  } else if (audio) {
    audio.pause();
    audio.src = '';
  }
  
  loadSpotifyEmbed(sObj.spotifyUrl);
};


window.clearSearch = function() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').style.display = 'none';
  showView('home');
};

// ── Rate Song — requires login ────────────────────────────────
window.rateSong = async function(val) {
  if (!requireAuth('rate')) return;    // ← blocks guests, shows modal
  if (!currentSongId) return;

  const prev = userRatings[currentSongId] || 0;
  userRatings[currentSongId] = val;
  updateStarDisplay(val);

  try {
    await db.collection('users').doc(currentUser.uid).update({
      [`ratings.${currentSongId}`]: val
    });

    const songRef = db.collection('songs').doc(currentSongId);
    await db.runTransaction(async t => {
      const doc  = await t.get(songRef);
      const data = doc.data();
      const prevTotal = data.totalRating || 0;
      const prevCount = data.ratingCount || 0;
      if (prev > 0) {
        t.update(songRef, { totalRating: prevTotal - prev + val });
      } else {
        t.update(songRef, { totalRating: prevTotal + val, ratingCount: prevCount + 1 });
      }
    });
    showAppToast(`Rated ${val} star${val !== 1 ? 's' : ''}! ⭐`);
  } catch (err) {
    console.error('Rating error:', err);
    showAppToast('Could not save rating.');
  }
};

function updateStarDisplay(val) {
  document.querySelectorAll('#starRating .star').forEach(s => {
    s.classList.toggle('lit', parseInt(s.dataset.val) <= val);
  });
}

// ── View Switcher ─────────────────────────────────────────────
window.showView = function(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`);
  if (view) view.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById(`nav${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`);
  if (nav) nav.classList.add('active');

  // Auto-close sidebar drawer on mobile navigation
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 900) {
    sidebar.classList.remove('open');
  }

  if (viewId === 'library') {
    if (!requireAuth('library')) return;   // ← guests see modal, stay on home
    renderPlaylists();
  }
};

// ── Sign Out ──────────────────────────────────────────────────
window.signOut = function() {
  auth.signOut().then(() => {
    currentUser   = null;
    userRatings   = {};
    userPlaylists = [];
    setGuestUI();
    showView('home');
    showAppToast('Signed out.');
  });
};

// ── Mobile Sidebar ────────────────────────────────────────────
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
};

// ── Modals ────────────────────────────────────────────────────
window.openContributionModal = function() {
  document.getElementById('contributionModal').classList.add('open');
};

window.openCreatePlaylistModal = function() {
  if (!requireAuth('playlist')) return;
  closeModal('addToPlaylistModal');
  document.getElementById('playlistNameInput').value = '';
  document.getElementById('playlistDescInput').value = '';
  document.getElementById('createPlaylistModal').classList.add('open');
};
window.closeModal = function(id) {
  document.getElementById(id).classList.remove('open');
};
window.closeModalOnOverlay = function(e, id) {
  if (e.target.id === id) closeModal(id);
};

window.openAddToPlaylistModal = function() {
  if (!requireAuth('save')) return;
  if (!currentSongId) return showAppToast('Select a song first!');
  renderModalPlaylistList();
  document.getElementById('addToPlaylistModal').classList.add('open');
};

window.showSongMenu = function(e, songId) {
  e.stopPropagation();
  const song = allSongs.find(s => s.id === songId);
  if (song) playSong(song);
  if (currentUser) openAddToPlaylistModal();
  else openAuthModal('save');
};

window.handleSaveClick = function(e) {
  if (currentUser) {
    if (!currentSongId) return showAppToast('Select a song first!');
    renderModalPlaylistList();
    document.getElementById('addToPlaylistModal').classList.add('open');
  } else {
    openAuthModal('save');
  }
};

// ── Auth Modal (in-app) ───────────────────────────────────────
let _pendingAction = null;

window.openAuthModal = function(context) {
  _pendingAction = context;

  const titles = {
    rate:     { title: 'Sign In to Rate', sub: 'Rate songs to remember your favourites' },
    save:     { title: 'Sign In to Save', sub: 'Save songs to your personal playlists' },
    playlist: { title: 'Sign In to Continue', sub: 'Create & manage your playlists' },
    library:  { title: 'Sign In to View Library', sub: 'Your playlists are waiting' },
    sidebar:  { title: 'Welcome to TollyVerse', sub: 'Sign in to unlock all features' },
    default:  { title: 'Sign In to Continue', sub: 'Unlock saving & rating features' }
  };
  const t = titles[context] || titles.default;
  document.getElementById('authModalTitle').textContent = t.title;
  document.getElementById('authModalSub').textContent   = t.sub;

  // Reset to login tab
  switchModalTab('login');
  document.getElementById('modalAuthToast').textContent = '';
  document.getElementById('modalAuthToast').className   = 'modal-auth-toast';
  document.getElementById('authModal').classList.add('open');
};

window.switchModalTab = function(tab) {
  const lf = document.getElementById('modalLoginForm');
  const rf = document.getElementById('modalRegisterForm');
  const tl = document.getElementById('mTabLogin');
  const tr = document.getElementById('mTabRegister');
  if (tab === 'login') {
    lf.style.display = 'flex'; rf.style.display = 'none';
    tl.classList.add('active'); tr.classList.remove('active');
  } else {
    lf.style.display = 'none'; rf.style.display = 'flex';
    tl.classList.remove('active'); tr.classList.add('active');
  }
};

// Google sign-in from modal
window.modalSignInGoogle = async function() {
  const btn = document.getElementById('modalGoogleBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
  clearModalToast();
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user   = result.user;
    
    closeModal('authModal');
    showAppToast(`Welcome, ${user.displayName || 'there'}! 🎵`);

    // Non-blocking firestore doc save
    if (typeof db !== 'undefined') {
      db.collection('users').doc(user.uid).set({
        displayName: user.displayName || '',
        email:       user.email || '',
        photoURL:    'https://cdn.phototourl.com/free/2026-07-24-805f4af5-d81c-4bb8-ba56-02b2e61a9196.jpg',
        provider:    'google',
        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.warn('Firestore sync skipped:', err));
    }
  } catch (err) {
    console.warn('Google sign in error:', err);
    showModalToast(getAuthError(err.code));
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
};

// Email login from modal
window.modalEmailLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById('mLoginEmail').value.trim();
  const pw    = document.getElementById('mLoginPw').value;
  const btn   = document.getElementById('mLoginSubmit');
  btn.disabled = true; btn.textContent = 'Signing in…';
  clearModalToast();
  try {
    await auth.signInWithEmailAndPassword(email, pw);
    closeModal('authModal');
    showAppToast('Signed in! 🎵');
  } catch (err) {
    showModalToast(getAuthError(err.code));
    btn.disabled = false; btn.textContent = 'Sign In';
  }
};

// Email register from modal
window.modalEmailRegister = async function(e) {
  e.preventDefault();
  const name  = document.getElementById('mRegName').value.trim();
  const email = document.getElementById('mRegEmail').value.trim();
  const pw    = document.getElementById('mRegPw').value;
  const btn   = document.getElementById('mRegSubmit');
  btn.disabled = true; btn.textContent = 'Creating…';
  clearModalToast();
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    await cred.user.updateProfile({ displayName: name });
    await db.collection('users').doc(cred.user.uid).set({
      displayName: name, email, photoURL: '', provider: 'email',
      playlists: [], ratings: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeModal('authModal');
    showAppToast(`Welcome to TollyVerse, ${name}! 🎵`);
  } catch (err) {
    showModalToast(getAuthError(err.code));
    btn.disabled = false; btn.textContent = 'Create Account';
  }
};

function showModalToast(msg) {
  const t = document.getElementById('modalAuthToast');
  t.textContent = msg;
  t.className   = 'modal-auth-toast show';
}
function clearModalToast() {
  const t = document.getElementById('modalAuthToast');
  t.textContent = '';
  t.className   = 'modal-auth-toast';
}
function getAuthError(code) {
  const m = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/email-already-in-use':  'Email already registered.',
    'auth/invalid-email':         'Please enter a valid email.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/too-many-requests':     'Too many attempts. Try later.',
    'auth/popup-closed-by-user':  'Sign-in was cancelled.',
    'auth/network-request-failed':'Network error. Check connection.',
    'auth/invalid-credential':                    'Invalid email or password.',
    'auth/invalid-login-credentials':             'Invalid email or password.',
    'auth/operation-not-supported-in-this-environment': '⚠️ Google Sign-In requires HTTP. Open via localhost, not file://.',
    'auth/popup-blocked':                         'Popup was blocked. Please allow popups for this site.',
    'auth/cancelled-popup-request':               'Sign-in was cancelled.',
    'auth/configuration-not-found':               'Google Sign-In is not enabled in Firebase Console → Authentication → Sign-in method → Enable Google.'
  };
  return m[code] || `An error occurred (${code}). Please try again.`;
}

// ── Toast ─────────────────────────────────────────────────────
window.showAppToast = function(msg) {
  const t = document.getElementById('appToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
};

// ── Helpers ───────────────────────────────────────────────────
function renderStarsHTML(avg, cls) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${cls}${i <= Math.round(avg) ? ' filled' : ''}">★</span>`;
  }
  return html;
}
function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getSongCover(song) {
  const art = song.coverArt;
  if (!art || typeof art !== 'string') return 'images/default_cover.png';
  const clean = art.trim().toLowerCase();
  if (clean.includes('spotify.com') || (!clean.startsWith('http://') && !clean.startsWith('https://'))) {
    return 'images/default_cover.png';
  }
  return art.trim();
}

function renderPlaceholderSongs() {
  const demo = [
    { id:'demo1', title:'Samajavaragamana', artist:'S.P. Balasubrahmanyam', genre:'Classical', coverArt:'', spotifyUrl:'https://open.spotify.com/track/3KkXRkHbMatchuAdyCfUjK', totalRating:23, ratingCount:5 },
    { id:'demo2', title:'Buttabomma',       artist:'Armaan Malik',           genre:'Pop',       coverArt:'', spotifyUrl:'https://open.spotify.com/track/7Bah4v3kl4JuSG8hq3Kf1H', totalRating:19, ratingCount:4 },
    { id:'demo3', title:'Naa Ready',        artist:'Thaman S',               genre:'Mass',      coverArt:'', spotifyUrl:'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh', totalRating:15, ratingCount:3 },
    { id:'demo4', title:'Oo Antava',        artist:'Indravathi Chauhan',      genre:'Item',      coverArt:'', spotifyUrl:'https://open.spotify.com/track/6W04Y8MCqFDPbOBv3MaCuV', totalRating:22, ratingCount:5 },
  ];
  allSongs = demo;
  const grid = document.getElementById('featuredGrid');
  if (grid) {
    renderFeaturedGrid(demo);
  }
  renderAllSongsList(demo);
}

// ── Onboarding Modal Helper Logic ─────────────────────────────
window.toggleChip = function(el) {
  el.classList.toggle('selected');
};

window.nextOnboardingStep = function(currentStep) {
  if (currentStep === 1) {
    const selectedDirectors = Array.from(document.querySelectorAll('#obDirectorsContainer .chip.selected')).map(c => c.getAttribute('data-value'));
    if (selectedDirectors.length === 0) {
      alert('Please select at least one music director!');
      return;
    }
    document.getElementById('obStepContent1').style.display = 'none';
    document.getElementById('obStepContent2').style.display = 'block';
    document.getElementById('obStepIndicator1').classList.remove('active');
    document.getElementById('obStepIndicator1').classList.add('complete');
    document.getElementById('obStepIndicator2').classList.add('active');
  } else if (currentStep === 2) {
    const ageVal = document.getElementById('obAgeInput').value.trim();
    if (!ageVal || isNaN(ageVal) || parseInt(ageVal) < 5 || parseInt(ageVal) > 100) {
      alert('Please enter a valid age between 5 and 100!');
      return;
    }
    document.getElementById('obStepContent2').style.display = 'none';
    document.getElementById('obStepContent3').style.display = 'block';
    document.getElementById('obStepIndicator2').classList.remove('active');
    document.getElementById('obStepIndicator2').classList.add('complete');
    document.getElementById('obStepIndicator3').classList.add('active');
  }
};

window.submitOnboarding = async function() {
  try {
    const selectedDirectors = Array.from(document.querySelectorAll('#obDirectorsContainer .chip.selected')).map(c => c.getAttribute('data-value'));
    const ageVal = document.getElementById('obAgeInput').value;
    const age = parseInt(ageVal) || 22;
    const selectedCategory = Array.from(document.querySelectorAll('#obCategoryContainer .chip.selected')).map(c => c.getAttribute('data-value'))[0] || '';

    if (!selectedCategory) {
      alert('Please select your preferred category/mood!');
      return;
    }

    const prefs = {
      directors: selectedDirectors,
      age: age,
      category: selectedCategory
    };

    userPreferences = prefs;

    if (currentUser) {
      try {
        localStorage.setItem(`tv_prefs_${currentUser.uid}`, JSON.stringify(prefs));
      } catch(e) {}

      db.collection('users').doc(currentUser.uid).update({
        preferences: prefs
      }).catch(err => {
        console.warn('Failed saving preferences to Firestore, saved locally:', err);
      });
    }

    document.getElementById('onboardingModal').classList.remove('open');
    await loadSongs();
  } catch (err) {
    alert(`Submit Onboarding Error: ${err.message}\nStack: ${err.stack}`);
  }
};

// ── GAME ZONE: Tic-Tac-Toe ────────────────────────────────────
let tttBoard = ['', '', '', '', '', '', '', '', ''];
let tttCurrentPlayer = 'X';
let tttGameActive = true;

window.playTicTacToe = function(index) {
  if (tttBoard[index] !== '' || !tttGameActive) return;
  
  tttBoard[index] = tttCurrentPlayer;
  const cells = document.querySelectorAll('.ttt-cell');
  cells[index].textContent = tttCurrentPlayer;
  cells[index].classList.add(tttCurrentPlayer.toLowerCase());
  
  checkTicTacToeWin();
  if (tttGameActive) {
    tttCurrentPlayer = tttCurrentPlayer === 'X' ? 'O' : 'X';
  }
};

function checkTicTacToeWin() {
  const winConditions = [
    [0,1,2], [3,4,5], [6,7,8], // Rows
    [0,3,6], [1,4,7], [2,5,8], // Cols
    [0,4,8], [2,4,6]           // Diags
  ];
  
  let roundWon = false;
  for (let i = 0; i < winConditions.length; i++) {
    const [a, b, c] = winConditions[i];
    if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
      roundWon = true;
      break;
    }
  }
  
  const statusEl = document.getElementById('tictactoeStatus');
  if (roundWon) {
    statusEl.textContent = `Player ${tttCurrentPlayer} Wins! 🎉`;
    statusEl.style.color = tttCurrentPlayer === 'X' ? '#60a5fa' : '#f472b6';
    tttGameActive = false;
    return;
  }
  
  if (!tttBoard.includes('')) {
    statusEl.textContent = "It's a Draw! 🤝";
    statusEl.style.color = 'var(--text-light)';
    tttGameActive = false;
    return;
  }
}

window.resetTicTacToe = function() {
  tttBoard = ['', '', '', '', '', '', '', '', ''];
  tttCurrentPlayer = 'X';
  tttGameActive = true;
  document.getElementById('tictactoeStatus').textContent = '';
  document.querySelectorAll('.ttt-cell').forEach(cell => {
    cell.textContent = '';
    cell.classList.remove('x', 'o');
  });
};

// ── GAME ZONE (SNAKE) ──
let snakeCanvas, snakeCtx;
let snake = [];
let snakeDir = { x: 1, y: 0 };
let snakeNextDir = { x: 1, y: 0 };
let snakeFood = { x: 0, y: 0 };
let snakeScore = 0;
let snakeTimer = null;
let snakeSpeed = 250;

window.initSnakeGame = function() {
  snakeCanvas = document.getElementById('snakeCanvas');
  if (!snakeCanvas) return;
  snakeCtx = snakeCanvas.getContext('2d');
  
  snake = [ { x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 } ];
  snakeDir = { x: 1, y: 0 };
  snakeNextDir = { x: 1, y: 0 };
  snakeScore = 0;
  snakeSpeed = 250;
  document.getElementById('snakeStatus').textContent = `Score: 0`;
  
  placeSnakeFood();
  if (snakeTimer) clearTimeout(snakeTimer);
  gameLoop();
  
  if (!window.snakeKeyBound) {
    window.addEventListener('keydown', e => {
      // Prevent default scrolling for arrows when on game zone
      if (document.getElementById('viewGames').classList.contains('active') && 
          ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'ArrowUp' && snakeDir.y === 0) snakeNextDir = { x: 0, y: -1 };
      if (e.key === 'ArrowDown' && snakeDir.y === 0) snakeNextDir = { x: 0, y: 1 };
      if (e.key === 'ArrowLeft' && snakeDir.x === 0) snakeNextDir = { x: -1, y: 0 };
      if (e.key === 'ArrowRight' && snakeDir.x === 0) snakeNextDir = { x: 1, y: 0 };
    }, {passive: false});
    window.snakeKeyBound = true;
  }
};

window.snakeSetDir = function(dx, dy) {
  if (dx !== 0 && snakeDir.x === 0) snakeNextDir = { x: dx, y: 0 };
  if (dy !== 0 && snakeDir.y === 0) snakeNextDir = { x: 0, y: dy };
};

function placeSnakeFood() {
  snakeFood = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
}

function gameLoop() {
  snakeDir = snakeNextDir;
  let newHead = { x: snake[0].x + snakeDir.x, y: snake[0].y + snakeDir.y };
  
  // Wrap around (Stress-free!)
  if (newHead.x < 0) newHead.x = 19;
  if (newHead.x > 19) newHead.x = 0;
  if (newHead.y < 0) newHead.y = 19;
  if (newHead.y > 19) newHead.y = 0;
  
  // Self collision = gentle restart
  for (let i = 0; i < snake.length; i++) {
    if (snake[i].x === newHead.x && snake[i].y === newHead.y) {
      initSnakeGame(); return;
    }
  }
  
  snake.unshift(newHead);
  if (newHead.x === snakeFood.x && newHead.y === snakeFood.y) {
    snakeScore += 10;
    snakeSpeed = Math.max(100, snakeSpeed - 5);
    document.getElementById('snakeStatus').textContent = `Score: ${snakeScore}`;
    placeSnakeFood();
  } else {
    snake.pop();
  }
  
  drawSnakeGame();
  
  if (snakeTimer) clearTimeout(snakeTimer);
  snakeTimer = setTimeout(gameLoop, snakeSpeed);
}

function drawSnakeGame() {
  snakeCtx.fillStyle = '#1e1e24';
  snakeCtx.fillRect(0, 0, 300, 300);
  
  snakeCtx.fillStyle = '#f43f5e';
  snakeCtx.beginPath();
  snakeCtx.arc(snakeFood.x * 15 + 7.5, snakeFood.y * 15 + 7.5, 6, 0, Math.PI * 2);
  snakeCtx.fill();
  
  snakeCtx.fillStyle = '#34d399';
  snake.forEach(segment => { snakeCtx.fillRect(segment.x * 15, segment.y * 15, 14, 14); });
}


// ── MEDITATION ZONE ───────────────────────────────────────────
// To make audio work globally on any device:
// 1. Upload your audio files (rain.mp3, etc.) to Firebase Storage (in your Firebase Console).
// 2. Copy the "Download URL" for each file.
// 3. Replace the URLs below (e.g., '/assets/sounds/rain.mp3') with your Firebase URLs!
const meditationSounds = [
  { id: 'med_rain', title: 'Calm Rain', icon: '🌧️', url: 'https://files.catbox.moe/i0t14e.mp3' },
  { id: 'med_ocean', title: 'Peaceful Ocean', icon: '🌊', url: 'https://files.catbox.moe/k9zoy4.mp3' },
  { id: 'med_wind', title: 'Gentle Breeze', icon: '🌬️', url: 'https://files.catbox.moe/wobg7e.mp3' },
  { id: 'med_birds', title: 'Morning Birds', icon: '🐦', url: 'https://files.catbox.moe/6d6y99.mp3' }
];

let meditationTimerInterval = null;
let meditationTimeRemaining = 0;

window.setMeditationTimer = function(minutes) {
  if (meditationTimerInterval) clearInterval(meditationTimerInterval);
  
  document.querySelectorAll('.timer-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`timerBtn${minutes}`).classList.add('active');
  
  const display = document.getElementById('meditationTimerDisplay');
  
  if (minutes === 0) {
    display.style.display = 'none';
    return;
  }
  
  display.style.display = 'block';
  meditationTimeRemaining = minutes * 60;
  updateTimerDisplay();
  
  meditationTimerInterval = setInterval(() => {
    meditationTimeRemaining--;
    updateTimerDisplay();
    
    if (meditationTimeRemaining <= 0) {
      clearInterval(meditationTimerInterval);
      document.getElementById('timerBtn0').click();
      
      // Stop playback if playing
      if (window.isPlaying) {
        window.togglePlayPause();
      }
    }
  }, 1000);
};

function updateTimerDisplay() {
  const m = Math.floor(meditationTimeRemaining / 60);
  const s = meditationTimeRemaining % 60;
  document.getElementById('meditationTimerDisplay').textContent = 
    `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function renderMeditationGrid() {
  const grid = document.getElementById('meditationGrid');
  if (!grid) return;
  
  const usesBanner = `
    <div style="grid-column: 1 / -1; display:flex; flex-direction:column; gap:0.5rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:1.5rem; margin-bottom:1rem;">
      <h3 style="color:#f8fafc; font-size:1.2rem; display:flex; align-items:center; gap:0.5rem; margin:0;">
        <span style="color:var(--purple);">✨</span> Important Uses of Meditation
      </h3>
      <ul style="color:var(--muted); font-size:0.95rem; margin-left:1.5rem; line-height:1.6; margin-top:0.5rem; margin-bottom:0;">
        <li>Reduces stress and anxiety, promoting emotional health.</li>
        <li>Enhances self-awareness and lengthens attention span.</li>
        <li>Improves sleep quality and helps control pain.</li>
        <li>Fosters kindness and a deeper sense of inner peace.</li>
      </ul>
    </div>
  `;
  
  grid.innerHTML = usesBanner + meditationSounds.map(sound => `
    <div class="meditation-card ${currentSongId === sound.id ? 'playing' : ''}" 
         id="med-card-${sound.id}" 
         onclick="playMeditationSound('${sound.id}')">
      <div class="meditation-icon">${sound.icon}</div>
      <div class="meditation-title">${sound.title}</div>
    </div>
  `).join('');
}

window.playMeditationSound = function(soundId) {
  const sound = meditationSounds.find(s => s.id === soundId);
  if (!sound) return;

  // Reset Spotify object so player controls bind strictly to meditation audio
  window.currentSongObj = null;
  window.isSpotifyPlaying = false;

  const audio = document.getElementById('audioPlayer');
  if (!audio) return;
  const visualizer = document.getElementById('audioVisualizer');

  if (currentSongId === sound.id) {
    if (!audio.paused) {
      audio.pause();
      window.isPlaying = false;
      document.getElementById(`med-card-${sound.id}`)?.classList.remove('playing');
      if (visualizer) visualizer.classList.remove('playing');
    } else {
      audio.play().catch(e => console.error(e));
      window.isPlaying = true;
      document.getElementById(`med-card-${sound.id}`)?.classList.add('playing');
      if (visualizer) visualizer.classList.add('playing');
    }
    updatePlayBtnState();
    return;
  }
  
  currentSongId = sound.id;
  
  // Highlight active card
  document.querySelectorAll('.meditation-card').forEach(c => c.classList.remove('playing'));
  document.getElementById(`med-card-${sound.id}`).classList.add('playing');
  
  // Update Player UI
  document.getElementById('playerTitle').textContent = sound.title;
  document.getElementById('playerArtist').textContent = 'Meditation Zone';
  document.getElementById('playerCover').innerHTML = `<div style="font-size: 2.5rem; display:flex; align-items:center; justify-content:center; height:100%; background:rgba(255,255,255,0.1); border-radius:12px;">${sound.icon}</div>`;
  
  if (typeof updateStarDisplay === 'function') updateStarDisplay(0); // No ratings for meditation
  
  if (visualizer) visualizer.classList.add('playing');
  
  const scrubber = document.getElementById('customScrubberContainer');
  const iframe = document.getElementById('spotifyEmbed');
  const wrapper = document.querySelector('.player-embed-wrapper');
  
  if (scrubber) scrubber.style.display = 'flex';
  if (wrapper) {
    // Trick the browser by rendering it off-screen instead of hiding it!
    wrapper.style.display = 'block';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.width = '300px';
    wrapper.style.height = '300px';
    wrapper.style.opacity = '1';
    wrapper.style.pointerEvents = 'none';
  }
  
  if (sound.url.includes('soundcloud.com')) {
    audio.pause();
    audio.src = '';
    if (iframe) {
      window.scWidget = null;
      iframe.style.display = 'block';
      iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(sound.url)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`;
      
      // Initialize the widget API
      setTimeout(() => { initSCWidget(); }, 500);
    }
  } else {
    if (iframe) iframe.src = 'about:blank';
    window.scWidget = null;
    // Play HTML5 audio
    audio.src = sound.url;
    audio.loop = true; // Loop meditation sounds
    audio.play().catch(e => console.error('Meditation playback failed', e));
  }
};

// Hook into showView to render the meditation grid if visited
const originalShowView = window.showView;
window.showView = function(viewId) {
  originalShowView(viewId);
  if (viewId === 'meditation') {
    renderMeditationGrid();
  }
};


// ── CUSTOM PLAYER CONTROLS ─────────────────────────────────────
window.isPlaying = false;
window.scWidget = null;
window.isMuted = false;
window.currentVolume = 1;

function initSCWidget() {
  if (!window.scWidget && window.SC && window.SC.Widget) {
    const iframe = document.getElementById('spotifyEmbed');
    if (iframe) {
      window.scWidget = SC.Widget(iframe);
      
      window.scWidget.bind(SC.Widget.Events.READY, () => {
        window.scWidget.getDuration((dur) => {
          document.getElementById('timeTotal').textContent = formatTimeMs(dur);
        });
        window.scWidget.setVolume(window.currentVolume * 100);
      });
      window.scWidget.bind(SC.Widget.Events.PLAY, () => {
        window.isPlaying = true;
        updatePlayBtnState();
      });
      window.scWidget.bind(SC.Widget.Events.PAUSE, () => {
        window.isPlaying = false;
        updatePlayBtnState();
      });
      window.scWidget.bind(SC.Widget.Events.PLAY_PROGRESS, (data) => {
        window.scWidget.getDuration((dur) => {
           updateScrubber(data.currentPosition, data.relativePosition, dur);
        });
      });
      window.scWidget.bind(SC.Widget.Events.FINISH, () => {
        window.isPlaying = false;
        updatePlayBtnState();
        window.nextMeditationSong(); // Auto-play next song
      });
    }
  }
}

function updatePlayBtnState() {
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  if (playIcon && pauseIcon) {
    playIcon.style.display = window.isPlaying ? 'none' : 'block';
    pauseIcon.style.display = window.isPlaying ? 'block' : 'none';
  }
}

window.togglePlayPause = function() {
  if (window.currentSongObj && window.currentSongObj.isSpotify) {
    if (window.spotifyEmbedController) {
      window.spotifyEmbedController.togglePlay();
    } else {
      const iframe = document.getElementById('spotifyEmbed');
      if (window.isPlaying) {
        window.isPlaying = false;
        window.isSpotifyPlaying = false;
        if (iframe) iframe.src = 'about:blank';
        updatePlayBtnState();
        if (typeof showAppToast === 'function') showAppToast('⏸ Paused Spotify Track');
      } else {
        window.isPlaying = true;
        window.isSpotifyPlaying = true;
        if (iframe) iframe.src = window.currentSongObj.spotifyUrl;
        updatePlayBtnState();
        if (typeof showAppToast === 'function') showAppToast('▶ Resumed Spotify Track');
      }
    }
    return;
  }

  const audio = document.getElementById('audioPlayer');
  const sound = meditationSounds.find(s => s.id === currentSongId);
  
  if (sound && sound.url.includes('soundcloud.com')) {
    if (!window.scWidget) initSCWidget();
    if (window.scWidget) window.scWidget.toggle();
  } else if (audio && audio.src) {
    if (audio.paused) {
      audio.play().catch(console.error);
      window.isPlaying = true;
    } else {
      audio.pause();
      window.isPlaying = false;
    }
    updatePlayBtnState();
  }
};

window.nextMeditationSong = function() {
  if (window.currentSongObj && window.currentSongObj.isSpotify && window.currentSpotifyQueue && window.currentSpotifyQueue.length > 0) {
    const nextIdx = (window.currentSpotifyIndex + 1) % window.currentSpotifyQueue.length;
    window.currentSpotifyIndex = nextIdx;
    playSpotifySong(window.currentSpotifyQueue[nextIdx]);
    return;
  }

  if (!currentSongId) return;
  const idx = meditationSounds.findIndex(s => s.id === currentSongId);
  if (idx !== -1) {
    const nextIdx = (idx + 1) % meditationSounds.length;
    playMeditationSound(meditationSounds[nextIdx].id);
  }
};

window.prevMeditationSong = function() {
  if (window.currentSongObj && window.currentSongObj.isSpotify && window.currentSpotifyQueue && window.currentSpotifyQueue.length > 0) {
    const prevIdx = (window.currentSpotifyIndex - 1 + window.currentSpotifyQueue.length) % window.currentSpotifyQueue.length;
    window.currentSpotifyIndex = prevIdx;
    playSpotifySong(window.currentSpotifyQueue[prevIdx]);
    return;
  }

  if (!currentSongId) return;
  const idx = meditationSounds.findIndex(s => s.id === currentSongId);
  if (idx !== -1) {
    const prevIdx = (idx - 1 + meditationSounds.length) % meditationSounds.length;
    playMeditationSound(meditationSounds[prevIdx].id);
  }
};

window.changeVolume = function(val) {
  window.currentVolume = parseFloat(val);
  const audio = document.getElementById('audioPlayer');
  if (audio) {
    audio.volume = window.currentVolume;
    audio.muted = window.currentVolume === 0;
  }
  if (window.scWidget) {
    window.scWidget.setVolume(window.currentVolume * 100);
  }
  updateVolumeIcon();
};

window.toggleMute = function() {
  const slider = document.getElementById('volumeSlider');
  if (window.currentVolume > 0) {
    window.currentVolume = 0;
  } else {
    window.currentVolume = slider ? parseFloat(slider.value) || 1 : 1;
    if (window.currentVolume === 0) window.currentVolume = 1; // force unmute
  }
  if (slider) slider.value = window.currentVolume;
  window.changeVolume(window.currentVolume);
};

function updateVolumeIcon() {
  const volIcon = document.getElementById('volIcon');
  if (!volIcon) return;
  if (window.currentVolume === 0) {
    volIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
  } else {
    volIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const audioNode = document.getElementById('audioPlayer');
  if (audioNode) {
    audioNode.addEventListener('play', () => { window.isPlaying = true; updatePlayBtnState(); });
    audioNode.addEventListener('pause', () => { window.isPlaying = false; updatePlayBtnState(); });
    audioNode.addEventListener('ended', () => { window.nextMeditationSong(); });
    audioNode.addEventListener('timeupdate', () => {
      if (audioNode.duration) {
        updateScrubber(audioNode.currentTime * 1000, audioNode.currentTime / audioNode.duration, audioNode.duration * 1000);
      }
    });
  }
});

function formatTimeMs(ms) {
  if (isNaN(ms) || ms < 0 || ms === Infinity) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateScrubber(currentMs, relativePos, totalMs) {
  const progress = document.getElementById('scrubberProgress');
  const timeCurrent = document.getElementById('timeCurrent');
  const timeTotal = document.getElementById('timeTotal');
  
  if (progress) progress.style.width = (relativePos * 100) + '%';
  if (timeCurrent) timeCurrent.textContent = formatTimeMs(currentMs);
  if (timeTotal && totalMs) timeTotal.textContent = formatTimeMs(totalMs);
}

window.seekAudio = function(e) {
  const bar = document.getElementById('scrubberBar');
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const relativePos = clickX / rect.width;
  
  const sound = meditationSounds.find(s => s.id === currentSongId);
  if (sound && sound.url.includes('soundcloud.com')) {
    if (window.scWidget) {
      window.scWidget.getDuration((duration) => {
        window.scWidget.seekTo(duration * relativePos);
      });
    }
  } else {
    const audio = document.getElementById('audioPlayer');
    if (audio && audio.duration) {
      audio.currentTime = audio.duration * relativePos;
    }
  }
};


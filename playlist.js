// ============================================================
//  TollyVerse.mp3 — Playlist Management
//  • Works with Firestore + localStorage fallback
// ============================================================

// ── Persist helper (save to localStorage + fire-and-forget Firestore) ──
function persistPlaylists() {
  // Always save locally first
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      localStorage.setItem(`tv_playlists_${currentUser.uid}`, JSON.stringify(userPlaylists));
    } catch(e) {}

    // Non-blocking Firestore sync
    if (typeof db !== 'undefined') {
      db.collection('users').doc(currentUser.uid).update({
        playlists: userPlaylists
      }).catch(err => {
        console.warn('Firestore playlist sync failed (saved locally):', err);
      });
    }
  }
}

// ── Load playlists from localStorage fallback ─────────────────
window.loadLocalPlaylists = function() {
  if (typeof currentUser !== 'undefined' && currentUser) {
    try {
      const saved = localStorage.getItem(`tv_playlists_${currentUser.uid}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && userPlaylists.length === 0) {
          userPlaylists = parsed;
        }
      }
    } catch(e) {}
  }
};

// ── Create Playlist ───────────────────────────────────────────
window.createPlaylist = function() {
  if (!requireAuth('playlist')) return;
  const name = document.getElementById('playlistNameInput').value.trim();
  const desc = document.getElementById('playlistDescInput').value.trim();

  if (!name) {
    showAppToast('Please enter a playlist name.');
    return;
  }

  const newPlaylist = {
    id:        `pl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name:      name,
    desc:      desc,
    songs:     [],
    createdAt: new Date().toISOString()
  };

  userPlaylists.push(newPlaylist);
  persistPlaylists();

  closeModal('createPlaylistModal');
  renderPlaylists();
  showAppToast(`Playlist "${name}" created! 🎶`);
};

// ── Add Song to Playlist ──────────────────────────────────────
window.addSongToPlaylist = function(playlistId) {
  if (!currentSongId) {
    showAppToast('No song selected.');
    return;
  }

  const playlist = userPlaylists.find(p => p.id === playlistId);
  if (!playlist) return;

  // Avoid duplicates
  const isDuplicate = playlist.songs.some(item => 
    (typeof item === 'string' ? item : item.id) === currentSongId
  );
  if (isDuplicate) {
    showAppToast(`Already in "${playlist.name}".`);
    closeModal('addToPlaylistModal');
    return;
  }

  let songToSave = window.currentSongObj;
  if (!songToSave || String(songToSave.id) !== String(currentSongId)) {
    songToSave = (typeof allSongs !== 'undefined' ? allSongs.find(s => String(s.id) === String(currentSongId)) : null)
      || (typeof userRecentlyPlayed !== 'undefined' ? userRecentlyPlayed.find(s => String(s.id) === String(currentSongId)) : null)
      || {
        id: currentSongId,
        title: document.getElementById('playerTitle')?.textContent || 'Saved Track',
        artist: document.getElementById('playerArtist')?.textContent || 'Artist',
        coverArt: document.getElementById('playerCover')?.querySelector('img')?.src || '',
        isSpotify: true
      };
  }

  playlist.songs.push(songToSave);
  persistPlaylists();

  closeModal('addToPlaylistModal');
  renderPlaylists();
  openPlaylistDetail(playlistId);
  showAppToast(`Added to "${playlist.name}"! ✅`);
};

// ── Remove Song from Playlist ─────────────────────────────────
window.removeSongFromPlaylist = function(playlistId, songId) {
  const playlist = userPlaylists.find(p => p.id === playlistId);
  if (!playlist) return;

  playlist.songs = playlist.songs.filter(item => 
    (typeof item === 'string' ? item : item.id) !== songId
  );
  persistPlaylists();

  renderPlaylists();
  openPlaylistDetail(playlistId);
  showAppToast('Song removed from playlist.');
};

// ── Delete Playlist ───────────────────────────────────────────
window.deletePlaylist = function(playlistId) {
  if (!confirm('Delete this playlist?')) return;

  userPlaylists = userPlaylists.filter(p => p.id !== playlistId);
  persistPlaylists();

  showView('library');
  renderPlaylists();
  showAppToast('Playlist deleted.');
};

// ── Render Playlists ──────────────────────────────────────────
window.renderPlaylists = function() {
  loadLocalPlaylists();
  renderSidebarPlaylists();
  renderLibraryGrid();
};

function renderSidebarPlaylists() {
  const container = document.getElementById('sidebarPlaylistList');
  if (!container) return;
  if (!userPlaylists.length) {
    container.innerHTML = '<p class="playlist-empty-msg">No playlists yet.<br>Create one to get started!</p>';
    return;
  }

  container.innerHTML = '';
  userPlaylists.forEach(pl => {
    const btn = document.createElement('button');
    btn.className = 'sb-playlist-item';
    btn.onclick   = () => openPlaylistDetail(pl.id);
    btn.innerHTML = `
      <span class="sb-playlist-icon">🎵</span>
      <span>${escHtml(pl.name)}</span>
    `;
    container.appendChild(btn);
  });
}

function renderLibraryGrid() {
  const grid = document.getElementById('libraryPlaylistsGrid');
  if (!grid) return;
  if (!userPlaylists.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem">
        <div style="font-size:3rem;margin-bottom:1rem">🎵</div>
        <p class="empty-msg" style="margin-bottom:1rem">No playlists yet. Create your first one!</p>
        <button class="btn-primary" onclick="openCreatePlaylistModal()" style="display:inline-flex;gap:0.5rem;align-items:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Playlist
        </button>
      </div>`;
    return;
  }

  grid.innerHTML = '';
  userPlaylists.forEach(pl => {
    const firstItem = pl.songs[0];
    const firstSong = typeof firstItem === 'string' 
      ? (typeof allSongs !== 'undefined' ? allSongs.find(s => String(s.id) === String(firstItem)) : null)
      : firstItem;
    const coverImg = firstSong && typeof getSongCover === 'function' ? getSongCover(firstSong) : (firstSong?.coverArt || '');

    const card = document.createElement('div');
    card.className = 'playlist-grid-card';
    card.onclick   = () => openPlaylistDetail(pl.id);
    card.innerHTML = `
      <div class="playlist-grid-cover">${coverImg ? `<img src="${coverImg}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : '🎵'}</div>
      <div class="playlist-grid-name">${escHtml(pl.name)}</div>
      <div class="playlist-grid-meta">${pl.songs.length} song${pl.songs.length !== 1 ? 's' : ''}</div>
    `;
    grid.appendChild(card);
  });

  if (window.VanillaTilt) {
    VanillaTilt.init(document.querySelectorAll(".playlist-grid-card"), {
      max: 10, speed: 400, glare: true, "max-glare": 0.15, perspective: 1000, scale: 1.03
    });
  }
}

// ── Resolve Spotify Track Detail (Background fetch for string IDs) ──
window.resolveSpotifyTrackDetail = async function(playlistId, trackId) {
  if (!trackId) return;
  try {
    const baseUrl = 'http://localhost:3000';
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

    // Update in userPlaylists array permanently
    if (typeof userPlaylists !== 'undefined') {
      const pl = userPlaylists.find(p => p.id === playlistId);
      if (pl) {
        const idx = pl.songs.findIndex(s => (typeof s === 'string' ? s : s.id) === trackId);
        if (idx !== -1) {
          pl.songs[idx] = updatedSong;
          if (typeof persistPlaylists === 'function') persistPlaylists();
        }
      }
    }

    // Update DOM row immediately
    const titleEl = document.getElementById(`playlist-song-title-${trackId}`);
    const artistEl = document.getElementById(`playlist-song-artist-${trackId}`);
    const coverEl = document.getElementById(`playlist-song-cover-${trackId}`);

    if (titleEl) titleEl.textContent = updatedSong.title;
    if (artistEl) artistEl.textContent = updatedSong.artist;
    if (coverEl && coverUrl) {
      coverEl.innerHTML = `<img src="${coverUrl}" alt="${escHtml(updatedSong.title)}" style="width:100%;height:100%;object-fit:cover;" />`;
    }
  } catch (err) {
    console.warn('Failed to resolve Spotify track detail:', err);
  }
};

// ── Open Playlist Detail ──────────────────────────────────────
window.openPlaylistDetail = function(playlistId) {
  const pl = userPlaylists.find(p => p.id === playlistId);
  if (!pl) return;

  // Header cover image (first song's Spotify cover art)
  const firstItem = pl.songs[0];
  const firstSong = typeof firstItem === 'object' ? firstItem : null;
  const firstCover = firstSong ? (firstSong.coverArt || (typeof getSongCover === 'function' ? getSongCover(firstSong) : '')) : '';

  // Header
  const header = document.getElementById('playlistDetailHeader');
  header.innerHTML = `
    <div class="pd-cover" id="pdHeaderCover">
      ${firstCover ? `<img src="${firstCover}" alt="${escHtml(pl.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:16px" />` : '🎵'}
    </div>
    <div class="pd-info">
      <div style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;color:var(--muted);text-transform:uppercase">Playlist</div>
      <div class="pd-info-title">${escHtml(pl.name)}</div>
      <div class="pd-info-meta">${pl.desc ? escHtml(pl.desc) + ' · ' : ''}${pl.songs.length} songs</div>
      <div style="display:flex;gap:0.75rem;margin-top:1rem">
        <button class="btn-primary" onclick="playFirstSong('${pl.id}')">
          <svg viewBox="0 0 24 24" fill="white" style="width:16px;height:16px"><path d="M5 3l14 9-14 9V3z"/></svg>
          Play
        </button>
        <button class="btn-secondary" onclick="deletePlaylist('${pl.id}')">Delete</button>
      </div>
    </div>
  `;

  // Songs
  const songsInPlaylist = pl.songs
    .map(item => {
      if (typeof item === 'string') {
        let found = (typeof allSongs !== 'undefined') ? allSongs.find(s => String(s.id) === String(item)) : null;
        if (!found && typeof userRecentlyPlayed !== 'undefined') {
          found = userRecentlyPlayed.find(s => String(s.id) === String(item));
        }
        if (!found && typeof window.spotifySearchCache !== 'undefined') {
          found = window.spotifySearchCache.find(s => String(s.id) === String(item));
        }
        if (!found) {
          found = {
            id: item,
            title: 'Loading song details...',
            artist: 'Spotify',
            coverArt: '',
            isSpotify: true,
            needsResolve: true
          };
        }
        return found;
      }
      return item;
    })
    .filter(Boolean);

  const detailList = document.getElementById('playlistDetailSongs');
  detailList.innerHTML = '';

  if (!songsInPlaylist.length) {
    detailList.innerHTML = '<p class="empty-msg">No songs in this playlist yet.<br>Play a song and click "Add to Playlist".</p>';
  } else {
    songsInPlaylist.forEach((song, idx) => {
      const coverSrc = typeof getSongCover === 'function' ? getSongCover(song) : (song.coverArt || '');
      const row = document.createElement('div');
      row.className = 'song-row';
      row.onclick   = () => {
        if (song.isSpotify || (song.id && String(song.id).length > 15)) {
          if (typeof playSpotifySong === 'function') {
            playSpotifySong({
              id: song.id,
              name: song.title !== 'Loading song details...' ? song.title : 'Spotify Track',
              artists: [{ name: song.artist }],
              album: { images: coverSrc ? [{ url: coverSrc }] : [] }
            });
          } else if (typeof playSong === 'function') {
            playSong(song);
          }
        } else if (typeof playSong === 'function') {
          playSong(song);
        }
      };
      row.innerHTML = `
        <span class="song-row-num">${idx + 1}</span>
        <div class="song-row-cover" id="playlist-song-cover-${song.id}">
          ${coverSrc
            ? `<img src="${coverSrc}" alt="${escHtml(song.title)}" />`
            : `<span class="song-row-cover-icon">🎵</span>`
          }
        </div>
        <div class="song-row-info">
          <div class="song-row-title" id="playlist-song-title-${song.id}">${escHtml(song.title)}</div>
          <div class="song-row-artist" id="playlist-song-artist-${song.id}">${escHtml(song.artist)}</div>
        </div>
        <span class="song-row-genre">${escHtml(song.genre || (song.isSpotify ? 'SPOTIFY' : ''))}</span>
        <div class="song-row-rating"></div>
        <button class="song-row-more" title="Remove" onclick="event.stopPropagation(); removeSongFromPlaylist('${pl.id}','${song.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      `;
      detailList.appendChild(row);

      // If this song needs real Spotify detail resolution, launch background fetch
      if (song.needsResolve || song.title.startsWith('Loading song details...') || song.title.startsWith('Track ')) {
        resolveSpotifyTrackDetail(pl.id, song.id);
      }
    });
  }

  // Mark sidebar active
  document.querySelectorAll('.sb-playlist-item').forEach(b => {
    b.classList.toggle('active', b.querySelector('span:last-child').textContent === pl.name);
  });

  showView('playlist');
};

// ── Play first song in playlist ───────────────────────────────
window.playFirstSong = function(playlistId) {
  const pl = userPlaylists.find(p => p.id === playlistId);
  if (!pl || !pl.songs.length) { showAppToast('Playlist is empty!'); return; }

  const firstItem = pl.songs[0];
  const song = typeof firstItem === 'string' 
    ? (typeof allSongs !== 'undefined' ? allSongs.find(s => s.id === firstItem) : null)
    : firstItem;
  if (song) playSong(song);
};

// ── Render Add-to-Playlist Modal ──────────────────────────────
window.renderModalPlaylistList = function() {
  const container = document.getElementById('modalPlaylistList');
  if (!container) return;
  if (!userPlaylists.length) {
    container.innerHTML = '<p class="empty-msg">No playlists. Create one!</p>';
    return;
  }

  container.innerHTML = '';
  userPlaylists.forEach(pl => {
    const btn = document.createElement('button');
    btn.className = 'modal-playlist-item';
    btn.onclick   = () => addSongToPlaylist(pl.id);
    btn.innerHTML = `
      <span class="modal-playlist-icon">🎵</span>
      <span>${escHtml(pl.name)}</span>
      <span style="margin-left:auto;font-size:0.75rem;color:var(--muted)">${pl.songs.length} songs</span>
    `;
    container.appendChild(btn);
  });
};

// Helper (re-use from app.js scope)
function escHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

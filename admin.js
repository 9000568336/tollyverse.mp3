// ============================================================
//  TollyVerse.mp3 — Admin Panel Logic
// ============================================================

let adminUser  = null;
let allAdminSongs = [];
let editingId  = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('adminLoading');
  const denied  = document.getElementById('accessDenied');
  const shell   = document.getElementById('adminShell');

  // Bypass auth check entirely
  adminUser = {
    displayName: 'Admin (No Login)',
    email: 'admin@tollyverse.local',
    photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=Admin'
  };

  // Set admin info
  document.getElementById('adminName').textContent  = adminUser.displayName;
  document.getElementById('adminEmail').textContent = adminUser.email;
  document.getElementById('adminAvatar').src        = adminUser.photoURL;

  // Load data
  await loadAdminData();

  // Show shell
  if (loading) loading.classList.add('hidden');
  if (shell) shell.style.display = 'grid';
});

// ── Load Admin Data ───────────────────────────────────────────
async function loadAdminData() {
  await Promise.all([
    loadAdminSongs(),
    loadAdminStats()
  ]);
}

async function loadAdminSongs() {
  try {
    let fbSongs = [];
    try {
      const snap = await db.collection('songs')
        .orderBy('createdAt', 'desc')
        .get();
      fbSongs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Firestore load failed, falling back to local server API:', e);
      try {
        const res = await fetch('/api/songs');
        if (res.ok) {
          fbSongs = await res.json();
        }
      } catch (fetchErr) {
        console.error('Local server API fetch failed:', fetchErr);
      }
    }

    // -- LOCAL FALLBACK SYNC --
    const localSongs = JSON.parse(localStorage.getItem('tv_demo_songs') || '[]');

    // Quietly migrate localStorage songs to local server database if empty
    if (localSongs.length > 0 && fbSongs.length === 0) {
      localSongs.forEach(song => {
        fetch('/api/songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(song)
        }).catch(e => {});
      });
    }

    const merged = [...localSongs, ...fbSongs];
    const unique = [];
    const seen = new Set();
    for (const s of merged) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    allAdminSongs = unique.sort((a,b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeB - timeA;
    });

    renderAdminSongsTable(allAdminSongs);
    renderRecentSongs(allAdminSongs.slice(0, 5));
    document.getElementById('songCountBadge').textContent = `${allAdminSongs.length} songs`;

  } catch (err) {
    console.error('Load songs error:', err);
    showAdminToast('Error loading songs.', 'error');
  }
}

async function loadAdminStats() {
  try {
    // Songs count
    const songsSnap = await db.collection('songs').get();
    document.getElementById('statSongs').textContent = songsSnap.size;

    // Users count
    const usersSnap = await db.collection('users').get();
    document.getElementById('statUsers').textContent = usersSnap.size;

    // Total plays + ratings
    let totalPlays   = 0;
    let totalRatings = 0;
    songsSnap.forEach(doc => {
      const d = doc.data();
      totalPlays   += d.playCount    || 0;
      totalRatings += d.ratingCount  || 0;
    });
    document.getElementById('statPlays').textContent   = totalPlays;
    document.getElementById('statRatings').textContent = totalRatings;

  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ── Render Songs Table ────────────────────────────────────────
function renderAdminSongsTable(songs) {
  const tbody = document.getElementById('allSongsBody');
  tbody.innerHTML = '';

  if (!songs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--muted)">No songs yet. Add your first song!</td></tr>`;
    return;
  }

  songs.forEach((song, idx) => {
    const avgRating = song.ratingCount ? (song.totalRating / song.ratingCount).toFixed(1) : '—';
    const stars     = renderTableStars(avgRating);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted)">${idx + 1}</td>
      <td>
        <div class="table-cover">
          ${song.coverArt
            ? `<img src="${song.coverArt}" alt="${escHtml(song.title)}" />`
            : '🎵'
          }
        </div>
      </td>
      <td><strong>${escHtml(song.title)}</strong></td>
      <td style="color:var(--muted)">${escHtml(song.artist)}</td>
      <td><span class="table-badge">${escHtml(song.genre || '—')}</span></td>
      <td style="color:var(--muted)">${song.playCount || 0}</td>
      <td>
        <div class="table-stars">${stars}</div>
        <span style="font-size:0.72rem;color:var(--muted)">${avgRating} (${song.ratingCount || 0})</span>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="startEditSong('${song.id}')">Edit</button>
          <button class="action-btn delete" onclick="deleteSong('${song.id}', '${escHtml(song.title)}')">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecentSongs(songs) {
  const tbody = document.getElementById('recentSongsBody');
  tbody.innerHTML = '';

  if (!songs.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No songs yet.</td></tr>`;
    return;
  }

  songs.forEach((song, idx) => {
    const avgRating = song.ratingCount ? (song.totalRating / song.ratingCount).toFixed(1) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted)">${idx + 1}</td>
      <td><strong>${escHtml(song.title)}</strong></td>
      <td style="color:var(--muted)">${escHtml(song.artist)}</td>
      <td><span class="table-badge">${escHtml(song.genre || '—')}</span></td>
      <td style="color:var(--muted)">${song.playCount || 0}</td>
      <td style="color:#f59e0b">${avgRating} ⭐</td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="startEditSong('${song.id}')">Edit</button>
          <button class="action-btn delete" onclick="deleteSong('${song.id}', '${escHtml(song.title)}')">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Add / Edit Song ───────────────────────────────────────────
window.handleAddSong = async function(e) {
  e.preventDefault();

  const title      = document.getElementById('songTitle').value.trim();
  const artist     = document.getElementById('songArtist').value.trim();
  const spotifyUrl = document.getElementById('songSpotifyUrl').value.trim();
  const genre      = document.getElementById('songGenre').value;
  const coverArt   = document.getElementById('songCoverArt').value.trim();
  const editId     = document.getElementById('editSongId').value;

  if (!title || !artist || !spotifyUrl) {
    showAdminToast('Please fill in all required fields.', 'error');
    return;
  }

  // Validate Spotify URL
  if (!spotifyUrl.includes('spotify.com')) {
    showAdminToast('Please enter a valid Spotify URL.', 'error');
    return;
  }

  // Convert to embed URL
  const embedUrl = toSpotifyEmbedUrl(spotifyUrl);

  setAddBtnLoading(true);

  try {
    const songData = {
      title,
      artist,
      spotifyUrl,
      spotifyEmbedUrl: embedUrl,
      genre,
      coverArt,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editId) {
      // Update existing (don't await to prevent UI hang if offline/unauth)
      db.collection('songs').doc(editId).update(songData).catch(e => console.error(e));

      // Update on Local Server API
      fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, ...songData })
      }).catch(e => console.error('Local server update failed:', e));

      // -- LOCAL FALLBACK SYNC --
      const localSongs = JSON.parse(localStorage.getItem('tv_demo_songs') || '[]');
      const idx = localSongs.findIndex(s => s.id === editId);
      if (idx !== -1) localSongs[idx] = { ...localSongs[idx], ...songData };
      localStorage.setItem('tv_demo_songs', JSON.stringify(localSongs));

      showAdminToast(`"${title}" updated! ✅`, 'success');
    } else {
      // Add new (don't await to prevent UI hang if offline/unauth)
      const newSong = {
        ...songData,
        playCount:   0,
        totalRating: 0,
        ratingCount: 0,
        addedBy:     adminUser?.uid || 'local-admin',
        createdAt:   Date.now(),
        id:          'local_' + Date.now()
      };
      db.collection('songs').add(newSong).catch(e => console.error(e));

      // Save to Local Server API
      fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSong)
      }).catch(e => console.error('Local server save failed:', e));

      // -- LOCAL FALLBACK SYNC --
      const localSongs = JSON.parse(localStorage.getItem('tv_demo_songs') || '[]');
      localSongs.unshift(newSong);
      localStorage.setItem('tv_demo_songs', JSON.stringify(localSongs));

      showAdminToast(`"${title}" added to platform! 🎵`, 'success');
    }

    resetAddForm();
    loadAdminData(); // Refresh data asynchronously
    showAdminView('songs');

  } catch (err) {
    console.error('Add/edit song error:', err);
    showAdminToast('Failed to save song. Check console.', 'error');
  } finally {
    setAddBtnLoading(false);
  }
};

// ── Start Edit ────────────────────────────────────────────────
window.startEditSong = function(songId) {
  const song = allAdminSongs.find(s => s.id === songId);
  if (!song) return;

  editingId = songId;
  document.getElementById('addViewTitle').textContent  = 'Edit Song';
  document.getElementById('addBtnText').textContent    = '💾 Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.getElementById('editSongId').value = songId;

  document.getElementById('songTitle').value      = song.title || '';
  document.getElementById('songArtist').value     = song.artist || '';
  document.getElementById('songSpotifyUrl').value = song.spotifyUrl || '';
  document.getElementById('songGenre').value      = song.genre || '';
  document.getElementById('songCoverArt').value   = song.coverArt || '';

  if (song.coverArt) {
    document.getElementById('coverPreviewRow').style.display = 'flex';
    document.getElementById('coverPreviewImg').src = song.coverArt;
  }

  showAdminView('add');
};

window.resetAddForm = function() {
  document.getElementById('addSongForm').reset();
  document.getElementById('editSongId').value = '';
  editingId = null;
  document.getElementById('addViewTitle').textContent    = 'Add New Song';
  document.getElementById('addBtnText').textContent      = '🎵 Post Song';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('embedPreview').style.display  = 'none';
  document.getElementById('coverPreviewRow').style.display = 'none';
};

// ── Delete Song ───────────────────────────────────────────────
window.deleteSong = async function(songId, title) {
  if (!confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;

  try {
    db.collection('songs').doc(songId).delete().catch(e => console.error(e));
    
    // Delete on Local Server API
    fetch('/api/songs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Action': 'delete'
      },
      body: JSON.stringify({ id: songId })
    }).catch(e => console.error('Local server delete failed:', e));

    // -- LOCAL FALLBACK SYNC --
    let localSongs = JSON.parse(localStorage.getItem('tv_demo_songs') || '[]');
    localSongs = localSongs.filter(s => s.id !== songId);
    localStorage.setItem('tv_demo_songs', JSON.stringify(localSongs));

    showAdminToast(`"${title}" deleted.`, 'success');
    loadAdminData();
  } catch (err) {
    console.error('Delete error:', err);
    showAdminToast('Failed to delete song.', 'error');
  }
};

// ── Preview Spotify Embed ─────────────────────────────────────
window.previewSpotifyEmbed = function() {
  const url = document.getElementById('songSpotifyUrl').value.trim();
  if (!url || !url.includes('spotify.com')) {
    showAdminToast('Enter a valid Spotify URL first.', 'error');
    return;
  }
  const embedUrl = toSpotifyEmbedUrl(url);
  document.getElementById('previewIframe').src   = embedUrl;
  document.getElementById('embedPreview').style.display = 'flex';
};

// Cover art preview on URL input
document.addEventListener('DOMContentLoaded', () => {
  const coverInput = document.getElementById('songCoverArt');
  if (coverInput) {
    coverInput.addEventListener('input', () => {
      const url = coverInput.value.trim();
      if (url) {
        document.getElementById('coverPreviewRow').style.display = 'flex';
        document.getElementById('coverPreviewImg').src = url;
      } else {
        document.getElementById('coverPreviewRow').style.display = 'none';
      }
    });
  }
});

// ── Filter Admin Songs ────────────────────────────────────────
window.filterAdminSongs = function(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderAdminSongsTable(allAdminSongs);
    return;
  }
  const filtered = allAdminSongs.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.artist.toLowerCase().includes(q) ||
    (s.genre || '').toLowerCase().includes(q)
  );
  renderAdminSongsTable(filtered);
};

// ── View Switcher ─────────────────────────────────────────────
window.showAdminView = function(viewId) {
  document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view${capitalize(viewId)}`).classList.add('active');

  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`nav${capitalize(viewId)}`).classList.add('active');
};

// ── Sign Out ──────────────────────────────────────────────────
window.adminSignOut = function() {
  auth.signOut().then(() => window.location.href = 'index.html');
};

// ── Modal ─────────────────────────────────────────────────────
window.closeAdminModal = function(e) {
  if (e.target.id === 'editModal') {
    document.getElementById('editModal').classList.remove('open');
  }
};

// ── Toast ─────────────────────────────────────────────────────
function showAdminToast(msg, type = '') {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className   = `admin-toast show ${type}`;
  clearTimeout(window._adminToastTimer);
  window._adminToastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 3000);
}

// ── Helpers ───────────────────────────────────────────────────
function toSpotifyEmbedUrl(url) {
  const match = url.match(/\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
  if (match) {
    return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
  }
  return url;
}

function renderTableStars(avg) {
  const n = parseFloat(avg) || 0;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="tstar${i <= Math.round(n) ? ' filled' : ''}">★</span>`;
  }
  return html;
}

function setAddBtnLoading(loading) {
  document.getElementById('addBtnText').style.display   = loading ? 'none' : 'block';
  document.getElementById('addBtnLoader').style.display = loading ? 'block' : 'none';
  document.getElementById('addSongSubmitBtn').disabled  = loading;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

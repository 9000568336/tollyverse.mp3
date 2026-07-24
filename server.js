// ============================================================
//  TollyVerse.mp3 — Backend Server
//  Run with: node server.js
//  Then open: http://localhost:3000/index.html
// ============================================================

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 3000;

// ── Spotify Credentials ───────────────────────────────────────
const SPOTIFY_CLIENT_ID     = '89c5bb41c9004fbcbb3b22449eb609fd';
const SPOTIFY_CLIENT_SECRET = 'baf42f3e9ef74b038d10a1e6365d632f';
let spotifyToken  = null;
let tokenExpiry   = 0;

// ── Get Spotify Access Token ──────────────────────────────────
function getSpotifyToken() {
  return new Promise((resolve, reject) => {
    if (spotifyToken && Date.now() < tokenExpiry) {
      return resolve(spotifyToken);
    }
    const creds   = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const body    = 'grant_type=client_credentials';
    const req = https.request({
      hostname: 'accounts.spotify.com',
      path:     '/api/token',
      method:   'POST',
      headers:  {
        'Authorization': `Basic ${creds}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error('Spotify Auth: ' + json.error));
          spotifyToken = json.access_token;
          tokenExpiry  = Date.now() + (json.expires_in - 60) * 1000;
          resolve(spotifyToken);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Spotify API Proxy ─────────────────────────────────────────
function spotifyFetch(apiPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = await getSpotifyToken();
      const req = https.request({
        hostname: 'api.spotify.com',
        path:     apiPath,
        method:   'GET',
        headers:  { 'Authorization': `Bearer ${token}` }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', async () => {
          try {
            const json = JSON.parse(data);
            // If token expired, refresh once and retry
            if (json.error && json.error.status === 401) {
              spotifyToken = null;
              tokenExpiry  = 0;
              try {
                const t2  = await getSpotifyToken();
                const r2  = await spotifyFetch(apiPath);
                return resolve(r2);
              } catch(e2) { return reject(e2); }
            }
            resolve(json);
          } catch(e) { reject(new Error('Invalid Spotify response')); }
        });
      });
      req.on('error', reject);
      req.end();
    } catch(e) { reject(e); }
  });
}

// ── MIME Types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.mp4':  'video/mp4',
  '.woff': 'font/woff',
  '.woff2':'font/woff2'
};

// ── CORS Headers ──────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// ── In-Memory Song Store ──────────────────────────────────────
let songs = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'songs.json'), 'utf8');
  songs = JSON.parse(raw) || [];
} catch(e) { songs = []; }

function saveSongs() {
  try { fs.writeFileSync(path.join(__dirname, 'songs.json'), JSON.stringify(songs, null, 2)); } catch(e) {}
}

// ── Request Handler ───────────────────────────────────────────
function handler(req, res) {
  const urlObj  = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = urlObj.pathname;
  const query   = urlObj.searchParams;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ──────────────────────────────────────────────────────────
  // API: Spotify Search
  // ──────────────────────────────────────────────────────────
  if (urlPath === '/api/spotify/search' && req.method === 'GET') {
    const q     = query.get('q') || '';
    const type     = query.get('type') || 'track';
    const rawLimit = parseInt(query.get('limit') || '10', 10);
    const limit    = isNaN(rawLimit) || rawLimit <= 0 ? 10 : Math.min(rawLimit, 10);

    if (!q) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing q param' }));
      return;
    }

    spotifyFetch(`/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}&market=IN`)
      .then(data => {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        console.error('[Spotify Search]', err.message);
        res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // ──────────────────────────────────────────────────────────
  // API: Spotify Track Details
  // ──────────────────────────────────────────────────────────
  if (urlPath.startsWith('/api/spotify/track/') && req.method === 'GET') {
    const trackId = urlPath.replace('/api/spotify/track/', '').trim();
    if (!trackId) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing trackId' }));
      return;
    }

    spotifyFetch(`/v1/tracks/${trackId}`)
      .then(data => {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        console.error('[Spotify Track]', err.message);
        res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // ──────────────────────────────────────────────────────────
  // API: Songs CRUD
  // ──────────────────────────────────────────────────────────
  if (urlPath === '/api/songs') {

    // GET all songs
    if (req.method === 'GET') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(songs));
      return;
    }

    // POST - add song
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const song = JSON.parse(body);
          if (!song.id) song.id = Date.now().toString();
          songs = songs.filter(s => s.id !== song.id);
          songs.unshift(song);
          saveSongs();
          res.writeHead(201, { ...CORS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(song));
        } catch(e) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // DELETE song by id
  if (urlPath.startsWith('/api/songs/') && req.method === 'DELETE') {
    const id = urlPath.replace('/api/songs/', '').trim();
    songs = songs.filter(s => s.id !== id);
    saveSongs();
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ──────────────────────────────────────────────────────────
  // Static File Server
  // ──────────────────────────────────────────────────────────
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

  // Fallback: If requested subfolder path (e.g. /css/app.css or /js/app.js) doesn't exist, check root folder!
  if (!fs.existsSync(filePath)) {
    const baseName = path.basename(filePath);
    const rootPath = path.join(__dirname, baseName);
    if (fs.existsSync(rootPath)) {
      filePath = rootPath;
    }
  }

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - File not found: ' + urlPath);
      } else {
        res.writeHead(500); res.end('Server error');
      }
    } else {
      res.writeHead(200, { ...CORS, 'Content-Type': mime, 'Cache-Control': 'no-cache' });
      res.end(content);
    }
  });
}

// ── Start Server ──────────────────────────────────────────────
const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🎵  TollyVerse.mp3 Server  🎵      ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  ✅  http://localhost:${PORT}/           ║`);
  console.log(`║  🌐  http://localhost:${PORT}/index.html ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Please close the other server first, then run: node server.js\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

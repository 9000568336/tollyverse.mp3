const fs = require('fs');
const https = require('https');
const path = require('path');

const soundsDir = path.join(__dirname, 'assets', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

const sounds = [
  { name: 'rain.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Rain_on_a_Tin_Roof.ogg' },
  { name: 'ocean.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Ocean_waves.ogg' },
  { name: 'wind.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Wind_howling.ogg' },
  { name: 'forest.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Bird_singing_in_the_forest.ogg' },
  { name: 'fire.ogg', url: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Crackling_fireplace.ogg' }
];

async function downloadAll() {
  for (const s of sounds) {
    const dest = path.join(soundsDir, s.name);
    await new Promise((resolve) => {
      https.get(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200 && res.statusCode !== 302) {
          console.error(`Failed to download ${s.name}: ${res.statusCode}`);
          return resolve();
        }
        
        if (res.statusCode === 302) {
            https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
                const file = fs.createWriteStream(dest);
                res2.pipe(file);
                file.on('finish', () => { file.close(); console.log(`Downloaded ${s.name}`); resolve(); });
            }).on('error', () => resolve());
        } else {
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); console.log(`Downloaded ${s.name}`); resolve(); });
        }
      }).on('error', (err) => {
        console.error(`Error downloading ${s.name}: ${err.message}`);
        resolve();
      });
    });
  }
}

downloadAll();

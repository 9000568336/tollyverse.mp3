const fs = require('fs');
const https = require('https');
const path = require('path');

const soundsDir = path.join(__dirname, 'assets', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

const sounds = [
  { name: 'rain.mp3', url: 'https://cdn.pixabay.com/audio/2021/08/09/audio_33bc68846c.mp3' },
  { name: 'ocean.mp3', url: 'https://cdn.pixabay.com/audio/2021/08/09/audio_92cbabf7b8.mp3' },
  { name: 'wind.mp3', url: 'https://cdn.pixabay.com/audio/2021/09/06/audio_27ed876648.mp3' },
  { name: 'forest.mp3', url: 'https://cdn.pixabay.com/audio/2021/08/09/audio_03d2fb56e8.mp3' },
  { name: 'fire.mp3', url: 'https://cdn.pixabay.com/audio/2021/08/09/audio_e20e8354c0.mp3' }
];

async function downloadAll() {
  for (const s of sounds) {
    const dest = path.join(soundsDir, s.name);
    await new Promise((resolve, reject) => {
      https.get(s.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode !== 200) {
          console.error(`Failed to download ${s.name}: ${res.statusCode}`);
          return resolve();
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(`Downloaded ${s.name}`); resolve(); });
      }).on('error', (err) => {
        console.error(`Error downloading ${s.name}: ${err.message}`);
        resolve();
      });
    });
  }
}

downloadAll();

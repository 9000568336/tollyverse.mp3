const fs = require('fs');
const files = ['js/app.js', 'js/playlist.js', 'js/player.js'];

const OLD_BASE = /const baseUrl = window\.location\.protocol === 'file:' \? 'http:\/\/localhost:\d+' : '';/g;
const NEW_BASE = "const baseUrl = 'http://localhost:3000';";

const OLD_FETCH = /fetch\('http:\/\/localhost:\d+\/api\/songs'/g;
const NEW_FETCH = "fetch('/api/songs'";

files.forEach(f => {
  if (!fs.existsSync(f)) { console.log('SKIP:', f); return; }
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(OLD_BASE, NEW_BASE);
  c = c.replace(OLD_FETCH, NEW_FETCH);
  fs.writeFileSync(f, c);
  console.log('Fixed:', f);
});
console.log('All done!');

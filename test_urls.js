const https = require('https');
const urls = [
  'https://upload.wikimedia.org/wikipedia/commons/4/4b/Rain_on_a_Tin_Roof.ogg',
  'https://upload.wikimedia.org/wikipedia/commons/e/e0/Ocean_waves.ogg',
  'https://upload.wikimedia.org/wikipedia/commons/9/91/Wind_howling.ogg',
  'https://upload.wikimedia.org/wikipedia/commons/4/4c/Bird_singing_in_the_forest.ogg',
  'https://upload.wikimedia.org/wikipedia/commons/b/ba/Crackling_fireplace.ogg'
];
urls.forEach(url => {
  https.get(url, (res) => {
    console.log(`${res.statusCode} - ${url}`);
  }).on('error', e => console.error(e));
});

const fs = require('fs');
const { execSync } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDir = 'C:\\Users\\sujit\\.gemini\\antigravity-ide\\brain\\d57d27ce-5cfc-4142-9582-a061ec6dccc2';

const files = [
  { name: '1_index_html', path: 'index.html', title: 'tollyverse.mp3 — index.html' },
  { name: '2_style_css', path: 'css/app-v5.css', title: 'tollyverse.mp3 — style.css' },
  { name: '3_app_js', path: 'js/app-v5.js', title: 'tollyverse.mp3 — app.js' },
  { name: '4_player_js', path: 'js/player.js', title: 'tollyverse.mp3 — player.js' },
  { name: '5_playlist_js', path: 'js/playlist.js', title: 'tollyverse.mp3 — playlist.js' },
  { name: '6_server_js', path: 'server.js', title: 'tollyverse.mp3 — server.js' },
];

files.forEach(f => {
  if (fs.existsSync(f.path)) {
    const code = fs.readFileSync(f.path, 'utf8');
    const htmlWrapper = `<!DOCTYPE html><html><head><title>${f.title}</title><style>body { font-family: monospace; background: #0f172a; color: #f8fafc; padding: 2rem; white-space: pre-wrap; font-size: 11px; line-height: 1.5; } h1 { font-family: sans-serif; font-size: 18px; color: #c084fc; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 16px; }</style></head><body><h1>${f.title}</h1><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></body></html>`;
    const tempHtml = `scratch_${f.name}.html`;
    const pdfPath = `${outputDir}\\${f.name}.pdf`;
    fs.writeFileSync(tempHtml, htmlWrapper);
    try {
      const cwd = process.cwd().replace(/\\/g, '/');
      execSync(`"${edgePath}" --headless --print-to-pdf="${pdfPath}" "${cwd}/${tempHtml}"`);
      console.log(`Successfully generated ${f.name}.pdf`);
    } catch(e) {
      console.error(`Failed ${f.name}:`, e.message);
    }
  }
});

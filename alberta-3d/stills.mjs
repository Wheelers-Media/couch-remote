// Stills of the 3D scene: node stills.mjs "name|query" ...   (serve this folder on :8765 first) -> out/<name>.jpg
import { createRequire } from 'module'; import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
mkdirSync('out', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const s of process.argv.slice(2)) {
  const [name, qs] = s.split('|'), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log(name, 'PAGE ERROR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log(name, m.text().slice(0, 300)); });
  const t0 = Date.now();
  await p.goto(`http://localhost:8765/index.html?${qs}`, { timeout: 300000 }); await p.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  const d = await p.evaluate(() => { renderAt(6); return document.getElementById('c').toDataURL('image/jpeg', 0.9); });
  writeFileSync(`out/${name}.jpg`, Buffer.from(d.slice(d.indexOf(',') + 1), 'base64')); console.log(name, ((Date.now() - t0) / 1000).toFixed(1) + 's'); await p.close();
}
await b.close();

// Stills of the live scene under given conditions.
//   node stills.mjs <name>|<query> ...      e.g.  "moraine-day|loc=moraine&alt=25"   -> build/stills/<name>.jpg
import { createRequire } from 'module'; import { mkdirSync, writeFileSync } from 'fs'; import { resolve } from 'path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
mkdirSync('build/stills', { recursive: true });
const b = await chromium.launch();
await Promise.all(process.argv.slice(2).map(async s => {
  const [name, qs] = s.split('|'), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log(name, 'PAGE ERROR', e.message));
  await p.goto(`file://${resolve('build/alberta-live.html')}?render=1&${qs}`); await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const t0 = Date.now();
  const d = await p.evaluate(() => { renderAt(6); return document.getElementById('c').toDataURL('image/jpeg', 0.9); });
  writeFileSync(`build/stills/${name}.jpg`, Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
  console.log(name, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}));
await b.close();

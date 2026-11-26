// A short MP4 of the live scene: node clip.mjs "<query>" <seconds> <out.mp4>
import { createRequire } from 'module'; import { spawn } from 'child_process'; import { resolve } from 'path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [qs, secs, out] = process.argv.slice(2), fps = 24, n = Math.round(+secs * fps);
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGE ERROR', e.message));
await p.goto(`file://${resolve('build/alberta-live.html')}?render=1&${qs}`); await p.waitForFunction(() => window.__ready === true);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out]);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const d = await p.evaluate(t => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.9); }, i / fps);
  ff.stdin.write(Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
  if (i % 48 === 0) console.log(i, '/', n, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('wrote', out);

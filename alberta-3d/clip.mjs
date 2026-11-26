// A short MP4 of the 3D scene (serve this folder on :8765 first): node clip.mjs "<query>" <seconds> <fps> <out.mp4>
import { createRequire } from 'module'; import { spawn } from 'child_process';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const [qs, secs, fpsS, out] = process.argv.slice(2), fps = +fpsS, n = Math.round(+secs * fps);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:8765/index.html?${qs}`, { timeout: 300000 }); await p.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-vf', 'fps=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]);
for (let i = 0; i < n; i++) {
  const d = await p.evaluate(t => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.9); }, i / fps);
  ff.stdin.write(Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'));
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('wrote', out);

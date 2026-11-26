// ---------- Rockies kit: painted mountains, spruces, a mirror lake, a log cabin ----------
// Built on the painting tools (dab, bristle, paintRegion, ink). Every function paints into a plate once;
// nothing here runs per frame.

// a ridgeline from a few hand-placed summits, roughened by midpoint displacement (seeded)
function ridgeLine(keys, seed, rough = 60, x0 = -80, x1 = W + 80) {
  const r = RNG(seed);
  let pts = keys.map(k => [k[0], k[1]]);
  for (let k = 0; k < 6; k++) {
    const out = [pts[0]], amp = rough / Math.pow(1.85, k);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([(a[0] + b[0]) / 2 + (r() - 0.5) * (b[0] - a[0]) * 0.22, (a[1] + b[1]) / 2 + (r() - 0.5) * amp], b);
    }
    pts = out;
  }
  return pts;
}
// the y of a polyline at x
function lineY(pts, x) {
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (x - a[0]) / Math.max(1, b[0] - a[0])); }
  return pts[pts.length - 1][1];
}
// the summits: points higher than everything within `reach` px either side
function summits(pts, reach = 70, minH = 30, base = H) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    let top = true;
    for (let j = 0; j < pts.length; j++) if (j !== i && Math.abs(pts[j][0] - pts[i][0]) < reach && pts[j][1] < pts[i][1]) { top = false; break; }
    if (top && base - pts[i][1] > minH) out.push(i);
  }
  return out;
}

// A painted mountain range. pal: { rock, rockLt, rockDk, shade, snow, snowSh, haze }, L: light ({lx, ly}),
// o: { base (y of the foot), snowLine (y above which snow lies), seed, ink (line colour or null), hazeA, strata }
function alpine(g, ridge, pal, L, o) {
  const base = o.base, r = RNG(o.seed || 1), lightLeft = L.lx < 0;
  const body = [[ridge[0][0], base + 40], ...ridge, [ridge[ridge.length - 1][0], base + 40]];
  const tops = summits(ridge, o.reach ?? 70, 30, base);
  // 1. rock: the lit colour, worked with strokes that follow the fall line
  paintRegion(g, body, pal.rock, r, {
    size: o.size ?? 26, dens: 1.1, a: 0.32, stretch: 1.6, angVar: 0.5, ang: Math.PI / 2 * 0.85,
    colAt: (x, y, rr) => jit(rr() < 0.5 ? pal.rockLt : pal.rock, rr, 12), dry: 0.35,
  });
  g.save(); path(g, body); g.clip();
  // 2. strata: long dry-brush ledges, slightly tilted (the Front Ranges are layered limestone)
  if (o.strata !== false) {
    const tilt = o.tilt ?? -0.12;
    for (let i = 0; i < (o.strataN ?? 70); i++) {
      const x = lerp(ridge[0][0], ridge[ridge.length - 1][0], r()), top = lineY(ridge, x), y = lerp(top + 12, base, Math.pow(r(), 0.8));
      bristle(g, x, y, 60 + r() * 160, 5 + r() * 6, tilt + (r() - 0.5) * 0.06, r() < 0.55 ? pal.rockDk : pal.rockLt, 0.3, r, 5);
    }
  }
  // 3. snow: above the snow line, thicker on gentle ground, ending in a torn edge; couloirs run down from it
  if (o.snowLine != null) {
    const sl = o.snowLine;
    const snowPts = [[ridge[0][0], -10]];
    for (let x = ridge[0][0]; x <= ridge[ridge.length - 1][0]; x += 12) snowPts.push([x, -10]);
    const edge = [];
    for (let x = ridge[ridge.length - 1][0]; x >= ridge[0][0]; x -= 10) edge.push([x, sl + 26 * n1(x / 37, o.seed) + 14 * n1(x / 11, o.seed + 3)]);
    paintRegion(g, snowPts.concat(edge), pal.snow, r, { size: 18, dens: 1.2, a: 0.35, stretch: 1.4, ang: 0.9, angVar: 1.2, colAt: (x, y, rr) => jit(rr() < 0.6 ? pal.snow : pal.snowSh, rr, 8) });
    for (const i of tops) {
      const p = ridge[i];
      if (p[1] > sl + 40) continue;
      for (let k = 0; k < 5 + r() * 5; k++) {
        const sx = p[0] + (r() - 0.5) * 120, sy = Math.max(p[1] + 20, sl - 10 + r() * 40), len = 60 + r() * 160;
        bristle(g, sx, sy + len / 2, len, 6 + r() * 8, Math.PI / 2 + (r() - 0.5) * 0.5, pal.snow, 0.55, r, 4);
      }
    }
  }
  // 4. the faces turned from the light: from each summit along the ridge to the next hollow, then down a diagonal spine
  for (let n = 0; n < tops.length; n++) {
    const a = tops[n], b = lightLeft ? (tops[n + 1] ?? ridge.length - 1) : (tops[n - 1] ?? 0), st = a < b ? 1 : -1;
    let lo = a; for (let k = a; k !== b; k += st) if (ridge[k][1] > ridge[lo][1]) lo = k;
    // the shaded side of the peak is a pyramid face: from the summit along the ridge to the hollow, then out and down
    // to the foot, widening as it goes; its inner edge (the ridge line facing us) runs down from the summit at a slant
    const span = ridge[lo][0] - ridge[a][0], hgt = base - ridge[a][1], dir = Math.sign(span || (lightLeft ? 1 : -1));
    const face = [];
    for (let k = a; k !== lo + st; k += st) face.push(ridge[k]);
    face.push([ridge[lo][0] + dir * hgt * 0.35, base + 40]);
    const spineX = ridge[a][0] + dir * hgt * (0.12 + 0.1 * r());
    face.push([spineX, base + 40]);
    // the spine wanders a little on its way down
    face.push([lerp(ridge[a][0], spineX, 0.55) - dir * hgt * 0.04, lerp(ridge[a][1], base, 0.55)]);
    if (face.length < 4) continue;
    paintRegion(g, face, pal.shade, r, { size: 22, dens: 1.0, a: 0.3, stretch: 1.5, ang: Math.PI / 2 * 0.8, angVar: 0.6, colAt: (x, y, rr) => jit(rr() < 0.7 ? pal.shade : pal.rockDk, rr, 10), dry: 0.3 });
    // a lit rim along the ridge on the sunny side of the summit
    ink(g, densify([ridge[Math.max(0, a - 3 * st)], ridge[a]], false, 6), 3, { col: css(pal.rockLt), a: 0.55, t0: 0.4, t1: 0.1, seed: a });
  }
  // 5. haze rising from the valley
  const hz = g.createLinearGradient(0, base - (o.hazeH ?? 260), 0, base + 30);
  hz.addColorStop(0, css(pal.haze, 0)); hz.addColorStop(1, css(pal.haze, o.hazeA ?? 0.55));
  g.fillStyle = hz; g.fillRect(ridge[0][0], base - (o.hazeH ?? 260), ridge[ridge.length - 1][0] - ridge[0][0], (o.hazeH ?? 260) + 80);
  g.restore();
  // 6. a broken ink edge on the nearer ranges only
  if (o.ink) {
    for (let s = 0; s < ridge.length - 6; s += 5 + Math.floor(r() * 6)) {
      const seg2 = ridge.slice(s, s + 4 + Math.floor(r() * 8));
      if (seg2.length > 2 && r() < 0.75) ink(g, seg2, o.inkW ?? 2.2, { col: o.ink, a: o.inkA ?? 0.55, seed: s, t0: 0.3, t1: 0.3, min: 0.1 });
    }
  }
}

// A spruce: drooping tiers, narrow at the top, lit on the sun's side; snow on the tiers in winter.
// pal: { dk, mid, lt, snow }, o: { snow (0..1), ink, seed, lean }
function spruce(g, x, y, h, pal, L, r, o = {}) {
  const tiers = Math.max(6, Math.round(h / 16)), lean = o.lean ?? 0, lit = L.lx < 0 ? -1 : 1;
  // trunk
  if (h > 60) { const tw = Math.max(2, h * 0.025); path(g, [[x - tw, y], [x + tw, y], [x + tw * 0.4 + lean * h, y - h * 0.9], [x - tw * 0.4 + lean * h, y - h * 0.9]]); g.fillStyle = css(mixv(pal.dk, '#2a1a12', 0.5)); g.fill(); }
  const sil = [];
  for (let k = 0; k < tiers; k++) {
    const t = (k + 1) / tiers, ty = y - h + t * h * 0.9, cx = x + lean * h * (1 - t);
    const w = h * (0.04 + 0.2 * Math.pow(t, 0.95)) * (0.75 + 0.45 * r()), drop = h * (0.035 + 0.03 * r());
    const lw = w * (0.85 + 0.3 * r()), rw = w * (0.85 + 0.3 * r());
    const tier = [[cx + (r() - 0.5) * 2, ty - h * 0.1]];
    // the branch ends hang down, with a few ragged tips along the bottom
    tier.push([cx - lw * 0.55, ty - h * 0.02], [cx - lw, ty + drop], [cx - lw * 0.82, ty + drop * 0.55]);
    for (let j = 1; j < 5; j++) tier.push([cx - lw * 0.82 + lw * 1.64 * j / 5, ty + drop * (0.35 + 0.4 * r())]);
    tier.push([cx + rw * 0.82, ty + drop * 0.55], [cx + rw, ty + drop], [cx + rw * 0.55, ty - h * 0.02]);
    path(g, tier); g.fillStyle = css(jit(pal.dk, r, 6)); g.fill();
    // the lit side: a lighter wedge worked with needle dabs
    g.save(); path(g, tier); g.clip();
    for (let d = 0; d < Math.max(3, w * 0.5); d++) {
      const u = r(), px = cx + lit * lw * (0.15 + 0.8 * u), py = ty - h * 0.04 + drop * u * 0.9 + (r() - 0.5) * drop;
      dab(g, px, py, Math.max(3, w * 0.35), Math.max(1.5, w * 0.1), lit < 0 ? 2.6 + (r() - 0.5) * 0.4 : 0.5 + (r() - 0.5) * 0.4, jit(r() < 0.6 ? pal.mid : pal.lt, r, 10), 0.75, r);
    }
    if (o.snow > 0.05) {
      for (let d = 0; d < Math.max(2, w * 0.25); d++) {
        const u = r(), px = cx + (r() - 0.5) * (lw + rw) * 0.8, py = ty - h * 0.03 + drop * 0.25 * u;
        dab(g, px, py, Math.max(3, w * 0.4), Math.max(1.5, w * 0.12), (r() - 0.5) * 0.3, jit(pal.snow, r, 6), 0.85 * o.snow, r);
      }
    }
    g.restore();
    sil.push(tier);
  }
  if (o.ink && h > 80) for (const tier of sil) ink(g, tier.slice(1, -1), Math.max(1, h * 0.006), { col: o.ink, a: 0.5, seed: Math.floor(x + y), t0: 0.3, t1: 0.3, min: 0.2 });
}
// a band of distant forest: many small spruce spikes along a line, darker at the foot
function forestBand(g, x0, x1, yAt, n, hMin, hMax, pal, L, r, o = {}) {
  const trees = [];
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, (i + r()) / n); trees.push([x, yAt(x) + r() * (o.depth ?? 8), lerp(hMin, hMax, Math.pow(r(), 1.5))]); }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, h] of trees) {
    if (h < 26) { // far: one painted spike
      path(g, [[x, y - h], [x - h * 0.22, y], [x + h * 0.22, y]]); g.fillStyle = css(jit(pal.dk, r, 8)); g.fill();
      dab(g, x + (L.lx < 0 ? -1 : 1) * h * 0.07, y - h * 0.45, h * 0.5, h * 0.12, Math.PI / 2, jit(pal.mid, r, 8), 0.6, r);
      if (o.snow > 0.05) dab(g, x, y - h * 0.7, h * 0.25, h * 0.08, 0, pal.snow, 0.6 * o.snow, r);
    } else spruce(g, x, y, h, pal, L, r, { snow: o.snow });
  }
}

// the lake: what is above the waterline, mirrored and darkened into the water colour, then worked with
// horizontal strokes; frozen, it is snow-covered ice with only a faint gloss
function lakePlate(g, above, wl, pal, r, o = {}) {
  const h = H - wl;
  g.save(); g.beginPath(); g.rect(0, wl, W, h); g.clip();
  if (o.frozen) {
    paintRegion(g, [[0, wl], [W, wl], [W, H], [0, H]], pal.ice, r, { size: 50, dens: 0.6, a: 0.25, stretch: 3, ang: 0, angVar: 0.08, colAt: (x, y, rr) => jit(rr() < 0.5 ? pal.ice : pal.iceSh, rr, 8) });
  } else {
    g.save(); g.translate(0, wl * 2); g.scale(1, -1); g.globalAlpha = 0.85; g.drawImage(above, 0, 0, W, H); g.restore();
    const wg = g.createLinearGradient(0, wl, 0, H);
    wg.addColorStop(0, css(pal.water, 0.35)); wg.addColorStop(1, css(pal.waterDk, 0.75));
    g.fillStyle = wg; g.fillRect(0, wl, W, h);
    // painted ripples: long horizontal strokes, longer and further apart nearer the viewer
    for (let i = 0; i < 520; i++) {
      const u = Math.pow(r(), 1.3), y = wl + 2 + u * h, len = 60 + u * 420 * r();
      dab(g, r() * W, y, len, 1.5 + u * 5, (r() - 0.5) * 0.01, jit(r() < 0.5 ? pal.waterLt : pal.waterDk, r, 8), 0.12 + 0.2 * r(), r);
    }
  }
  // a pale line where the water meets the far shore
  for (let i = 0; i < 40; i++) dab(g, r() * W, wl + 1 + r() * 3, 80 + r() * 260, 2 + r() * 2, 0, pal.shoreLine, 0.4, r);
  g.restore();
}

// a log cabin: inked cels, logs, a roof (snow on it in winter), chimney, warm windows at night
function cabin(g, x, y, s, pal, L, o = {}) {
  const k = s / 40, P2 = (pts) => pts.map(p => [x + p[0] * k, y + p[1] * k]);   // s: the cabin's half width in px
  const LW = 2.2 * s / 40;
  // walls
  cels(g, P2([[-40, 0], [40, 0], [40, -34], [-40, -34]]), { base: pal.log, sh: pal.logSh, sw: 6 * s / 40, L, line: P.ink, lw: LW, seed: 61,
    after: gg => { for (let i = 1; i < 6; i++) seam(gg, P2([[-40, -34 + i * 6], [40, -34 + i * 6]]), 1.2 * s / 40, pal.logSh, 70 + i, 0.8);
      // windows
      for (const wx of [-26, 14]) { const wp = P2([[wx, -24], [wx + 12, -24], [wx + 12, -12], [wx, -12]]); path(gg, wp); gg.fillStyle = css(o.glow > 0.05 ? mixv(pal.winOff, pal.winOn, o.glow) : pal.winOff); gg.fill(); seam(gg, P2([[wx + 6, -24], [wx + 6, -12]]), 1 * s / 40, P.ink, 80, 0.7); }
      path(gg, P2([[-6, 0], [6, 0], [6, -20], [-6, -20]])); gg.fillStyle = css(pal.door); gg.fill(); } });
  // chimney
  cels(g, P2([[18, -44], [26, -44], [26, -62], [18, -62]]), { base: pal.stone, sh: pal.logSh, sw: 2, L, line: P.ink, lw: LW * 0.8, seed: 62 });
  // roof
  const roof = P2([[-48, -32], [0, -58], [48, -32], [44, -28], [0, -52], [-44, -28]]);
  cels(g, roof, { base: pal.roof, sh: pal.roofSh, sw: 4 * s / 40, L, line: P.ink, lw: LW, seed: 63 });
  if (o.snow > 0.1) { path(g, P2([[-48, -33], [0, -59], [48, -33], [40, -31], [0, -53], [-40, -31]])); g.fillStyle = css(pal.snow, o.snow); g.fill(); }
  if (o.glow > 0.05) { const gl = g.createRadialGradient(x, y - 18 * s / 40, 0, x, y - 18 * s / 40, 90 * s / 40); gl.addColorStop(0, `rgba(255,190,110,${0.3 * o.glow})`); gl.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gl; g.fillRect(x - 100 * s / 40, y - 110 * s / 40, 200 * s / 40, 160 * s / 40); }
  return [x + 22 * k, y - 62 * k];   // the chimney's top, for the smoke
}

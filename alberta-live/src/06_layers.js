// ---------- the layered look: flat silhouette ranges stepping from hazy to dark, valley mist, spruce treelines ----------
// Each layer is one flat colour on a ramp from the sky's haze (far) to near-black (near), so depth comes from
// atmosphere, as in classic poster landscapes. Sharp edges, no texture: the layers are perfect planes for the
// camera to glide through, and they recolour cleanly for any time of day or weather.

// a crisp spruce silhouette: tiers of drooping branches with ragged tips
function spruceSil(g, x, y, h, col, r, lean = 0) {
  const tiers = Math.max(5, Math.round(h / 12)), pts = [[x + lean * h, y - h]];
  const L = [], R = [];
  for (let k = 0; k < tiers; k++) {
    const t = (k + 1) / tiers, ty = y - h + t * h * 0.92, cx = x + lean * h * (1 - t), w = h * (0.05 + 0.2 * Math.pow(t, 0.9)) * (0.8 + 0.4 * r());
    const up = h * 0.055 * Math.min(1, t * 2.2);   // the branch tips flick up less near the top, so none rise above the apex
    L.push([cx - w * 0.45, ty - up], [cx - w, ty + h * 0.012 * (1 + r())]);
    R.push([cx + w * 0.45, ty - up], [cx + w, ty + h * 0.012 * (1 + r())]);
  }
  const trunkW = Math.max(1, h * 0.018);
  const poly = pts.concat(L, [[x - trunkW, y - h * 0.04], [x - trunkW, y + 2], [x + trunkW, y + 2], [x + trunkW, y - h * 0.04]], R.reverse());
  path(g, poly); g.fillStyle = col; g.fill();
}
// a serrated treeline along a ridge: tall thin spruces whose tips break the skyline
function treeline(g, ridge, x0, x1, n, hMin, hMax, col, r, o = {}) {
  const sp = [];
  for (let i = 0; i < n; i++) { const x = lerp(x0, x1, (i + r()) / n); sp.push([x, lineY(ridge, x) + (o.sink ?? 6) + r() * (o.depth ?? 10), lerp(hMin, hMax, Math.pow(r(), 1.3))]); }
  for (const [x, y, h] of sp) spruceSil(g, x, y, h, col, r, (r() - 0.5) * 0.04);
}
// a flat range: the silhouette in its colour, lit faces and snow caps as flat shapes, mist rising from its foot
function flatRange(g, ridge, base, col, o = {}) {
  const r = RNG(o.seed || 1), body = [[ridge[0][0], H + 40], ...ridge, [ridge[ridge.length - 1][0], H + 40]];
  // the layer's body: a gradient, lighter at the crest (haze and backlight) and deeper at the foot
  const crest = Math.min(...ridge.map(q => q[1])), bg = g.createLinearGradient(0, crest, 0, base + 40);
  bg.addColorStop(0, css(o.crestCol ? mixv(col, o.crestCol, 0.35) : col)); bg.addColorStop(1, css(o.footCol ? mixv(col, o.footCol, 0.25) : col));
  path(g, body); g.fillStyle = bg; g.fill();
  g.save(); path(g, body); g.clip();
  if (o.lit || o.snow) {
    const tops = summits(ridge, o.reach ?? 70, 24, base);
    for (const a of tops) {
      const p = ridge[a], hgt = base - p[1];
      if (hgt < 30) continue;
      // the lit face: from the summit down the sunny side, a flat lighter wedge
      const near = (q, w) => Math.abs(q[0] - p[0]) < w;
      // the lit face: a narrow triangle from the summit down the sunny side
      if (o.lit) {
        const dir = o.lightLeft ? -1 : 1, w = hgt * 0.42, face = [p];
        for (let k = a + dir; k > 0 && k < ridge.length - 1 && near(ridge[k], w); k += dir) face.push(ridge[k]);
        face.push([p[0] + dir * hgt * 0.04, p[1] + hgt * 0.62]);
        if (face.length > 2) { path(g, face); g.fillStyle = css(o.lit, o.litA ?? 1); g.fill(); }
      }
      // snow: a small cap on this summit only, its lower edge torn
      if (o.snow && p[1] < o.snowLine) {
        const w = hgt * 0.2, depth = hgt * 0.2, cap = [];
        let k0 = a, k1 = a;
        while (k0 > 0 && near(ridge[k0 - 1], w)) k0--;
        while (k1 < ridge.length - 1 && near(ridge[k1 + 1], w)) k1++;
        for (let k = k0; k <= k1; k++) cap.push(ridge[k]);
        const n = 6;
        for (let i = 0; i <= n; i++) { const u = 1 - i / n, x = lerp(ridge[k0][0], ridge[k1][0], u); const e = Math.abs(u * 2 - 1); cap.push([x, Math.min(lineY(ridge, x) + 2 + depth * 0.25 * (1 - e), p[1] + depth * (1 - 0.7 * e) + (i % 2 ? 1 : -0.6) * depth * 0.2 * r())]); }
        path(g, cap); g.fillStyle = css(o.snow); g.fill();
      }
    }
  }
  if (o.rim) { // a thin rim of light along the crest, strongest on the slopes that face the light
    g.lineJoin = 'round';
    for (let i = 1; i < ridge.length; i++) {
      const a = ridge[i - 1], b = ridge[i], slope = (b[1] - a[1]) / Math.max(1, b[0] - a[0]), facing = (o.lightLeft ? -slope : slope);
      const k = clamp(0.35 + facing * 1.2);
      if (k < 0.05) continue;
      g.strokeStyle = css(o.rim, (o.rimA ?? 0.7) * k); g.lineWidth = o.rimW ?? 2;
      g.beginPath(); g.moveTo(a[0], a[1] + 1); g.lineTo(b[0], b[1] + 1); g.stroke();
    }
  }
  if (o.mist) { // mist pooled at the layer's foot: towards the haze colour
    const m = g.createLinearGradient(0, base - (o.mistH ?? 120), 0, base + 20);
    m.addColorStop(0, css(o.mist, 0)); m.addColorStop(1, css(o.mist, o.mistA ?? 0.55));
    g.fillStyle = m; g.fillRect(ridge[0][0], base - (o.mistH ?? 120), ridge[ridge.length - 1][0] - ridge[0][0], (o.mistH ?? 120) + 60);
  }
  g.restore();
}
// stylized clouds: long wisps with a lit lower edge, like brushed bands
function wisp(g, cx, cy, len, th, body, lit, r) {
  const n = 22, top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = cx + (u - 0.5) * len, env = Math.pow(Math.sin(Math.PI * u), 0.7), wave = Math.sin(u * 7 + cx) * th * 0.25;
    top.push([x, cy - th * env * (0.7 + 0.3 * n1(u * 5, cx)) + wave]); bot.push([x, cy + th * env * 0.35 + wave * 0.5]);
  }
  path(g, top.concat(bot.reverse())); g.fillStyle = css(body); g.fill();
  const litB = bot.slice().reverse().map((p, i) => [p[0], p[1] - th * 0.18 * Math.sin(Math.PI * i / n)]);
  path(g, bot.slice().reverse().concat(litB.reverse())); g.fillStyle = css(lit); g.fill();
}

// colours for the layered look, by the sun's height: the ramp's far (haze) and near ends, the sky, a glow
const LAYER_KEYS = [
  { alt: -18, top: '#030716', hor: '#1d3f8c', far: '#3a5aa8', near: '#06061a', glow: '#9fc4ff', lit: '#6f8fd8', snow: '#b8c8f0', water: '#0e1c48' },
  { alt: -7, top: '#0c1440', hor: '#6a4e9a', far: '#7a68b0', near: '#100a26', glow: '#ff9ac0', lit: '#a08ad0', snow: '#d0c0ec', water: '#24204e' },
  { alt: -1, top: '#2a2456', hor: '#f08a4a', far: '#b0708a', near: '#1a0c1e', glow: '#ffb060', lit: '#e8906a', snow: '#ffd0b0', water: '#3a2440' },
  { alt: 4, top: '#4a4a8a', hor: '#ffc070', far: '#c08a7a', near: '#24142a', glow: '#ffe0a0', lit: '#f0b080', snow: '#ffe4cc', water: '#5a4060' },
  { alt: 12, top: '#3c78c0', hor: '#cfe4f0', far: '#8fb0c8', near: '#0e2a22', glow: '#ffffff', lit: '#b8d0c0', snow: '#ffffff', water: '#2a7088' },
  { alt: 35, top: '#2f74c8', hor: '#d8ecf4', far: '#86aec4', near: '#0c2a20', glow: '#ffffff', lit: '#a8c8b8', snow: '#ffffff', water: '#2a8098' },
];
function layerPalette(S) {
  const p = keyed(LAYER_KEYS, S.sunAlt);
  const ov = clamp((S.cloud - 0.55) / 0.45) * 0.8 + S.fog * 0.35, grey = c => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l, l, l * 1.05]; };
  for (const k in p) { let c = mixv(p[k], grey(p[k]), Math.min(0.85, ov)); if (S.rain) c = mixv(c, [0, 0, 0], S.rain * 0.2 + S.storm * 0.2); if (S.snow || S.fog) c = mixv(c, [210, 216, 226], (S.snow * 0.2 + S.fog * 0.3) * (S.sunAlt > -6 ? 1 : 0.3)); p[k] = c; }
  p.ov = ov; p.dark = clamp((-S.sunAlt - 4) / 8);
  return p;
}
// each location as layers, far to near: [keys (ridge), z (depth), kind ('peaks' | 'hills'), trees per 1000 px]
const LAYOUT = {
  moraine: { wl: 742, layers: [
    [[[-120, 520], [200, 470], [520, 450], [860, 430], [1200, 455], [1560, 440], [2040, 490]], 140, 'peaks', 0],
    [[[-120, 600], [60, 500], [170, 455], [290, 500], [400, 410], [520, 468], [630, 380], [740, 425], [860, 358], [960, 410], [1070, 370], [1170, 420], [1280, 384], [1390, 445], [1500, 415], [1620, 480], [1760, 455], [1900, 530], [2040, 570]], 70, 'peaks', 0],
    [[[-120, 540], [120, 580], [380, 620], [600, 650], [900, 665], [1250, 650], [1500, 600], [1760, 560], [2040, 540]], 36, 'hills', 55],
    [[[-120, 620], [300, 670], [700, 705], [1100, 712], [1500, 680], [2040, 630]], 22, 'hills', 80],
  ] },
  rundle: { wl: 752, layers: [
    [[[-120, 560], [300, 520], [700, 540], [1100, 510], [1500, 490], [2040, 530]], 140, 'peaks', 0],
    [[[-120, 700], [200, 680], [420, 630], [640, 570], [820, 510], [980, 452], [1120, 402], [1200, 378], [1250, 386], [1300, 480], [1360, 570], [1440, 620], [1600, 610], [1800, 650], [2040, 670]], 70, 'peaks', 0],
    [[[-120, 600], [200, 630], [500, 665], [900, 690], [1300, 680], [1700, 620], [2040, 600]], 34, 'hills', 55],
    [[[-120, 650], [400, 700], [900, 725], [1400, 715], [2040, 660]], 20, 'hills', 80],
  ] },
  peyto: { wl: 842, layers: [
    [[[-120, 470], [250, 430], [600, 450], [960, 420], [1300, 440], [1650, 410], [2040, 450]], 140, 'peaks', 0],
    [[[-120, 520], [120, 440], [300, 385], [430, 352], [560, 400], [700, 470], [860, 520], [1000, 545], [1150, 505], [1290, 430], [1420, 382], [1560, 410], [1720, 470], [2040, 500]], 70, 'peaks', 0],
    [[[-120, 540], [150, 610], [400, 700], [620, 790], [800, 830], [1000, 840], [1200, 830], [1400, 760], [1650, 680], [2040, 640]], 34, 'hills', 45],
    [[[-120, 640], [300, 740], [600, 830], [900, 850], [1250, 845], [1600, 760], [2040, 700]], 18, 'hills', 80],
  ] },
  cabin: { wl: 790, cabin: [1300, 868, 2.0], layers: [
    [[[-120, 540], [300, 500], [640, 470], [960, 500], [1280, 460], [1650, 500], [2040, 530]], 140, 'peaks', 0],
    [[[-120, 650], [200, 610], [480, 530], [640, 418], [740, 476], [860, 402], [960, 462], [1080, 386], [1200, 476], [1400, 566], [1700, 606], [2040, 646]], 70, 'peaks', 0],
    [[[-120, 580], [240, 620], [520, 680], [800, 720], [1100, 730], [1400, 700], [1700, 650], [2040, 620]], 34, 'hills', 55],
    [[[-120, 670], [400, 735], [800, 770], [1200, 775], [1600, 740], [2040, 700]], 20, 'hills', 80],
  ] },
};

function makeLayered(S) {
  const LO = LAYOUT[S.loc] || LAYOUT.moraine, C = layerPalette(S), L = lightFor(S), wl = LO.wl;
  const loc = { wl, cabin: LO.cabin }, PW = W + 240, PX = -120;
  const PL = { loc, PAL: { sky: { top: C.top, mid: mixv(C.top, C.hor, 0.5), hor: C.hor, glow: C.glow }, land: {}, ov: C.ov, dark: C.dark }, L };
  const lightLeft = L.lx < 0;
  // the sky: a smooth gradient (this look keeps it smooth), the glow, stylized wisps of cloud
  PL.sky = makePlate(0, 0, W, H, 1, g => {
    const gr = g.createLinearGradient(0, 0, 0, wl); gr.addColorStop(0, css(C.top)); gr.addColorStop(0.62, css(mixv(C.top, C.hor, 0.55))); gr.addColorStop(1, css(C.hor));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const sx = W * (0.5 + 0.3 * S.sunSide), sy = wl - 120 - Math.max(-3, S.sunAlt) * 16;
    if (S.sunAlt > -10) { const k = clamp((S.sunAlt + 10) / 8) * clamp((40 - S.sunAlt) / 30) * (1 - C.ov * 0.8); const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 1100); gl.addColorStop(0, css(C.glow, 0.7 * k)); gl.addColorStop(0.25, css(C.glow, 0.32 * k)); gl.addColorStop(1, css(C.glow, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, H); }
    if (S.sunAlt > -1.5 && C.ov < 0.6) { g.fillStyle = css(mixv(C.glow, '#ffffff', 0.5), 1 - C.ov); g.beginPath(); g.arc(sx, sy, 46, 0, TAU); g.fill(); }
    // a soft paper grain so the gradient never bands
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.12; g.drawImage(paper(), 0, 0, W, H); g.restore();
  });
  PL.clouds = [];
  const nW = Math.round(S.cloud * 12), cr = RNG(71);
  PL.wisps = makePlate(PX, 0, PW, wl, 1, g => {
    const body = mixv(C.far, C.near, 0.25 + 0.2 * C.dark), lit = mixv(C.glow, C.hor, 0.4);
    for (let i = 0; i < nW; i++) wisp(g, PX + cr() * PW, 70 + cr() * wl * 0.55, 300 + cr() * 700, 18 + cr() * 34, mixv(body, C.hor, cr() * 0.3), mixv(lit, body, C.ov * 0.7 + C.dark * 0.5), cr);
  });
  // the layers: far to near on the colour ramp; two forest layers below the peaks; then the lake and the near shore
  const N = LO.layers.length + 2, col = i => mixv(mixv(C.far, C.hor, 0.35 * (1 - i / N)), C.near, Math.pow(i / (N - 1), 0.85));
  PL.layers = [];
  LO.layers.forEach(([keys, z, kind, dens], i) => {
    const ridge = ridgeLine(keys, 20 + i, kind === 'peaks' ? 46 : 18, PX, PX + PW), c = col(i), base = wl;
    PL.layers.push({ z, pl: makePlate(PX, 0, PW, H, 1, g => {
      const r = RNG(100 + i);
      flatRange(g, ridge, base, c, {
        crestCol: mixv(C.hor, C.glow, 0.3), footCol: C.near, rim: mixv(C.glow, C.lit, 0.5), rimA: 0.55 - i * 0.08, rimW: 2.4 - i * 0.3,
        seed: 30 + i, lightLeft,
        lit: kind === 'peaks' && S.sunAlt > -10 ? mixv(c, C.lit, 0.35 + 0.2 * (1 - C.ov)) : kind === 'peaks' ? mixv(c, C.lit, 0.18) : null,
        snow: kind === 'peaks' ? mixv(mixv(C.snow, c, 0.25 + i * 0.12), C.hor, 0.1) : null, snowSh: kind === 'peaks' ? mixv(mixv(C.snow, C.near, 0.45), c, 0.3) : null,
        snowLine: lerp(Math.min(...ridge.map(p => p[1])), base, S.season === 'winter' || S.groundSnow > 0.4 ? 0.85 : 0.35),
        mist: mixv(C.hor, C.far, 0.3), mistA: 0.5 - i * 0.06, mistH: 140 - i * 15,
      });
      if (dens) treeline(g, ridge, PX, PX + PW, Math.round(dens * PW / 1000), 22 + i * 8, 52 + i * 18, css(c), r, { sink: 10, depth: 18 });
      if (S.groundSnow > 0.3 && kind === 'hills') { g.globalAlpha = S.groundSnow * 0.25; g.fillStyle = css(C.snow); path(g, [[PX, H], ...ridge, [PX + PW, H]]); g.fill(); g.globalAlpha = 1; }
    }) });
  });
  // the far shore: a dense band of spruces at the water's edge
  const shoreCol = col(LO.layers.length);
  PL.layers.push({ z: 15, pl: makePlate(PX, 0, PW, H, 1, g => {
    const flat = [[PX, wl + 4], [PX + PW, wl + 4]];
    g.fillStyle = css(shoreCol); g.fillRect(PX, wl - 2, PW, 8);
    treeline(g, flat, PX, PX + PW, 260, 12, 38, css(shoreCol), RNG(150), { sink: 0, depth: 4 });
  }) });
  // the lake: the layers mirrored, with flat streaks of light (or ice)
  const above = mk(PW, H), ag = above.getContext('2d'); ag.drawImage(PL.sky.c, -PX, 0); ag.drawImage(PL.wisps.c, 0, 0); for (const l of PL.layers) ag.drawImage(l.pl.c, 0, 0);
  PL.lakeZ = 12;
  PL.lake = makePlate(PX, 0, PW, H, 1, g => {
    g.save(); g.beginPath(); g.rect(PX, wl, PW, H - wl); g.clip();
    if (S.frozen) { g.fillStyle = css(mixv(C.snow, C.far, 0.35)); g.fillRect(PX, wl, PW, H - wl); const r = RNG(5); for (let i = 0; i < 60; i++) { g.fillStyle = css(mixv(C.snow, C.near, 0.2 + r() * 0.15), 0.5); g.fillRect(PX + r() * PW, wl + Math.pow(r(), 1.5) * (H - wl), 80 + r() * 400, 2 + r() * 4); } }
    else {
      g.save(); g.translate(0, wl * 2); g.scale(1, -1); g.globalAlpha = 0.9; g.drawImage(above, PX, 0); g.restore();
      const wg = g.createLinearGradient(0, wl, 0, H); wg.addColorStop(0, css(C.water, 0.25)); wg.addColorStop(1, css(mixv(C.water, C.near, 0.5), 0.7)); g.fillStyle = wg; g.fillRect(PX, wl, PW, H - wl);
      const r = RNG(9); // flat streaks, longer nearer the viewer
      for (let i = 0; i < 140; i++) { const u = Math.pow(r(), 1.3), y = wl + 3 + u * (H - wl); g.fillStyle = css(r() < 0.5 ? mixv(C.hor, C.glow, 0.4) : mixv(C.water, C.near, 0.4), 0.12 + 0.18 * r()); g.fillRect(PX + r() * PW, y, 40 + u * 360 * r(), 1.5 + u * 4); }
    }
    g.restore();
  });
  // the near shores and the cabin on its point
  const nearCol = css(col(N - 1)), r2 = RNG(61);
  PL.groundZ = 7;
  PL.ground = makePlate(PX, 0, PW, H, 1, g => {
    path(g, [[PX, H], [PX, 880], [140, 870], [330, 920], [520, 1000], [640, H]]); g.fillStyle = nearCol; g.fill();
    path(g, [[PX + PW, H], [PX + PW, 860], [1760, 868], [1560, 928], [1380, 1010], [1270, H]]); g.fillStyle = nearCol; g.fill();
    if (LO.cabin) {
      const [cx, cy, cs] = LO.cabin, ground = css(col(N - 2));
      path(g, [[cx - 330, cy + 14], [cx - 160, cy - 4], [cx + 300, cy - 14], [PX + PW, cy - 24], [PX + PW, H], [cx - 60, H], [cx - 240, cy + 90]]); g.fillStyle = ground; g.fill();
      treeline(g, [[cx + 80, cy - 14], [PX + PW, cy - 30]], cx + 90, PX + PW, 16, 70, 170, ground, RNG(66), { sink: 0, depth: 6 });
      PL.chimney = cabin(g, cx, cy, cs * 40, {
        log: mixv('#6a4a36', col(N - 2), 0.55 + 0.3 * C.dark), logSh: mixv('#3a2a20', col(N - 1), 0.5), roof: mixv('#6a2a24', col(N - 1), 0.4 + 0.4 * C.dark), roofSh: col(N - 1), stone: col(N - 2), door: col(N - 1),
        winOff: mixv('#3a3a40', col(N - 1), 0.5), winOn: [255, 196, 110], snow: C.snow,
      }, L, { glow: clamp((2 - S.sunAlt) / 6), snow: S.groundSnow });
    }
    if (S.groundSnow > 0.3) { g.globalAlpha = 0.5 * S.groundSnow; g.fillStyle = css(mixv(C.snow, C.near, 0.5)); path(g, [[PX, H], [PX, 900], [140, 892], [330, 940], [520, 1020], [600, H]]); g.fill(); g.globalAlpha = 1; }
  });
  // the framing spruces, and two right by the lens: separate sprites, so each can sway in the wind
  const sprite = (h, c, seed) => { const w = Math.ceil(h * 0.6), pad = Math.ceil(h * 0.06), cv = mk(w, h + pad + 6), g = cv.getContext('2d'); spruceSil(g, w / 2, h + pad + 2, h, c, RNG(seed)); return cv; };
  PL.sway = [];
  const nearC = nearCol, passC = css(mixv(col(N - 1), [0, 0, 0], 0.3));
  [[60, 1000, 820], [190, 1012, 620], [-30, 1040, 700], [300, 1020, 420], [1780, 990, 820], [1900, 1030, 900], [1650, 1000, 520], [1560, 1030, 360]]
    .forEach(([x, y, h], i) => PL.sway.push({ spr: sprite(h, nearC, 300 + i), x, y: y + 4, z: 3.2 }));
  PL.sway.push({ spr: sprite(940, passC, 401), x: 150, y: 1154, z: 1.7 }, { spr: sprite(1000, passC, 402), x: 1760, y: 1164, z: 1.7 });
  if (LO.cabin) PL.cabinAt = [LO.cabin[0], LO.cabin[1] - 18 * LO.cabin[2]];
  return PL;
}

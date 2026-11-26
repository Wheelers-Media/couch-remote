// ================= Alberta Live: painted Rockies scenes that follow the real sky and weather =================
// S (the conditions): sunAlt (degrees), sunSide (-1 sun on the left of the view, 1 right), moonAlt, moonX (0..1 across),
// moonPhase (0 new .. 0.5 full .. 1), cloud (0..1), rain, snow, fog, storm (0..1), wind (km/h), windDir (-1 left, 1 right),
// temp (C), groundSnow (0..1), frozen (bool), aurora (0..1), season ('summer' | 'autumn' | 'winter' | 'spring').
// Plates (the painting) are made once per conditions; draw() adds what moves.

const Q = new URLSearchParams(location.search);
const qn = (k, d) => Q.has(k) ? +Q.get(k) : d;
function condFromQuery() {
  return {
    sunAlt: qn('alt', 20), sunSide: qn('side', -1), moonAlt: qn('malt', 25), moonX: qn('mx', 0.7), moonPhase: qn('phase', 0.5),
    cloud: qn('cloud', 0.3), rain: qn('rain', 0), snow: qn('snow', 0), fog: qn('fog', 0), storm: qn('storm', 0),
    wind: qn('wind', 12), windDir: qn('wdir', 1), temp: qn('temp', 8), groundSnow: qn('gsnow', 0), frozen: qn('frozen', 0) > 0.5,
    aurora: qn('aurora', 0), season: Q.get('season') || 'summer', loc: Q.get('loc') || 'moraine',
  };
}

// ---------- colour, by the sun's height (keys between which everything is mixed) ----------
const SKY_KEYS = [
  { alt: -18, top: '#070c22', mid: '#14204a', hor: '#26386a', glow: '#26386a' },
  { alt: -8, top: '#111a46', mid: '#2e3874', hor: '#7a5f8e', glow: '#a5708a' },
  { alt: -2, top: '#253a78', mid: '#8a6a98', hor: '#f0a070', glow: '#ff9a5c' },
  { alt: 3, top: '#3d5e9c', mid: '#c48a94', hor: '#ffc98a', glow: '#ffb46a' },
  { alt: 10, top: '#4a7ab8', mid: '#9dbcdc', hor: '#f4dcae', glow: '#fff0c8' },
  { alt: 30, top: '#4683c6', mid: '#8cb9e0', hor: '#e2ecf0', glow: '#ffffff' },
];
const LAND_KEYS = [
  { alt: -18, rock: '#3b4366', rockLt: '#56618c', rockDk: '#262c48', shade: '#20263f', snow: '#a9b6e4', snowSh: '#5f6ba0', tree: '#0c1424', treeMid: '#18243a', treeLt: '#2a3a58', water: '#13284a', waterLt: '#3a5a8a', waterDk: '#0a162c', grass: '#1a2438' },
  { alt: -6, rock: '#5a5280', rockLt: '#7d6c9c', rockDk: '#35304f', shade: '#2e2a4a', snow: '#c8b8e4', snowSh: '#7a70a8', tree: '#141a2c', treeMid: '#232a42', treeLt: '#3a3c5c', water: '#2a3a6a', waterLt: '#7a78a8', waterDk: '#141c3a', grass: '#2a2a40' },
  { alt: 1, rock: '#c08578', rockLt: '#f2ad92', rockDk: '#6c4c5c', shade: '#4c3f6c', snow: '#ffd2c0', snowSh: '#9a88b8', tree: '#1c2230', treeMid: '#33343e', treeLt: '#8a6658', water: '#3c5a86', waterLt: '#e8a88a', waterDk: '#1c2a4a', grass: '#4a4038' },
  { alt: 8, rock: '#b4a08c', rockLt: '#e8cfae', rockDk: '#6e6460', shade: '#5a5f82', snow: '#fff1e0', snowSh: '#aab4d0', tree: '#1e3428', treeMid: '#36513a', treeLt: '#7c8a52', water: '#2f8ea4', waterLt: '#9ad4d8', waterDk: '#1a5468', grass: '#6a7a40' },
  { alt: 30, rock: '#9c978e', rockLt: '#cfc8b8', rockDk: '#66646a', shade: '#5c6684', snow: '#f6f8fc', snowSh: '#b6c2dc', tree: '#1c3628', treeMid: '#33553c', treeLt: '#5e8350', water: '#2aa0b2', waterLt: '#8fdcdc', waterDk: '#155f72', grass: '#5e8040' },
];
function keyed(keys, alt) {
  let i = 0; while (i < keys.length - 1 && alt > keys[i + 1].alt) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], t = a === b ? 0 : sstep(clamp((alt - a.alt) / (b.alt - a.alt)));
  const o = {}; for (const k in a) if (k !== 'alt') o[k] = mixv(a[k], b[k], t); return o;
}
function paletteFor(S) {
  const sky = keyed(SKY_KEYS, S.sunAlt), land = keyed(LAND_KEYS, S.sunAlt);
  // cloud cover and weather: towards grey, darker in rain, paler in snow and fog
  const ov = clamp((S.cloud - 0.55) / 0.45) * 0.8 + S.fog * 0.3, dark = clamp(S.sunAlt < -6 ? 1 : 0);
  const greyOf = c => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l, l, l * 1.04]; };
  for (const P0 of [sky, land]) for (const k in P0) {
    let c = mixv(P0[k], greyOf(P0[k]), Math.min(0.85, ov));
    if (S.rain > 0) c = mixv(c, [0, 0, 0], S.rain * 0.18 + S.storm * 0.2);
    if (S.snow > 0 || S.fog > 0) c = mixv(c, [215, 220, 230], (S.snow * 0.25 + S.fog * 0.35) * (1 - dark * 0.7));
    P0[k] = c;
  }
  // autumn larches and grass go gold; winter trees darker and snowier
  if (S.season === 'autumn') { land.treeLt = mixv(land.treeLt, '#c89a3a', 0.45); land.grass = mixv(land.grass, '#b08a40', 0.6); }
  land.haze = sky.hor; land.ice = mixv(land.snow, sky.hor, 0.25); land.iceSh = mixv(land.snowSh, land.shade, 0.3);
  land.shoreLine = mixv(sky.hor, '#ffffff', 0.3);
  land.log = mixv('#8a5a36', land.rockDk, 0.25 + 0.6 * dark); land.logSh = mixv('#5a3a24', land.shade, 0.3 + 0.5 * dark);
  land.roof = mixv('#8a3a2c', land.shade, 0.2 + 0.6 * dark); land.roofSh = mixv('#5a2420', land.shade, 0.4 + 0.5 * dark);
  land.stone = mixv('#7a7470', land.rockDk, 0.3 + 0.5 * dark); land.door = mixv('#4a2c1c', land.shade, 0.5);
  land.winOff = mixv('#3a3a40', land.shade, 0.4); land.winOn = [255, 196, 110];
  return { sky, land, ov, dark };
}
function lightFor(S) { return { lx: S.sunAlt > -4 ? 0.62 * S.sunSide : -0.5, ly: -0.78 }; }

// ---------- the locations: each lays out its ranges, shores and near trees ----------
const LOC = {};
LOC.moraine = {
  name: 'Moraine Lake', wl: 702,
  back: [[-80, 560], [200, 500], [420, 470], [700, 455], [1000, 470], [1300, 450], [1600, 490], [2000, 540]],
  // the wall of peaks: its tallest spires rise into the bottom of the clock's digits
  wall: [[-80, 600], [60, 500], [170, 455], [290, 500], [400, 410], [520, 468], [630, 372], [740, 425], [860, 352], [960, 410], [1070, 365], [1170, 420], [1280, 378], [1390, 445], [1500, 410], [1620, 480], [1760, 450], [1900, 530], [2000, 570]],
  left: [[-80, 400], [80, 430], [240, 520], [400, 610], [560, 690], [700, 712]],
  right: [[1220, 712], [1380, 640], [1560, 560], [1760, 500], [2000, 470]],
  heroes: [[70, 990, 820, -0.01], [205, 1010, 640, 0.01], [-10, 1040, 700, 0], [1770, 990, 800, 0.01], [1895, 1030, 900, -0.01], [1650, 1000, 520, 0]],
  cabin: null,
};
LOC.rundle = {
  name: 'Mount Rundle', wl: 712,
  back: [[-80, 600], [300, 560], [700, 590], [1100, 560], [1500, 520], [2000, 560]],
  // the tilted slab: a long ramp up to the summit, then a cliff
  wall: [[-80, 690], [200, 670], [420, 620], [640, 560], [820, 500], [980, 445], [1120, 395], [1200, 372], [1250, 380], [1300, 470], [1360, 560], [1440, 610], [1600, 600], [1800, 640], [2000, 660]],
  left: [[-80, 560], [120, 600], [300, 660], [480, 712], [600, 722]],
  right: [[1380, 722], [1520, 690], [1700, 640], [2000, 600]],
  heroes: [[60, 1000, 760, 0], [190, 1020, 580, 0.01], [1800, 1000, 780, -0.01], [1900, 1040, 640, 0]],
  cabin: null, tilt: -0.32,
};
LOC.peyto = {
  name: 'Peyto Lake', wl: 812, high: true,
  back: [[-80, 470], [250, 430], [600, 455], [960, 420], [1300, 440], [1650, 410], [2000, 450]],
  wall: [[-80, 520], [120, 440], [300, 380], [430, 345], [560, 400], [700, 470], [860, 520], [1000, 540], [1150, 505], [1290, 430], [1420, 380], [1560, 410], [1720, 470], [2000, 500]],
  left: [[-80, 520], [150, 600], [380, 700], [600, 800], [760, 830]],
  right: [[1150, 830], [1350, 760], [1600, 680], [1800, 640], [2000, 620]],
  heroes: [[80, 1010, 780, 0], [220, 1030, 600, 0], [1790, 1010, 800, 0], [1910, 1040, 700, 0]],
  cabin: null,
};
LOC.cabin = {
  name: 'Kananaskis cabin', wl: 760,
  back: [[-80, 540], [300, 500], [640, 470], [960, 500], [1280, 460], [1650, 500], [2000, 530]],
  // three peaks in a row, like the Three Sisters
  wall: [[-80, 640], [200, 600], [480, 520], [640, 410], [740, 470], [860, 395], [960, 455], [1080, 380], [1200, 470], [1400, 560], [1700, 600], [2000, 640]],
  left: [[-80, 620], [240, 680], [520, 740], [800, 770]],
  right: [[1100, 770], [1400, 720], [1700, 660], [2000, 640]],
  heroes: [[60, 1000, 820, 0], [200, 1015, 640, 0], [1790, 1000, 820, 0], [1910, 1030, 700, 0], [1640, 990, 480, 0]],
  cabin: [1290, 840, 2.2], meadow: true,
};

// ---------- painting the plates ----------
function makeScene(S) {
  const loc = LOC[S.loc] || LOC.moraine, PAL = paletteFor(S), L = lightFor(S), r = RNG(1234);
  const sky = PAL.sky, land = PAL.land, wl = loc.wl;
  const plates = { loc, PAL, L };
  // sky: painted strokes over a wash, a warm glow where the sun is or just set
  plates.sky = makePlate(0, 0, W, H, 1, g => {
    paintSky(g, W, H, [[0, sky.top], [wl * 0.6, sky.mid], [wl, sky.hor], [H, sky.hor]], RNG(3), { n: 2600 });
    if (S.sunAlt > -10 && S.sunAlt < 25) {
      const sx = W * (0.5 + 0.42 * S.sunSide), sy = wl - 60 - Math.max(-2, S.sunAlt) * 18;
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 900);
      const k = clamp(1 - Math.abs(S.sunAlt - 1) / 14) * (1 - PAL.ov * 0.8);
      gl.addColorStop(0, css(sky.glow, 0.55 * k)); gl.addColorStop(1, css(sky.glow, 0));
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
    }
    paperOver(g, W, H, 0.3);
  });
  // land: back range, the wall, the side slopes with their forests, the far shore's trees
  const back = ridgeLine(loc.back, 21, 40), wall = ridgeLine(loc.wall, 22, 55);
  const snowFrac = S.season === 'winter' ? 0.0 : S.season === 'summer' ? 0.65 : 0.45;
  const yTop = Math.min(...wall.map(p => p[1]));
  const snowLine = lerp(yTop, wl, S.season === 'winter' ? 0.92 : snowFrac * 0.62) + (S.season === 'winter' ? 0 : 0) - S.groundSnow * 60;
  const tree = { dk: land.tree, mid: land.treeMid, lt: land.treeLt, snow: land.snow };
  // the depth layers (z: distance from the camera's start; nearer layers grow and slide faster as it glides in).
  // Each is painted wider than the screen (x -120 .. W+120) so the camera's sideways drift never shows an edge.
  const PW = W + 240, PX = -120, lay = (z, fn) => ({ pl: makePlate(PX, 0, PW, H, 1, fn), z });
  const hazeBack = mixv(land.haze, land.shade, 0.15);
  const leftR = ridgeLine(loc.left, 31, 30), rightR = ridgeLine(loc.right, 32, 30);
  plates.layers = [];
  plates.layers.push(lay(90, g => alpine(g, back, { rock: mixv(land.rock, hazeBack, 0.6), rockLt: mixv(land.rockLt, hazeBack, 0.55), rockDk: mixv(land.rockDk, hazeBack, 0.6), shade: mixv(land.shade, hazeBack, 0.55), snow: mixv(land.snow, hazeBack, 0.4), snowSh: mixv(land.snowSh, hazeBack, 0.45), haze: hazeBack }, L,
    { base: wl, snowLine: snowLine + 30, seed: 5, strataN: 30, hazeA: 0.75, hazeH: 200, size: 30 })));
  plates.layers.push(lay(45, g => alpine(g, wall, { rock: land.rock, rockLt: land.rockLt, rockDk: land.rockDk, shade: land.shade, snow: land.snow, snowSh: land.snowSh, haze: mixv(land.haze, land.shade, 0.1) }, L,
    { base: wl, snowLine, seed: 9, strataN: 120, tilt: loc.tilt ?? -0.1, hazeA: 0.5, hazeH: 160, ink: css(mixv(land.rockDk, '#000000', 0.3)), inkA: 0.35, inkW: 2 })));
  plates.layers.push(lay(20, g => {
    alpine(g, leftR, { rock: mixv(land.rock, land.rockDk, 0.2), rockLt: land.rockLt, rockDk: land.rockDk, shade: land.shade, snow: land.snow, snowSh: land.snowSh, haze: land.haze }, L,
      { base: wl + 20, snowLine: S.groundSnow > 0.3 ? 0 : null, seed: 13, strataN: 40, hazeA: 0.25, hazeH: 120, reach: 140, ink: css(land.rockDk), inkA: 0.3 });
    path(g, [...rightR, [W + 120, H], [rightR[0][0], H]]); g.fillStyle = css(mixv(land.tree, land.haze, 0.15)); g.fill();
    forestBand(g, rightR[0][0], W + 100, x => lineY(rightR, x) + 6, 120, 16, 46, { dk: mixv(land.tree, land.haze, 0.12), mid: mixv(land.treeMid, land.haze, 0.1), lt: land.treeLt, snow: land.snow }, L, RNG(41), { snow: S.groundSnow, depth: 30 });
    forestBand(g, rightR[0][0] + 60, W + 100, x => lineY(rightR, x) + 70, 80, 26, 70, tree, L, RNG(42), { snow: S.groundSnow, depth: 60 });
    forestBand(g, -100, W + 100, x => wl + 2, 290, 10, 30, { dk: mixv(land.tree, land.haze, 0.25), mid: mixv(land.treeMid, land.haze, 0.2), lt: land.treeLt, snow: land.snow }, L, RNG(43), { snow: S.groundSnow, depth: 4 });
    forestBand(g, -100, leftR[leftR.length - 1][0], x => Math.min(lineY(leftR, x) + 30, wl + 6), 44, 20, 60, tree, L, RNG(44), { snow: S.groundSnow, depth: 30 });
  }));
  // the lake: a mirror of sky and land as they stand at the start
  const above = mk(PW, H), ag = above.getContext('2d'); ag.drawImage(plates.sky.c, -PX, 0); for (const l of plates.layers) ag.drawImage(l.pl.c, 0, 0);
  const lakeImg = mk(W, H); lakeImg.getContext('2d').drawImage(above, PX, 0);
  plates.lakeZ = 14;
  plates.lake = makePlate(PX, 0, PW, H, 1, g => { g.save(); g.translate(-PX, 0); g.restore(); lakePlate(g, lakeImg, wl, land, RNG(51), { frozen: S.frozen }); });
  const nearTree = { dk: mixv(land.tree, '#000000', 0.25), mid: land.tree, lt: land.treeMid, snow: land.snow };
  const bankCol = S.groundSnow > 0.3 ? mixv(land.snow, land.shade, 0.25) : mixv(mixv(land.grass, land.tree, 0.4), land.shade, PAL.dark * 0.5);
  // the near ground: banks, boulders, the cabin on its point
  plates.groundZ = 7;
  plates.ground = makePlate(PX, 0, PW, H, 1, g => {
    const r2 = RNG(61);
    paintRegion(g, [[-120, H + 20], [-120, 890], [160, 880], [340, 930], [520, 1010], [620, H + 20]], bankCol, r2, { size: 22, dens: 1.2, a: 0.35, colAt: (x, y, rr) => jit(rr() < 0.5 ? bankCol : mixv(bankCol, land.rockDk, 0.3), rr, 12) });
    paintRegion(g, [[W + 120, H + 20], [W + 120, 870], [1760, 870], [1560, 930], [1380, 1010], [1280, H + 20]], bankCol, r2, { size: 22, dens: 1.2, a: 0.35, colAt: (x, y, rr) => jit(rr() < 0.5 ? bankCol : mixv(bankCol, land.rockDk, 0.3), rr, 12) });
    for (const [bx, by, bs] of [[420, 1000, 44], [520, 1040, 30], [1430, 1000, 50], [1330, 1045, 28], [300, 960, 34]]) {
      const pts = rough(scallop(bx, by, bs, bx, 5, 0.55).filter(p => p[1] <= by + bs * 0.2), 2, bx, 6);
      cels(g, pts, { base: mixv(land.rock, land.rockDk, 0.3), sh: land.shade, sw: bs * 0.3, rim: land.rockLt, rw: 3, L, line: P.ink, lw: 2, seed: bx });
    }
    if (loc.cabin) {
      const [cx, cy] = loc.cabin;
      const clearing = [[cx - 360, cy + 12], [cx - 200, cy - 6], [cx + 40, cy - 14], [cx + 300, cy - 18], [W + 120, cy - 30], [W + 120, H + 20], [cx - 80, H + 20], [cx - 260, cy + 110]];
      paintRegion(g, rough(clearing, 6, 5, 10), bankCol, r2, { size: 20, dens: 1.3, a: 0.35, colAt: (x, y, rr) => jit(rr() < 0.5 ? bankCol : mixv(bankCol, land.treeLt, 0.35), rr, 12) });
      forestBand(g, cx + 90, W + 100, x => cy - 22 + (x - cx) * -0.02, 20, 60, 160, nearTree, L, RNG(66), { snow: S.groundSnow, depth: 10 });
      plates.chimney = cabin(g, cx, cy, loc.cabin[2] * 40, land, L, { glow: clamp((2 - S.sunAlt) / 6), snow: S.groundSnow });
    }
    paperOver(g, PW, H, 0.28);
  });
  // the framing pines, and two right by the lens that the camera glides past
  plates.treesZ = 3.2;
  plates.trees = makePlate(PX, 0, PW, H, 1, g => {
    for (const [x, y, h, lean] of loc.heroes) spruce(g, x, y, h, nearTree, L, RNG(Math.floor(x * 3 + h)), { snow: S.groundSnow, lean, ink: css(P.inkCool) });
    paperOver(g, PW, H, 0.28);
  });
  plates.passZ = 1.7;
  plates.pass = makePlate(PX, 0, PW, H, 1, g => {
    const dk = { dk: mixv(nearTree.dk, '#000000', 0.35), mid: nearTree.dk, lt: nearTree.mid, snow: land.snow };
    spruce(g, 330, 1130, 900, dk, L, RNG(901), { snow: S.groundSnow, ink: css(P.inkCool) });
    spruce(g, 1560, 1150, 980, dk, L, RNG(902), { snow: S.groundSnow, ink: css(P.inkCool) });
  });
  // clouds: lit cumulus in the sky's light, as many as the cover says
  plates.clouds = [];
  const cpal = { sh: mixv(sky.mid, land.shade, 0.35), mid: mixv(sky.hor, '#ffffff', 0.25 * (1 - PAL.dark)), lit: mixv(mixv(sky.glow, '#ffffff', 0.5), sky.hor, PAL.dark), hi: mixv(sky.glow, '#ffffff', 0.7 - PAL.dark * 0.6), base: mixv(sky.mid, land.shade, 0.5) };
  const overcast = S.cloud > 0.75 || S.rain > 0 || S.snow > 0;
  const nC = overcast ? 0 : Math.round(S.cloud * 7), cr = RNG(71);
  if (overcast) plates.ceiling = makePlate(0, 0, W, wl, 1, g => {
    const rr = RNG(73), body = mixv(sky.mid, land.shade, 0.25), lit = mixv(sky.hor, '#ffffff', 0.2 * (1 - PAL.dark));
    for (let i = 0; i < 9; i++) stratus(g, rr() * W, 60 + rr() * wl * 0.55, 700 + rr() * 900, 60 + rr() * 70, body, lit, rr, { litA: 0.35 });
  });
  for (let i = 0; i < nC; i++) {
    const w = 380 + cr() * 520, h = w * 0.36, pl = makePlate(-w * 0.6, -h * 1.8, w * 1.2, h * 2.4, 0.5, g => cumulus(g, 0, 0, w, h, cpal, RNG(80 + i), { lx: L.lx, ly: L.ly }));
    plates.clouds.push({ pl, x: cr() * (W + 800) - 400, y: 90 + cr() * (wl * 0.42), speed: 0.5 + cr() * 0.8, w });
  }
  return plates;
}

// ---------- the camera ----------
// One continuous glide forward through the layers over each location's turn (fast at first, then slower for longer,
// never reversing), with a slow sideways drift. ?push=0..1.4 overrides how far it gets (for stills).
const SHOT = qn('shot', 90), SPEED = qn('speed', 1);
function camAt(t) {
  const u = clamp(((t * SPEED) % SHOT) / SHOT), ease = 1 - Math.pow(1 - u, 2.2);
  const z = Q.has('push') ? qn('push', 0) : 1.25 * ease;
  return { z, x: Q.has('push') ? qn('drift', 0) : lerp(-1, 1, sstep(u)) * 0.9 };
}

// ---------- what moves ----------
function drawLive(g, t, S, PL) {
  const { loc, PAL, L } = PL, wl = loc.wl;
  plateDraw(g, PL.sky);
  // stars and the Milky Way on clear nights
  const clear = (1 - clamp((S.cloud - 0.2) / 0.6)) * (1 - S.fog), night = clamp((-S.sunAlt - 6) / 8);
  if (night * clear > 0.02) {
    const a = night * clear;
    for (let i = 0; i < 380; i++) {
      const ST = MOTION_TOKENS.stars, every = lerp(ST.dipEvery[0], ST.dipEvery[1], seeded(i, 5)), ph = loopP(t, every, seeded(i, 6)), dip = bell(clamp((ph * every) / ST.dipLen));
      const x = hash(i, 1) * W, y = Math.pow(hash(i, 2), 1.5) * wl * 0.9, tw = 1 - ST.dipDepth * dip;
      g.fillStyle = `rgba(240,242,255,${(a * tw * (0.3 + 0.7 * hash(i, 4))).toFixed(3)})`; const s = hash(i, 5) < 0.06 ? 2.4 : 1.4; g.fillRect(x, y, s, s);
    }
  }
  if (S.aurora > 0.02 && night > 0.3) aurora(g, t, S.aurora * clear * night, wl);
  if (S.moonAlt > 0) moon(g, S, PAL, wl);
  // clouds drift with the wind
  for (const c of PL.clouds) {
    const span = W + c.w * 2, x = ((c.x + S.windDir * t * (4 + S.wind * 0.8) * c.speed) % span + span) % span - c.w;
    g.globalAlpha = 0.95; plateDraw(g, { ...c.pl, ox: c.pl.ox + x, oy: c.pl.oy + c.y }); g.globalAlpha = 1;
  }
  if (PL.wisps) { const span = 240, dx = ((S.windDir * t * (2 + S.wind * 0.35)) % span + span) % span - span / 2; plateDraw(g, { ...PL.wisps, ox: PL.wisps.ox + dx }); }
  if (PL.ceiling) { g.globalAlpha = 0.8; plateDraw(g, { ...PL.ceiling, ox: ((S.windDir * t * (3 + S.wind * 0.4)) % 300) - 150 }); g.globalAlpha = 1; }
  if (PAL.ov > 0.25) { const og = g.createLinearGradient(0, 0, 0, wl); og.addColorStop(0, css(mixv(PAL.sky.top, [150, 155, 165], 0.5), PAL.ov * 0.6)); og.addColorStop(1, css(PAL.sky.hor, 0)); g.fillStyle = og; g.fillRect(0, 0, W, wl); }
  const C = camAt(t), vx = W / 2, vy = wl;
  // a plate at depth z: scaled about the horizon's vanishing point and shifted by the camera's sideways drift
  const at = (z) => { const k = z / Math.max(0.05, z - C.z); return [k, -C.x * 40 / Math.max(0.05, z - C.z)]; };
  const layer = (pl, z, a = 1) => { const [k, dx] = at(z); g.save(); g.translate(vx + dx, vy); g.scale(k, k); g.translate(-vx, -vy); g.globalAlpha = a; plateDraw(g, pl); g.restore(); };
  const proj = (x, y, z) => { const [k, dx] = at(z); return [vx + dx + (x - vx) * k, vy + (y - vy) * k, k]; };
  for (const l of PL.layers) layer(l.pl, l.z);
  layer(PL.lake, PL.lakeZ);
  // glints on the water under the moon or a low sun
  if (!S.frozen) {
    const sunLow = S.sunAlt > -1 && S.sunAlt < 20, gx = sunLow ? W * (0.5 + 0.42 * S.sunSide) : W * S.moonX;
    const ga = (sunLow ? clamp(1 - S.sunAlt / 20) : S.moonAlt > 0 ? clamp(S.moonPhase < 0.5 ? S.moonPhase * 2 : (1 - S.moonPhase) * 2) * night : 0) * (1 - PAL.ov);
    if (ga > 0.05) for (let k = 0; k < 60; k++) {
      const u = k / 60, [, , kk] = proj(0, 0, PL.lakeZ), y = wl + (4 + Math.pow(u, 1.3) * (H - wl - 10)) * kk, w = (16 + u * 120) * kk * (0.6 + 0.8 * seeded(k, 7)), x = proj(gx, 0, PL.lakeZ)[0] + Math.sin(t * 0.8 + k * 1.7) * w * 0.4 + (hash(k, 9) - 0.5) * w;
      g.fillStyle = css(sunLow ? mixv(PAL.sky.glow, '#ffffff', 0.4) : [232, 236, 255], ga * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + k * 2.3))));
      g.fillRect(x - w / 2, y, w, 1.5 + u * 2);
    }
  }
  layer(PL.ground, PL.groundZ);
  if (PL.chimney && (S.temp < 16 || night > 0.3)) { const [cx, cy, ck] = proj(PL.chimney[0], PL.chimney[1], PL.groundZ); smoke(g, t, [cx, cy], S, PAL, ck); }
  // the cabin's window glow breathes a little
  if (PL.cabinAt && S.sunAlt < 2) { const [cx, cy, ck] = proj(PL.cabinAt[0], PL.cabinAt[1], PL.groundZ), G = MOTION_TOKENS.glow, on = clamp((2 - S.sunAlt) / 6);
    const R = 120 * ck * (1 + G.amount * wave(t, G.period)), gl = g.createRadialGradient(cx, cy, 0, cx, cy, R); gl.addColorStop(0, `rgba(255,190,110,${0.18 * on})`); gl.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gl; g.fillRect(cx - R, cy - R, R * 2, R * 2); }
  if (PL.sway) PL.sway.forEach((tr, i) => { const [px, py, k] = proj(tr.x, tr.y, tr.z); drawSwayTree(g, tr.spr, px, py, k, t, i, S); });
  else { layer(PL.trees, PL.treesZ); layer(PL.pass, PL.passZ); }
  weather(g, t, S, PAL, wl);
}
function moon(g, S, PAL, wl) {
  const x = W * S.moonX, y = wl - 70 - Math.min(S.moonAlt, 48) * 12.5, R = 34, vis = (1 - PAL.ov * 0.9) * (0.3 + 0.7 * clamp((-S.sunAlt + 2) / 10));
  if (vis < 0.05) return;
  const gl = g.createRadialGradient(x, y, 0, x, y, R * 11); gl.addColorStop(0, `rgba(220,228,255,${0.32 * vis})`); gl.addColorStop(0.2, `rgba(200,212,255,${0.14 * vis})`); gl.addColorStop(1, 'rgba(220,228,255,0)'); g.fillStyle = gl; g.fillRect(x - R * 11, y - R * 11, R * 22, R * 22);
  g.save(); g.globalAlpha = vis;
  g.beginPath(); g.arc(x, y, R, 0, TAU); g.fillStyle = css(mixv(PAL.sky.mid, '#30344c', 0.4), 0.8); g.fill();
  const ph = S.moonPhase, k = Math.cos(ph * TAU), waxing = ph < 0.5;
  g.beginPath(); g.arc(x, y, R, -Math.PI / 2, Math.PI / 2, !waxing); g.ellipse(x, y, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing); g.closePath();
  g.fillStyle = '#f3f2ea'; g.fill();
  // painted craters
  for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.2, 0.15, 0.16], [0.05, -0.38, 0.1], [-0.12, 0.38, 0.12]]) { g.beginPath(); g.arc(x + cx * R, y + cy * R, cr * R, 0, TAU); g.fillStyle = 'rgba(190,188,182,0.35)'; g.fill(); }
  g.restore();
}
let AUR = null;
function aurora(g, t, a, wl) {
  const aw = 240, ah = 135; if (!AUR) AUR = mk(aw, ah);
  const x = AUR.getContext('2d'); x.clearRect(0, 0, aw, ah);
  for (let i = 0; i < aw; i++) {
    const u = i / aw, base = ah * 0.56 + 7 * Math.sin(u * 6 + t * 0.05) + 4 * Math.sin(u * 15 - t * 0.08);
    const I = a * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(u * 9 + t * 0.07 + Math.sin(u * 3) * 2), 2)) * (0.85 + 0.15 * Math.sin(i * 0.7 + t * 0.4));
    const h = ah * (0.28 + 0.18 * a) + 8 * Math.sin(u * 11 + t * 0.04);
    const gr = x.createLinearGradient(0, base - h, 0, base + 2);
    gr.addColorStop(0, 'rgba(160,90,255,0)'); gr.addColorStop(0.45, `rgba(140,110,255,${0.2 * I})`); gr.addColorStop(0.85, `rgba(70,255,170,${0.6 * I})`); gr.addColorStop(1, 'rgba(70,255,170,0)');
    x.fillStyle = gr; x.fillRect(i, base - h, 1.6, h + 2);
  }
  g.save(); g.globalCompositeOperation = 'screen'; g.imageSmoothingQuality = 'high'; g.drawImage(AUR, 0, 0, W, wl * 1.25 * (ah / ah)); g.restore();
}
function smoke(g, t, ch, S, PAL, k = 1) {
  const M = MOTION_TOKENS.smoke, col = mixv(mixv(PAL.sky.hor, '#e8e8ec', 0.5), '#3a3e50', PAL.dark * 0.6);
  for (let i = 0; i < M.puffs; i++) {
    const p = loopP(t, M.period * (0.9 + 0.2 * seeded(i, 3)), i / M.puffs), lean = S.windDir * p * p * (30 + S.wind * 5) * M.lean;
    const x = ch[0] + (lean + 7 * wave(t, 5200, seeded(i, 4)) * p) * k, y = ch[1] - p * M.rise * k, rr = (6 + p * 32) * k;
    g.fillStyle = css(col, 0.32 * bell(p)); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
}
function weather(g, t, S, PAL, wl) {
  if (S.fog > 0) for (let i = 0; i < 5; i++) {
    const y = wl - 60 + i * 50, x = ((t * (8 + i * 4) + i * 400) % (W + 1200)) - 600, fc = mixv(PAL.sky.hor, '#e6e8ee', 0.4);
    const fg = g.createLinearGradient(0, y - 70, 0, y + 70); fg.addColorStop(0, css(fc, 0)); fg.addColorStop(0.5, css(fc, 0.5 * S.fog)); fg.addColorStop(1, css(fc, 0));
    g.fillStyle = fg; g.fillRect(x - 600, y - 70, W + 1200, 140);
  }
  const lean = clamp(S.wind / 60, 0, 0.6) * S.windDir;
  if (S.rain > 0) {
    g.strokeStyle = css(mixv(PAL.sky.hor, '#dfe6f2', 0.6), 0.4); g.lineWidth = 1.6; g.beginPath();
    for (let i = 0; i < 260 * S.rain; i++) { const z = 0.4 + hash(i, 7) * 0.6, y = ((hash(i, 8) * H + t * 1300 * z) % (H + 40)) - 20, x = ((hash(i, 9) * W + y * lean) % W + W) % W, len = 18 + 16 * z; g.moveTo(x, y); g.lineTo(x - lean * len, y - len); }
    g.stroke();
  }
  if (S.snow > 0) for (let i = 0; i < 240 * S.snow; i++) {
    const z = 0.4 + hash(i, 17) * 0.6, y = ((hash(i, 18) * H + t * (40 + 60 * z)) % (H + 20)) - 10, x = ((hash(i, 19) * W + Math.sin(t * 0.8 + i) * 16 + y * lean * 0.6) % W + W) % W;
    g.fillStyle = `rgba(246,248,255,${(0.5 + 0.5 * z).toFixed(2)})`; g.beginPath(); g.arc(x, y, 1.4 + z * 2.6, 0, TAU); g.fill();
  }
  if (S.storm > 0) { const k = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 3.7)); if (k > 0.85) { g.fillStyle = `rgba(230,236,255,${(k - 0.85) * 3})`; g.fillRect(0, 0, W, H); } }
}

// ---------- the page: a still at ?t, or live ----------
const LIVE_MODE = Q.has('live');
const liveDate = () => Q.has('date') ? new Date(Q.get('date')) : new Date();
let COND = LIVE_MODE ? liveConditions(Q.get('loc') || 'moraine', liveDate()) : condFromQuery(), PLATES = null;
// the key that says the painting must be redone: the sun moved a degree, the weather or the moon changed
const condKey = c => [Math.round(c.sunAlt), c.sunSide, Math.round(c.moonAlt / 3), Math.round(c.moonX * 20), Math.round(c.moonPhase * 30), Math.round(c.cloud * 10), c.rain, c.snow, c.fog, c.storm, Math.round(c.groundSnow * 4), c.frozen, Math.round(c.aurora * 5), c.season].join(',');
let LAST_KEY = condKey(COND);
function refreshLive() {
  const c = liveConditions(COND.loc, liveDate()), k = condKey(c);
  COND = c; window.COND = c;
  if (k !== LAST_KEY) { LAST_KEY = k; PLATES = null; }
}
function renderAt(t) {
  const g = CTX; g.setTransform(SC, 0, 0, SC, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (!PLATES) PLATES = (Q.get('style') === 'paint' ? makeScene : makeLayered)(COND);
  drawLive(g, t, COND, PLATES);
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.14; g.fillStyle = g.createPattern(tooth(), 'repeat'); g.fillRect(0, 0, W, H); g.restore();
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.1); v.addColorStop(0, 'rgba(6,10,14,0)'); v.addColorStop(1, 'rgba(6,10,14,0.28)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
window.renderAt = renderAt;
window.setConditions = c => { COND = Object.assign({}, COND, c); PLATES = null; };
window.COND = COND;
if (LIVE_MODE) {
  // read the weather and the aurora first (up to 6 s), then keep them fresh; recheck the sky every minute
  const first = Promise.race([Promise.all([readWeather(), readKp()]), new Promise(r => setTimeout(r, 6000))]);
  first.then(() => { refreshLive(); PLATES = null; window.__ready = true; });
  setInterval(readWeather, 10 * 60000); setInterval(readKp, 30 * 60000); setInterval(refreshLive, 60000);
} else window.__ready = true;
if (!Q.has('render') && !navigator.webdriver) {
  if (Q.has('t')) renderAt(+Q.get('t'));
  else if (REDUCED) renderAt(0);
  else { let t0 = performance.now(), hiddenAt = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = performance.now(); else if (hiddenAt) t0 += performance.now() - hiddenAt; });
    (function loop() { if (!document.hidden) renderAt((performance.now() - t0) / 1000); requestAnimationFrame(loop); })(); }
}

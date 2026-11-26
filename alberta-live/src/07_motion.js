// ---------- motion: one clock for the whole scene, and every number in one place ----------
// After rossark-motion-skill: smooth waves with seeded phases (never Math.random per frame, never all in sync),
// small amplitudes, tips that trail their base, opacity only to appear or disappear. See MOTION.md.
const MOTION_TOKENS = {
  sway: { minDeg: 0.6, maxDeg: 3.2, kmhForMax: 50, period: [3800, 6200], tipDelay: 0.14, tipGain: 0.55, gustPeriod: 23000 },
  smoke: { period: 9000, puffs: 22, rise: 170, lean: 0.9 },
  stars: { dipEvery: [3000, 9000], dipLen: 700, dipDepth: 0.65 },
  glow: { period: 3400, amount: 0.04 },
};
const wave = (t, period, phase = 0) => Math.sin(TAU * (t * 1000 / period + phase));
const loopP = (t, period, phase = 0) => ((t * 1000 / period + phase) % 1 + 1) % 1;
const bell = p => Math.sin(Math.PI * clamp(p));
const seeded = (i, k = 0) => hash(i * 7 + 13, k + 101);
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// the sway angle (radians) of tree i at time t: the real wind sets the size, a slow gust breathes it,
// each tree has its own period and phase; the bias leans the trees downwind
function swayAt(t, i, S) {
  const T = MOTION_TOKENS.sway, w = clamp(S.wind / T.kmhForMax), deg = lerp(T.minDeg, T.maxDeg, w);
  const gust = 0.75 + 0.25 * wave(t, T.gustPeriod, seeded(i, 9) * 0.2);
  const per = lerp(T.period[0], T.period[1], seeded(i, 1));
  return (deg * gust * wave(t, per, seeded(i, 2)) + deg * 0.35 * w * S.windDir) * Math.PI / 180;
}
// a tree sprite drawn bending: the lower part leans by the sway, the upper part follows a beat later and further
function drawSwayTree(g, spr, x, y, k, t, i, S) {
  const T = MOTION_TOKENS.sway, a = swayAt(t, i, S), aLate = swayAt(t - T.tipDelay, i, S);
  const h = spr.height, w = spr.width, cut = Math.round(h * 0.45), lower = h - cut;
  const bend = a + T.tipGain * (aLate - a) + 0.35 * a;   // the tip moves later and further than the base
  g.save(); g.translate(x, y); g.scale(k, k);
  // lower part: sheared about the base
  g.save(); g.transform(1, 0, -Math.tan(a), 1, 0, 0); g.drawImage(spr, 0, cut - 2, w, lower + 2, -w / 2, -lower - 2, w, lower + 2); g.restore();
  // upper part: carried by the lower part's lean, then bending on its own (overlapping by 2 px so no seam shows)
  const top = -lower;
  g.save(); g.translate(-Math.tan(a) * top, top); g.transform(1, 0, -Math.tan(bend), 1, 0, 0); g.drawImage(spr, 0, 0, w, cut + 2, -w / 2, -cut, w, cut + 2); g.restore();
  g.restore();
}

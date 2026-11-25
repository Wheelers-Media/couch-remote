// Alberta Live: a scene drawn in code, live, from the real sky and weather over Calgary.
//
// The Rockies, flat and faceted (each peak a lit face and a shadow face), a lake that mirrors them,
// and a sky that follows what is really happening: the sun and the moon where they really are as
// seen looking west from Calgary (the moon in its real phase), the sky's colour from the sun's real
// height, the real cloud cover drifting on the real wind, rain, snow, fog and thunderstorms from the
// weather code, snow on the trees and a frozen lake in winter, and the northern lights when the real
// planetary K index says they are out over Alberta on a clear dark night.
//
// Two canvases, so the clock sits between them: the sky (behind the clock) and the land (in front
// of it, transparent where the sky is). The heavy parts (the sky's gradient, the mountains, the lake
// and its reflection, the clouds) are drawn once into off-screen canvases and redrawn only when the
// light changes (once a minute) or a new weather reading comes in; each frame only moves them a
// little (a slow camera sway, so the layers drift past each other) and draws the small moving
// things (stars, aurora, rain, snow, fog, glitter on the water).
//
// Data: Open-Meteo (free, no key) for the current weather at the home's place, every 10 minutes;
// NOAA SWPC's planetary K index (free, no key) for the aurora, every 30 minutes. Nothing else is
// asked and nothing is sent.
//
// Preview and test switches (?mock=1 pages): al_time=2026-11-25T17:10 (local time), al_code=<WMO>,
// al_cloud=0..100, al_wind=<km/h>, al_temp=<C>, al_kp=0..9, al_frozen=0|1.
//
// ES5 on purpose, like the rest of the TV home: old TV web views.
(function (root) {
  "use strict";

  var W = 1280, H = 720;          // the canvases' own size; CSS stretches them to the screen
  var LAKE = 0.73;                // the waterline, as a share of the height
  var VIEW_AZ = 262;              // looking west-south-west from Calgary, at the Front Ranges
  var FOV = 150;                  // degrees of sky across the screen
  var DEG = Math.PI / 180;
  var CALGARY = { lat: 51.0447, lon: -114.0719 };

  // ------------------------------------------------------------------ small helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
  function rgb(c, a) {
    var r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
    return a == null ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + clamp(a, 0, 1).toFixed(3) + ")";
  }
  function grey(c) { var l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l, l, l]; }
  function scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul ? Math.imul(seed ^ seed >>> 15, 1 | seed) : (seed ^ seed >>> 15) * (1 | seed);
      t = t + (Math.imul ? Math.imul(t ^ t >>> 7, 61 | t) : (t ^ t >>> 7) * (61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function q(name) {
    var m = root.location && root.location.search ? root.location.search.match(new RegExp("[?&]" + name + "=([^&]+)")) : null;
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ------------------------------------------------------------------ the sky's real positions
  // The low-precision formulas of Vladimir Agafonkin's SunCalc (BSD), from Astronomy Answers.
  var J1970 = 2440588, J2000 = 2451545, OBL = DEG * 23.4397;
  function toDays(d) { return d.valueOf() / 864e5 - 0.5 + J1970 - J2000; }
  function ra(l, b) { return Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)); }
  function dec(l, b) { return Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l)); }
  function azOf(Hh, phi, d) { return Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)); }
  function altOf(Hh, phi, d) { return Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(Hh)); }
  function sidereal(d, lw) { return DEG * (280.16 + 360.9856235 * d) - lw; }
  function sunCoords(d) {
    var M = DEG * (357.5291 + 0.98560028 * d);
    var L = M + DEG * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + DEG * 102.9372 + Math.PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    var L = DEG * (218.316 + 13.176396 * d), M = DEG * (134.963 + 13.064993 * d), F = DEG * (93.272 + 13.22935 * d);
    var l = L + DEG * 6.289 * Math.sin(M), b = DEG * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  // compass azimuth (0 north, 90 east) and altitude, in degrees
  function sunAt(date, lat, lon) {
    var lw = DEG * -lon, phi = DEG * lat, d = toDays(date), c = sunCoords(d), Hh = sidereal(d, lw) - c.ra;
    return { az: (azOf(Hh, phi, c.dec) / DEG + 180) % 360, alt: altOf(Hh, phi, c.dec) / DEG };
  }
  function moonAt(date, lat, lon) {
    var lw = DEG * -lon, phi = DEG * lat, d = toDays(date), c = moonCoords(d), Hh = sidereal(d, lw) - c.ra;
    var h = altOf(Hh, phi, c.dec);
    h = h + DEG * 0.017 / Math.tan(h + DEG * 10.26 / (h + DEG * 5.10));
    var s = sunCoords(d), sd = 149598000;
    var phi2 = Math.acos(Math.sin(s.dec) * Math.sin(c.dec) + Math.cos(s.dec) * Math.cos(c.dec) * Math.cos(s.ra - c.ra));
    var inc = Math.atan2(sd * Math.sin(phi2), c.dist - sd * Math.cos(phi2));
    var ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - c.ra), Math.sin(s.dec) * Math.cos(c.dec) - Math.cos(s.dec) * Math.sin(c.dec) * Math.cos(s.ra - c.ra));
    return { az: (azOf(Hh, phi, c.dec) / DEG + 180) % 360, alt: h / DEG, fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
  }
  // where a point of the sky lands on the screen (null when it is behind the viewer)
  function skyXY(az, alt) {
    var d = ((az - VIEW_AZ + 540) % 360) - 180;
    if (Math.abs(d) > FOV / 2 + 10) return null;
    var hy = LAKE * H - 40;   // the visible horizon, a little above the waterline (the far shore)
    return { x: W / 2 + d / (FOV / 2) * W / 2, y: hy - alt / 48 * hy };
  }

  // ------------------------------------------------------------------ what the weather means here
  // WMO codes (Open-Meteo): what falls, how hard, and how much of the sky is cloud when no cloud
  // cover reading has come in yet.
  function readCode(code) {
    var c = code | 0, o = { rain: 0, snow: 0, fog: 0, storm: 0, cloud: 0 };
    if (c === 0) o.cloud = 0.03;
    else if (c === 1) o.cloud = 0.2;
    else if (c === 2) o.cloud = 0.5;
    else if (c === 3) o.cloud = 0.95;
    else if (c === 45 || c === 48) { o.fog = 1; o.cloud = 0.9; }
    else if (c >= 51 && c <= 57) { o.rain = c === 51 || c === 56 ? 0.2 : c === 53 ? 0.32 : 0.45; o.cloud = 0.95; }
    else if (c >= 61 && c <= 67) { o.rain = c === 61 || c === 66 ? 0.45 : c === 63 ? 0.7 : 1; o.cloud = 1; }
    else if (c >= 71 && c <= 77) { o.snow = c === 71 ? 0.35 : c === 73 ? 0.65 : c === 77 ? 0.3 : 1; o.cloud = 1; }
    else if (c >= 80 && c <= 82) { o.rain = c === 80 ? 0.5 : c === 81 ? 0.75 : 1; o.cloud = 0.85; }
    else if (c === 85 || c === 86) { o.snow = c === 85 ? 0.55 : 0.95; o.cloud = 0.9; }
    else if (c >= 95) { o.rain = 0.95; o.storm = 1; o.cloud = 1; }
    return o;
  }

  // ------------------------------------------------------------------ colour keys, by the sun's height
  // Night is the reference wallpaper's indigo; day is cool Rockies limestone under a blue sky.
  var KEYS = [
    { alt: -18, top: "#05081a", mid: "#0c1636", hor: "#1b2a5c", lit: "#5f5bb0", shade: "#272a66", far: "#3a3f86", snow: "#c3c8ff", tree: "#0d1630", water: "#0a1a38", glow: "#000000" },
    { alt: -9, top: "#0b1238", mid: "#1d2a66", hor: "#4b4a8c", lit: "#6e64b8", shade: "#2d2b6c", far: "#4b4f98", snow: "#cfcfff", tree: "#111a3a", water: "#122650", glow: "#3a2a6a" },
    { alt: -3, top: "#1c2660", mid: "#5a4a8e", hor: "#e07a7a", lit: "#b27a9a", shade: "#3c3472", far: "#7a6aa6", snow: "#ffc8d8", tree: "#18203e", water: "#2a3266", glow: "#ff8a6a" },
    { alt: 2, top: "#2c4688", mid: "#b56e86", hor: "#ffb070", lit: "#e58f7c", shade: "#4a3a74", far: "#a77f9e", snow: "#ffd6c8", tree: "#1d2a3a", water: "#3a4a7a", glow: "#ffa060" },
    { alt: 9, top: "#3a6ab4", mid: "#8fb0dc", hor: "#ffd9a6", lit: "#c9a892", shade: "#565a7e", far: "#a8b0c8", snow: "#fff0e2", tree: "#22382e", water: "#3f78a6", glow: "#ffd090" },
    { alt: 25, top: "#2d6fd2", mid: "#6aa6e8", hor: "#cfe7f8", lit: "#a9a79c", shade: "#56607a", far: "#9fb2cf", snow: "#ffffff", tree: "#24463a", water: "#3d8ab8", glow: "#fff4d0" }
  ];
  var KEY_NAMES = ["top", "mid", "hor", "lit", "shade", "far", "snow", "tree", "water", "glow"];
  KEYS.forEach(function (k) { KEY_NAMES.forEach(function (n) { k[n] = hex(k[n]); }); });
  function paletteAt(alt) {
    var i = 0;
    while (i < KEYS.length - 1 && alt > KEYS[i + 1].alt) i++;
    var a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    var t = a === b ? 0 : smooth(a.alt, b.alt, alt);
    var p = {};
    KEY_NAMES.forEach(function (n) { p[n] = mix(a[n], b[n], t); });
    return p;
  }

  // ------------------------------------------------------------------ the land, made once
  // Each range is a ridgeline grown between a few hand-placed summits (shares of the screen: x, the
  // summit's height above the range's base), roughened by midpoint displacement so it reads as real
  // rock. The middle range's summits rise into the bottom of the clock's digits (about y 0.16-0.42 of
  // the screen), so the clock sits behind the peaks.
  var RANGES = {
    far1: { base: 0.655, rough: 0.5, seed: 3, pts: [[-0.06, 0.06], [0.08, 0.13], [0.2, 0.09], [0.33, 0.15], [0.47, 0.1], [0.6, 0.16], [0.74, 0.11], [0.88, 0.15], [1.06, 0.08]] },
    far2: { base: 0.69, rough: 0.6, seed: 5, pts: [[-0.06, 0.1], [0.06, 0.2], [0.17, 0.12], [0.26, 0.17], [0.38, 0.11], [0.55, 0.18], [0.66, 0.13], [0.79, 0.21], [0.9, 0.14], [1.06, 0.18]] },
    mid: { base: 0.725, rough: 0.75, seed: 11, pts: [[-0.06, 0.16], [0.07, 0.3], [0.16, 0.2], [0.26, 0.3], [0.33, 0.25], [0.41, 0.385], [0.47, 0.29], [0.53, 0.33], [0.6, 0.22],
      [0.7, 0.36], [0.735, 0.33], [0.82, 0.21], [0.92, 0.29], [1.06, 0.18]] },
    hills: { base: 0.742, rough: 0.25, seed: 17, pts: [[-0.06, 0.035], [0.1, 0.05], [0.25, 0.025], [0.42, 0.045], [0.58, 0.02], [0.75, 0.05], [0.9, 0.03], [1.06, 0.045]] }
  };

  // the ridgeline as screen points, x from -40 to W+40
  function ridge(rg) {
    var r = rng(rg.seed), pts = rg.pts.map(function (p) { return [p[0] * W, (rg.base - p[1]) * H]; }), i, k;
    for (k = 0; k < 6; k++) {
      var out = [pts[0]], amp = rg.rough * 70 / Math.pow(1.9, k);
      for (i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1], m = [(a[0] + b[0]) / 2 + (r() - 0.5) * (b[0] - a[0]) * 0.25, (a[1] + b[1]) / 2 + (r() - 0.5) * amp];
        out.push(m, b);
      }
      pts = out;
    }
    return pts;
  }

  // a range: the rock in its lit colour, snow above the snow line, then the faces turned away from
  // the light laid over both in a see-through shade, so rock and snow share one light
  function drawRange(c, rg, lit, shade, snow, snowLine, lightLeft, lightAmt, haze) {
    var pts = rg.line || (rg.line = ridge(rg)), base = rg.base * H, i;
    function body() {
      c.beginPath(); c.moveTo(-40, H); c.lineTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.lineTo(W + 80, H); c.closePath();
    }
    c.save();
    body();
    c.fillStyle = rgb(mix(shade, lit, 0.35 + 0.65 * lightAmt)); c.fill();
    c.clip();
    // snow: the band above the snow line, its lower edge torn
    if (snowLine > 0) {
      var r = rng(rg.seed + 101), sy = base - snowLine * H;
      c.beginPath(); c.moveTo(-40, -10); c.lineTo(W + 80, -10);
      for (var x = W + 80; x >= -40; x -= 14) c.lineTo(x, sy + (r() - 0.5) * 34 + Math.sin(x * 0.02) * 12);
      c.closePath();
      c.fillStyle = rgb(mix(snow, lit, 0.15)); c.fill();
    }
    // the shade: from each major summit (the highest point within 70 px either side) down its far
    // side along the ridge to the lowest point before the next summit, then straight down
    var majors = [], m;
    for (i = 1; i < pts.length - 1; i++) {
      var top = true;
      for (m = 0; m < pts.length; m++) if (m !== i && Math.abs(pts[m][0] - pts[i][0]) < 70 && pts[m][1] < pts[i][1]) { top = false; break; }
      if (top && base - pts[i][1] > 20) majors.push(i);
    }
    c.fillStyle = rgb(shade, 0.5 + 0.35 * lightAmt);
    majors.forEach(function (a, n) {
      var b = lightLeft ? majors[n + 1] : majors[n - 1];
      if (b == null) b = lightLeft ? pts.length - 1 : 0;
      var lo = a, k, st = a < b ? 1 : -1;
      for (k = a; k !== b; k += st) if (pts[k][1] > pts[lo][1]) lo = k;
      // the face is a wedge: the ridge down to the hollow, then the spine runs diagonally from the
      // summit to the foot, so the shadow side narrows towards the top like a real face
      var span = pts[lo][0] - pts[a][0], hgt = base - pts[a][1];
      var spine = pts[a][0] + (span === 0 ? 0 : (span > 0 ? 1 : -1)) * Math.min(Math.abs(span) * 0.9, hgt * 0.55);
      c.beginPath(); c.moveTo(pts[a][0], pts[a][1]);
      for (k = a; k !== lo + st; k += st) c.lineTo(pts[k][0], pts[k][1]);
      c.lineTo(pts[lo][0] + span * 0.35, base + 4);
      c.lineTo(spine, base + 4);
      c.closePath(); c.fill();
    });
    // a few long gullies on the lit faces
    c.strokeStyle = rgb(shade, 0.22); c.lineWidth = 1.2;
    majors.forEach(function (a) {
      var dir = lightLeft ? -1 : 1, hgt = base - pts[a][1];
      c.beginPath(); c.moveTo(pts[a][0] + dir * 6, pts[a][1] + 10);
      c.quadraticCurveTo(pts[a][0] + dir * hgt * 0.15, pts[a][1] + hgt * 0.5, pts[a][0] + dir * hgt * 0.32, base);
      c.stroke();
    });
    // haze rising from the valley floor in front of the range
    if (haze) {
      var hg = c.createLinearGradient(0, base - (base - Math.min.apply(null, pts.map(function (p) { return p[1]; }))) * 0.9, 0, base);
      hg.addColorStop(0, rgb(haze, 0)); hg.addColorStop(1, rgb(haze, rg === RANGES.mid ? 0.4 : 0.7));
      c.fillStyle = hg; c.fillRect(-40, 0, W + 120, H);
    }
    c.restore();
  }

  // a pine: a thin trunk and tiers of drooping branches, narrow at the top; snow on the tiers in winter
  function pine(c, x, y, h, col, snowy, lightLeft, r) {
    r = r || Math.random;
    var tiers = Math.max(5, Math.round(h / 11)), t, k;
    c.fillStyle = rgb(col);
    c.fillRect(x - Math.max(1, h * 0.01), y - h * 0.3, Math.max(2, h * 0.02), h * 0.3);
    for (k = 0; k < tiers; k++) {
      t = (k + 1) / tiers;
      var ty = y - h + t * h * 0.86, w = h * (0.035 + 0.19 * Math.pow(t, 0.85)) * (0.7 + r() * 0.55), drop = h * (0.03 + r() * 0.04);
      var lw = w * (0.8 + r() * 0.4), rw = w * (0.8 + r() * 0.4);
      c.beginPath();
      c.moveTo(x + (r() - 0.5) * 2, ty - h * 0.1);
      c.lineTo(x - lw, ty + drop); c.lineTo(x - lw * 0.6, ty + drop * 0.3); c.lineTo(x - lw * 0.75, ty + drop * 0.8);
      c.lineTo(x, ty + drop * 0.5);
      c.lineTo(x + rw * 0.75, ty + drop * 0.8); c.lineTo(x + rw * 0.6, ty + drop * 0.3); c.lineTo(x + rw, ty + drop);
      c.closePath(); c.fill();
      if (snowy > 0.05 && r() < 0.55) {
        // a little tuft of snow lying on the branch's upper side
        var sx = lightLeft ? -1 : 1, bw = (sx < 0 ? lw : rw), at = 0.3 + r() * 0.4, tl = Math.max(3, bw * 0.28);
        var px = x + sx * bw * at, py = ty + drop * at * 0.8;
        c.fillStyle = rgb([228, 234, 248], snowy * 0.75);
        c.beginPath(); c.moveTo(px - tl, py); c.quadraticCurveTo(px, py - tl * 0.45, px + tl, py + 1); c.closePath(); c.fill();
        c.fillStyle = rgb(col);
      }
    }
  }
  function forest(c, seed, x0, x1, yAt, n, hMin, hMax, col, snowy, lightLeft) {
    var r = rng(seed), i;
    for (i = 0; i < n; i++) {
      var x = lerp(x0, x1, (i + r()) / n), h = lerp(hMin, hMax, r());
      pine(c, x, yAt(x) + r() * 4, h, col, snowy, lightLeft, r);
    }
  }

  // the cabin on the right shore: logs, a roof (snow on it in winter), a chimney and two windows
  var CABIN = { x: 0.735, y: 0.835, w: 0.05 };
  function cabin(c, pal, snowy, glow) {
    var x = CABIN.x * W, y = CABIN.y * H, w = CABIN.w * W, h = w * 0.55, logs = mix([92, 58, 36], pal.tree, 0.35);
    c.fillStyle = rgb(logs); c.fillRect(x - w / 2, y - h, w, h);
    c.fillStyle = rgb(scale(logs, 0.7));
    for (var i = 1; i < 5; i++) c.fillRect(x - w / 2, y - h + i * h / 5, w, 1.2);
    c.fillStyle = rgb(mix([120, 40, 34], pal.shade, 0.35));
    c.beginPath(); c.moveTo(x - w * 0.62, y - h + 1); c.lineTo(x - w * 0.05, y - h - w * 0.42); c.lineTo(x + w * 0.62, y - h + 1); c.closePath(); c.fill();
    if (snowy > 0.1) {
      c.fillStyle = rgb([236, 240, 250], snowy);
      c.beginPath(); c.moveTo(x - w * 0.62, y - h - 1); c.lineTo(x - w * 0.05, y - h - w * 0.42); c.lineTo(x + w * 0.62, y - h - 1); c.lineTo(x - w * 0.05, y - h - w * 0.32); c.closePath(); c.fill();
    }
    c.fillStyle = rgb(scale(logs, 0.6)); c.fillRect(x + w * 0.22, y - h - w * 0.36, w * 0.1, w * 0.26);   // the chimney
    var win = glow > 0.05 ? mix([60, 50, 40], [255, 196, 110], glow) : scale(logs, 0.45);
    c.fillStyle = rgb(win);
    c.fillRect(x - w * 0.36, y - h * 0.68, w * 0.18, h * 0.32); c.fillRect(x + w * 0.14, y - h * 0.68, w * 0.18, h * 0.32);
    c.fillStyle = rgb(scale(logs, 0.5)); c.fillRect(x - w * 0.06, y - h * 0.62, w * 0.12, h * 0.62);   // the door
    if (glow > 0.05) {
      var g = c.createRadialGradient(x, y - h * 0.5, 0, x, y - h * 0.5, w * 1.6);
      g.addColorStop(0, "rgba(255,190,110," + (0.35 * glow).toFixed(3) + ")"); g.addColorStop(1, "rgba(255,190,110,0)");
      c.fillStyle = g; c.fillRect(x - w * 2, y - h * 2, w * 4, h * 3);
    }
    return { x: x + w * 0.27, y: y - h - w * 0.36 };   // where the smoke leaves
  }
  // ------------------------------------------------------------------ the scene
  var S = {
    back: null, front: null, bctx: null, fctx: null,
    on: false, paused: false, raf: 0, lastDraw: 0, t0: 0,
    lighter: false,
    place: null, wx: null, extra: null, kp: null, auroraAlways: false,
    built: "", layers: null, glass: "", glassCb: null,
    stars: null, milky: null, rays: null, auroraSmall: null, clouds: [], drops: [], flash: 0, nextFlash: 0,
    timers: []
  };

  function now() {
    var t = q("al_time");
    if (t) {
      var d = new Date(t);
      if (!isNaN(d.valueOf())) return new Date(d.valueOf() + (Date.now() - S.t0Wall));
    }
    return new Date();
  }

  // everything the picture depends on, from the readings and the clock
  function state() {
    var place = S.place && isFinite(S.place.lat) && isFinite(S.place.lon) ? S.place : CALGARY;
    var d = now();
    var sun = sunAt(d, place.lat, place.lon), moon = moonAt(d, place.lat, place.lon);
    var code = q("al_code") != null ? +q("al_code") : S.extra && S.extra.code != null ? S.extra.code : S.wx && S.wx.code != null ? S.wx.code : 1;
    var w = readCode(code);
    var cloud = q("al_cloud") != null ? +q("al_cloud") / 100 : S.extra && S.extra.cloud != null ? S.extra.cloud / 100 : w.cloud;
    if (w.rain || w.snow || w.fog) cloud = Math.max(cloud, 0.8);
    var wind = q("al_wind") != null ? +q("al_wind") : S.extra && S.extra.wind != null ? S.extra.wind : 8;
    var windDir = S.extra && S.extra.windDir != null ? S.extra.windDir : 250;
    var temp = q("al_temp") != null ? +q("al_temp") : S.extra && S.extra.temp != null ? S.extra.temp : S.wx && S.wx.temp != null ? S.wx.temp : 5;
    var month = d.getMonth();   // 0 January
    var winter = month <= 3 || month >= 10;
    var snowDepth = S.extra && S.extra.snowDepth != null ? S.extra.snowDepth : null;
    var groundSnow = snowDepth != null ? clamp(snowDepth / 0.08, 0, 1) : (winter && temp <= 2 ? 0.8 : 0) ;
    if (w.snow) groundSnow = Math.max(groundSnow, 0.6 + w.snow * 0.4);
    var frozen = q("al_frozen") != null ? q("al_frozen") === "1" : (month >= 11 || month <= 3);
    var kp = q("al_kp") != null ? +q("al_kp") : S.kp;
    var dark = smooth(-6, -15, sun.alt);
    var aurora = 0;
    if (kp != null) aurora = clamp((kp - 2.5) / 3.5, 0, 1);
    if (S.auroraAlways) aurora = Math.max(aurora, 0.55);
    aurora *= dark * (1 - smooth(0.35, 0.85, cloud));
    return {
      d: d, sun: sun, moon: moon, code: code, rain: w.rain, snow: w.snow, fog: w.fog, storm: w.storm, cloud: clamp(cloud, 0, 1),
      wind: wind, windDir: windDir, temp: temp, groundSnow: groundSnow, frozen: frozen, aurora: aurora, dark: dark,
      // seasonal snow line on the peaks (share of the screen height above each range's base)
      snowLine: winter ? 0.3 : month === 4 || month === 9 ? 0.16 : 0.08
    };
  }

  // the key that says when the cached layers must be drawn again
  function buildKey(st) {
    return [Math.round(st.sun.alt * 2), Math.round(st.moon.alt), Math.round(st.cloud * 10), st.code, Math.round(st.groundSnow * 4), st.frozen ? 1 : 0, Math.round(st.snowLine * 100)].join(",");
  }

  function build(st) {
    var pal = paletteAt(st.sun.alt);
    // overcast: the colours go towards their grey, darker under rain and storm, lighter in snow
    var ov = smooth(0.55, 1, st.cloud) * 0.75 + st.fog * 0.2;
    var wet = Math.max(st.rain * 0.25, st.storm * 0.4);
    ["top", "mid", "hor", "lit", "shade", "far", "water"].forEach(function (n) {
      var c = mix(pal[n], grey(pal[n]), ov);
      if (st.snow) c = mix(c, [200, 206, 218], st.snow * 0.18 * (1 - st.dark));
      pal[n] = scale(c, 1 - wet);
    });
    var moonLight = st.moon.alt > 0 ? st.moon.fraction * smooth(0, 25, st.moon.alt) * st.dark * (1 - st.cloud) : 0;
    if (moonLight) ["lit", "far", "snow"].forEach(function (n) { pal[n] = mix(pal[n], [150, 160, 230], moonLight * 0.25); });
    // which side the light comes from: facing west, the south (and a southern sun) is on the left
    var src = st.sun.alt > -4 ? st.sun : st.moon;
    var lightLeft = (((src.az - VIEW_AZ + 540) % 360) - 180) < 0;
    var lightAmt = st.sun.alt > -4 ? 1 - ov * 0.75 : 0.3 + moonLight * 0.6;
    S.pal = pal; S.lightLeft = lightLeft;

    var L = S.layers || {}, c;
    function fresh(name, w) { L[name] = L[name] || canvas(w, H); var x = L[name].getContext("2d"); x.clearRect(0, 0, w, H); return x; }
    // the sky (the back canvas's ground), and the glow where the sun is or just went down
    c = fresh("sky", W);
    var g = c.createLinearGradient(0, 0, 0, LAKE * H);
    g.addColorStop(0, rgb(pal.top)); g.addColorStop(0.55, rgb(pal.mid)); g.addColorStop(1, rgb(pal.hor));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var sp = skyXY(st.sun.az, Math.max(st.sun.alt, -4));
    if (sp && st.sun.alt > -10) {
      var gl = c.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 560);
      var ga = smooth(-10, -1, st.sun.alt) * (1 - ov * 0.8);
      gl.addColorStop(0, rgb(pal.glow, 0.6 * ga)); gl.addColorStop(1, rgb(pal.glow, 0));
      c.fillStyle = gl; c.fillRect(0, 0, W, H);
    }
    // the land, back to front, each range hazier the farther it is (+40: room for the camera's sway)
    var haze = mix(pal.hor, pal.mid, 0.25);
    c = fresh("far", W + 80); c.save(); c.translate(40, 0);
    drawRange(c, RANGES.far1, mix(pal.far, pal.hor, 0.55), mix(pal.shade, pal.hor, 0.6), mix(pal.snow, pal.hor, 0.45), st.snowLine * 0.55, lightLeft, lightAmt * 0.6, haze);
    drawRange(c, RANGES.far2, mix(pal.far, pal.hor, 0.3), mix(pal.shade, pal.hor, 0.42), mix(pal.snow, pal.hor, 0.3), st.snowLine * 0.75, lightLeft, lightAmt * 0.8, haze);
    c.restore();
    c = fresh("mid", W + 80); c.save(); c.translate(40, 0);
    drawRange(c, RANGES.mid, pal.lit, pal.shade, pal.snow, st.snowLine, lightLeft, lightAmt, mix(haze, pal.mid, 0.3));
    // forested foothills along the far shore
    var hillCol = mix(pal.tree, pal.hor, 0.22), hl = RANGES.hills.line || (RANGES.hills.line = ridge(RANGES.hills));
    c.fillStyle = rgb(hillCol);
    c.beginPath(); c.moveTo(-40, H); hl.forEach(function (p) { c.lineTo(p[0], p[1]); }); c.lineTo(W + 80, H); c.closePath(); c.fill();
    var hillY = function (x) { for (var i = 1; i < hl.length; i++) if (hl[i][0] >= x) return lerp(hl[i - 1][1], hl[i][1], (x - hl[i - 1][0]) / Math.max(1, hl[i][0] - hl[i - 1][0])); return hl[hl.length - 1][1]; };
    forest(c, 23, -30, W + 40, hillY, 230, 10, 24, hillCol, st.groundSnow * 0.7, lightLeft);
    c.restore();

    // the lake: everything above the waterline mirrored, the water's colour over it (or ice)
    var ly = Math.round(LAKE * H), above = canvas(W + 80, H), ac = above.getContext("2d");
    ac.drawImage(L.sky, 40, 0); ac.drawImage(L.far, 0, 0); ac.drawImage(L.mid, 0, 0);
    c = fresh("lake", W + 80);
    c.save(); c.translate(0, 2 * ly); c.scale(1, -1); c.drawImage(above, 0, 0); c.restore();
    c.clearRect(0, 0, W + 80, ly);
    if (st.frozen) {
      var ice = c.createLinearGradient(0, ly, 0, H);
      ice.addColorStop(0, rgb(mix(pal.snow, pal.water, 0.4), 0.85)); ice.addColorStop(1, rgb(mix(pal.snow, pal.shade, 0.35), 0.95));
      c.fillStyle = ice; c.fillRect(0, ly, W + 80, H - ly);
    } else {
      var wg = c.createLinearGradient(0, ly, 0, H);
      wg.addColorStop(0, rgb(pal.water, 0.3)); wg.addColorStop(1, rgb(scale(pal.water, 0.6), 0.75));
      c.fillStyle = wg; c.fillRect(0, ly, W + 80, H - ly);
      var r = rng(3), y;
      for (y = ly + 3; y < H; y += 2 + (y - ly) * 0.05) {
        c.fillStyle = rgb(mix(pal.water, pal.hor, 0.5), 0.06 + r() * 0.1);
        c.fillRect(r() * 400, y, 120 + r() * (W - 200), 1);
      }
    }
    // a soft mist line where the water meets the far shore
    var mg = c.createLinearGradient(0, ly - 8, 0, ly + 14);
    mg.addColorStop(0, rgb(haze, 0)); mg.addColorStop(0.5, rgb(haze, 0.45)); mg.addColorStop(1, rgb(haze, 0));
    c.fillStyle = mg; c.fillRect(0, ly - 8, W + 80, 22);

    // the near shores, the tall pines framing the picture, the cabin and the grass
    c = fresh("near", W + 160); c.save(); c.translate(80, 0);
    var nearCol = mix(pal.tree, [4, 6, 10], 0.45), shoreCol = mix(pal.tree, pal.shade, 0.3);
    var ground = st.groundSnow > 0.15 ? mix(mix(pal.snow, pal.shade, 0.3), shoreCol, 1 - st.groundSnow) : shoreCol;
    c.fillStyle = rgb(ground);
    c.beginPath(); c.moveTo(-80, H); c.lineTo(-80, 0.8 * H); c.bezierCurveTo(160, 0.79 * H, 330, 0.86 * H, 470, H); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(W + 80, H); c.lineTo(W + 80, 0.79 * H); c.bezierCurveTo(W - 160, 0.8 * H, W - 330, 0.84 * H, W - 520, H); c.closePath(); c.fill();
    // rocks along the water's edge
    var rr = rng(51), k;
    c.fillStyle = rgb(mix(grey(pal.shade), [24, 26, 32], 0.5));
    for (k = 0; k < 6; k++) {
      var rx = k < 3 ? lerp(330, 430, k / 3) + rr() * 20 : lerp(W - 470, W - 380, (k - 3) / 3), ryy = H * (k < 3 ? 0.9 + k * 0.025 : 0.89 + (k - 3) * 0.03), rw = 10 + rr() * 16;
      c.beginPath(); c.ellipse ? c.ellipse(rx, ryy, rw, rw * 0.4, 0, Math.PI, 0) : c.arc(rx, ryy, rw * 0.5, Math.PI, 0); c.fill();
    }
    var glow = smooth(4, -4, st.sun.alt);   // windows lit from dusk to dawn
    S.chimney = cabin(c, pal, st.groundSnow, glow);
    // the framing pines: tall on both edges, smaller ones in front of the cabin's woods
    forest(c, 61, 0.735 * W + 70, 0.83 * W, function () { return 0.84 * H; }, 6, 60, 110, nearCol, st.groundSnow, lightLeft);
    forest(c, 67, -40, 0.16 * W, function (x) { return 0.83 * H + x * 0.06; }, 7, 300, 560, nearCol, st.groundSnow, lightLeft);
    forest(c, 71, 0.86 * W, W + 60, function (x) { return 0.82 * H + (W - x) * 0.05; }, 7, 300, 590, nearCol, st.groundSnow, lightLeft);
    forest(c, 73, 0.12 * W, 0.24 * W, function (x) { return 0.86 * H + x * 0.02; }, 4, 120, 200, nearCol, st.groundSnow, lightLeft);
    // grass along the shore, golden in late summer and autumn, under snow in winter
    var month = st.d.getMonth(), grass = month >= 7 && month <= 9 ? [150, 128, 70] : [70, 100, 60];
    grass = mix(mix(grass, pal.shade, 0.5 + 0.4 * st.dark), ground, st.groundSnow * 0.8);
    c.strokeStyle = rgb(grass); c.lineWidth = 1.4;
    var gr = rng(81);
    c.beginPath();
    for (k = 0; k < 260; k++) {
      var gx = k < 130 ? rr() * 430 - 40 : W - 520 + gr() * 600, gy = H - gr() * 70 * (k < 130 ? 1 - gx / 470 : 1) - 2, gh = 10 + gr() * 22;
      c.moveTo(gx, gy); c.quadraticCurveTo(gx + 2, gy - gh * 0.6, gx + (gr() - 0.5) * 10, gy - gh);
    }
    c.stroke();
    c.restore();

    // clouds: soft clusters of puffs, lit on top in the sky's light, shaded underneath
    var n = Math.round(st.cloud * 14), cr = rng(41), i;
    S.clouds = [];
    var ctop = mix(pal.hor, [255, 255, 255], 0.35 * (1 - st.dark)), under = mix(pal.mid, pal.shade, 0.4);
    if (st.sun.alt > -6 && st.sun.alt < 8) ctop = mix(ctop, pal.glow, 0.5);
    for (i = 0; i < n; i++) S.clouds.push(makeCloud(cr, ctop, under, i));
    S.overcast = ov;
    S.layers = L;
    makeGlass();
  }

  function makeCloud(r, top, under, i) {
    var cw = 160 + r() * 300, ch = cw * 0.42, sc = 0.35;   // drawn small, then scaled up: soft edges for free
    var sm = canvas(Math.ceil(cw * sc) + 8, Math.ceil(ch * sc) + 8), x = sm.getContext("2d"), j;
    var puffs = 5 + Math.floor(r() * 5);
    x.fillStyle = "#fff";
    for (j = 0; j < puffs; j++) {
      var u = (j + 0.5) / puffs, pr = (0.18 + 0.22 * Math.sin(u * Math.PI) + r() * 0.08) * ch * sc;
      x.beginPath(); x.arc(4 + u * cw * sc, ch * sc + 4 - pr * (0.9 + r() * 0.3), pr, 0, Math.PI * 2); x.fill();
    }
    x.fillRect(4 + cw * sc * 0.1, ch * sc * 0.72, cw * sc * 0.8, ch * sc * 0.28 + 2);
    x.globalCompositeOperation = "source-atop";
    var g = x.createLinearGradient(0, 0, 0, ch * sc + 8);
    g.addColorStop(0, rgb(top)); g.addColorStop(0.6, rgb(mix(top, under, 0.5))); g.addColorStop(1, rgb(under));
    x.fillStyle = g; x.fillRect(0, 0, sm.width, sm.height);
    var big = canvas(Math.ceil(cw) + 24, Math.ceil(ch) + 24);
    big.getContext("2d").drawImage(sm, 0, 0, big.width, big.height);
    return { img: big, x: r() * (W + 400) - 200, y: 20 + r() * (LAKE * H * 0.5), speed: 0.4 + r() * 0.8, a: 0.8 + r() * 0.2 };
  }
  // the clock's frosted fill: a soft, bright copy of the sky behind it
  function makeGlass() {
    try {
      var g = canvas(320, 180), c = g.getContext("2d");
      c.drawImage(S.back, 0, 0, 320, 180);
      var s = canvas(80, 45);
      s.getContext("2d").drawImage(g, 0, 0, 80, 45);
      c.clearRect(0, 0, 320, 180);
      c.drawImage(s, 0, 0, 320, 180);
      c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(0, 0, 320, 180);
      S.glass = g.toDataURL("image/jpeg", 0.82);
      if (S.glassCb) S.glassCb(S.glass);
    } catch (e) {}
  }

  // ------------------------------------------------------------------ things that move, made once
  function makeStars() {
    var r = rng(5), i, out = [];
    for (i = 0; i < 320; i++) {
      var y = Math.pow(r(), 1.6) * LAKE * H * 0.92;
      out.push({ x: r() * W, y: y, s: r() < 0.08 ? 2 : 1, a: 0.35 + r() * 0.65, f: 0.4 + r() * 2.2, p: r() * 6.28 });
    }
    S.stars = out;
    // the Milky Way: a soft band of tiny stars and haze across the west sky
    var m = canvas(W, H), c = m.getContext("2d");
    var x0 = W * 0.05, y0 = H * 0.02, x1 = W * 0.95, y1 = H * 0.55, nx = -(y1 - y0), ny = x1 - x0, L = Math.sqrt(nx * nx + ny * ny);
    nx /= L; ny /= L;
    for (i = 0; i < 70; i++) {
      var u = r(), off = (r() - 0.5) * 120, cx = lerp(x0, x1, u) + nx * off, cy = lerp(y0, y1, u) + ny * off, rad = 40 + r() * 90;
      var hg = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      hg.addColorStop(0, "rgba(190,180,255,0.06)"); hg.addColorStop(1, "rgba(190,180,255,0)");
      c.fillStyle = hg; c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    for (i = 0; i < 1600; i++) {
      var uu = r(), o = (r() + r() + r() - 1.5) * 90;
      c.fillStyle = "rgba(235,235,255," + (0.15 + r() * 0.5).toFixed(2) + ")";
      c.fillRect(lerp(x0, x1, uu) + nx * o, lerp(y0, y1, uu) + ny * o, 1, 1);
    }
    S.milky = m;
    // one aurora ray: green at the foot, violet at the top, soft at both ends
    var ray = canvas(4, 128), rc = ray.getContext("2d"), rg = rc.createLinearGradient(0, 0, 0, 128);
    rg.addColorStop(0, "rgba(150,90,255,0)"); rg.addColorStop(0.35, "rgba(150,110,255,0.22)");
    rg.addColorStop(0.7, "rgba(60,255,170,0.8)"); rg.addColorStop(0.92, "rgba(120,255,200,1)"); rg.addColorStop(1, "rgba(120,255,200,0)");
    rc.fillStyle = rg; rc.fillRect(0, 0, 4, 128);
    S.rays = ray;
    S.auroraSmall = canvas(200, 112);
  }

  function drawAurora(c, st, t) {
    var a = S.auroraSmall, x = a.getContext("2d"), i, AW = 200, AH = 112;
    x.clearRect(0, 0, AW, AH);
    var strength = st.aurora;
    for (i = 0; i < AW; i++) {
      var u = i / AW;
      var base = AH * 0.62 + 9 * Math.sin(u * 7 + t * 0.07) + 6 * Math.sin(u * 17 - t * 0.11) + 3 * Math.sin(u * 31 + t * 0.05);
      var I = strength * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(u * 9 + t * 0.09 + Math.sin(u * 3 + t * 0.03) * 2), 2));
      I *= 0.85 + 0.15 * Math.sin(i * 0.9 + t * 0.5);
      var h = AH * (0.32 + 0.22 * strength) + 10 * Math.sin(u * 13 + t * 0.05);
      x.globalAlpha = clamp(I * 0.8, 0, 1);
      x.drawImage(S.rays, i, base - h, 2, h);
    }
    x.globalAlpha = 1;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = S.lighter ? 0.8 : 0.9;
    c.drawImage(a, 0, 0, W, H);
    c.restore();
  }

  function drawMoon(c, st) {
    var p = skyXY(st.moon.az, st.moon.alt);
    if (!p || st.moon.alt < -2) return;
    var R = 24, vis = (1 - st.cloud * 0.85) * (1 - (1 - st.dark) * 0.6);
    if (vis <= 0.03) return;
    var gl = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 6);
    gl.addColorStop(0, "rgba(220,225,255," + (0.28 * vis * st.moon.fraction).toFixed(3) + ")"); gl.addColorStop(1, "rgba(220,225,255,0)");
    c.fillStyle = gl; c.fillRect(p.x - R * 6, p.y - R * 6, R * 12, R * 12);
    c.save();
    c.globalAlpha = vis;
    // the dark part, faint, then the lit part: a half disc and the terminator ellipse
    c.fillStyle = rgb(mix(S.pal.mid, [40, 44, 80], 0.5), 0.6);
    c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill();
    var ph = st.moon.phase, k = Math.cos(ph * 2 * Math.PI);   // 1 new, -1 full
    var waxing = ph < 0.5;
    c.fillStyle = "#f4f4ff";
    c.beginPath();
    c.arc(p.x, p.y, R, -Math.PI / 2, Math.PI / 2, !waxing);
    c.ellipse ? c.ellipse(p.x, p.y, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing) : c.arc(p.x, p.y, R, Math.PI / 2, -Math.PI / 2, waxing);
    c.closePath(); c.fill();
    // the reference's signature: thin bands cut across the lower half of the moon
    c.fillStyle = rgb(S.pal.mid);
    c.fillRect(p.x - R - 1, p.y + R * 0.3, R * 2 + 2, 2);
    c.fillRect(p.x - R - 1, p.y + R * 0.55, R * 2 + 2, 2.5);
    c.fillRect(p.x - R - 1, p.y + R * 0.78, R * 2 + 2, 3);
    c.restore();
  }

  function drawSun(c, st) {
    var p = skyXY(st.sun.az, st.sun.alt);
    if (!p || st.sun.alt < -1.5) return;
    var vis = 1 - smooth(0.5, 1, st.cloud) * 0.92 - st.fog * 0.5;
    if (vis <= 0.03) return;
    var low = smooth(12, 0, st.sun.alt), R = 22 + low * 6;
    var col = mix([255, 250, 230], [255, 150, 80], low);
    var gl = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 5);
    gl.addColorStop(0, rgb(col, 0.5 * vis)); gl.addColorStop(1, rgb(col, 0));
    c.fillStyle = gl; c.fillRect(p.x - R * 5, p.y - R * 5, R * 10, R * 10);
    c.fillStyle = rgb(col, vis);
    c.beginPath(); c.arc(p.x, p.y, R, 0, Math.PI * 2); c.fill();
  }

  // ------------------------------------------------------------------ each frame
  function frame(ts) {
    S.raf = 0;
    if (!S.on || S.paused) return;
    var fps = S.lighter ? 15 : 30;
    if (ts - S.lastDraw < 1000 / fps - 2) { S.raf = requestAnimationFrame(frame); return; }
    var dt = Math.min(0.2, (ts - (S.lastDraw || ts)) / 1000);
    S.lastDraw = ts;
    var t = ts / 1000;
    var st = S.st;
    var b = S.bctx, f = S.fctx, L = S.layers;
    // the camera: a slow sway and lean, so the layers slide past each other
    var sw = Math.sin(t * 2 * Math.PI / 95), bob = Math.sin(t * 2 * Math.PI / 140);

    // ---- behind the clock: the sky
    b.drawImage(L.sky, 0, 0);
    var night = st.dark * (1 - st.cloud * 0.92) * (1 - st.fog);
    if (night > 0.02) {
      b.globalAlpha = night * 0.85; b.drawImage(S.milky, sw * 3, bob * 2); b.globalAlpha = 1;
      var i, s;
      for (i = 0; i < S.stars.length; i++) {
        s = S.stars[i];
        var a = s.a * night * (0.6 + 0.4 * Math.sin(t * s.f + s.p));
        if (a < 0.03) continue;
        b.fillStyle = "rgba(240,242,255," + a.toFixed(3) + ")";
        b.fillRect(s.x + sw * 3, s.y + bob * 2, s.s, s.s);
      }
    }
    if (st.aurora > 0.02) drawAurora(b, st, t);
    drawSun(b, st);
    drawMoon(b, st);
    // clouds drift with the wind (westerlies blow towards the viewer's right-to-left? no: west wind blows
    // from the mountains towards Calgary, which reads as drifting out of the picture towards us; on screen
    // that is a slow drift, so the direction only sets left or right)
    var wdir = Math.sin((st.windDir - VIEW_AZ) * DEG) < 0 ? -1 : 1;
    var wspd = 4 + st.wind * 0.9;
    for (i = 0; i < S.clouds.length; i++) {
      var cl = S.clouds[i];
      cl.x += wdir * wspd * cl.speed * dt;
      if (cl.x > W + 60) cl.x = -cl.img.width - 60;
      if (cl.x < -cl.img.width - 60) cl.x = W + 60;
      b.globalAlpha = cl.a; b.drawImage(cl.img, cl.x + sw * 6, cl.y + bob * 3); b.globalAlpha = 1;
    }
    if (S.overcast > 0.3) {   // a flat sheet of cloud over everything up high
      var og = b.createLinearGradient(0, 0, 0, LAKE * H);
      og.addColorStop(0, rgb(grey(S.pal.top), S.overcast * 0.55)); og.addColorStop(1, rgb(grey(S.pal.hor), 0));
      b.fillStyle = og; b.fillRect(0, 0, W, H);
    }

    // ---- in front of the clock: the land, then the weather
    f.clearRect(0, 0, W, H);
    f.drawImage(L.far, -40 + sw * 4, bob * 2);
    f.drawImage(L.mid, -40 + sw * 9, bob * 3);
    f.drawImage(L.lake, -40 + sw * 9, 0);
    // glitter on the water under the moon or the low sun
    if (!st.frozen) {
      var src = st.sun.alt > -2 ? st.sun : st.moon, sp = src.alt > -2 ? skyXY(src.az, Math.max(src.alt, 0)) : null;
      var gv = sp ? (src === st.sun ? smooth(25, 2, st.sun.alt) : st.moon.fraction * st.dark) * (1 - st.cloud * 0.9) : 0;
      if (gv > 0.05) {
        var ly = LAKE * H + 6, k;
        for (k = 0; k < 26; k++) {
          var yy = ly + Math.pow(k / 26, 1.4) * (H - ly), wv = 8 + k * 2.4;
          var al = gv * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.1 + k * 1.7)));
          f.fillStyle = src === st.sun ? rgb(mix([255, 220, 160], [255, 255, 240], st.sun.alt / 25), al) : "rgba(235,238,255," + al.toFixed(3) + ")";
          f.fillRect(sp.x + sw * 9 - wv / 2 + Math.sin(t * 0.9 + k) * wv * 0.6, yy, wv, k > 18 ? 2 : 1.5);
        }
      }
    }
    // the aurora's light on the water
    if (st.aurora > 0.05 && !st.frozen) {
      var ag = f.createLinearGradient(0, LAKE * H, 0, H);
      ag.addColorStop(0, "rgba(60,255,170," + (0.18 * st.aurora).toFixed(3) + ")"); ag.addColorStop(1, "rgba(60,255,170,0)");
      f.fillStyle = ag; f.fillRect(0, LAKE * H, W, H);
    }
    f.drawImage(L.near, -80 + sw * 22, bob * 5);
    smoke(f, st, t, dt, sw * 22, bob * 5);
    weather(f, st, t, dt, sw);
    S.raf = requestAnimationFrame(frame);
  }

  // chimney smoke: the fire is lit when it is cold out, and the smoke leans with the real wind
  function smoke(f, st, t, dt, ox, oy) {
    var on = st.temp < 16 || st.dark > 0.5;
    var P = S.puffs || (S.puffs = []), ch = S.chimney, i;
    if (!ch) return;
    S.puffClock = (S.puffClock || 0) + dt;
    if (on && S.puffClock > (S.lighter ? 0.7 : 0.35)) { S.puffClock = 0; P.push({ x: ch.x, y: ch.y, r: 3, a: 0.5, age: 0 }); }
    var wdir = Math.sin((st.windDir - VIEW_AZ) * DEG) < 0 ? -1 : 1, drift = clamp(st.wind, 0, 60) * 0.9 * wdir;
    var col = mix(mix(S.pal.hor, [230, 230, 236], 0.55), [60, 64, 80], st.dark * 0.55);
    for (i = P.length - 1; i >= 0; i--) {
      var p = P[i];
      p.age += dt; p.y -= (14 - Math.min(10, Math.abs(drift) * 0.2)) * dt; p.x += (drift * 0.6 + Math.sin(t * 0.7 + p.age) * 3) * dt; p.r += 3.2 * dt;
      p.a = 0.45 * (1 - p.age / 9);
      if (p.a <= 0) { P.splice(i, 1); continue; }
      f.fillStyle = rgb(col, p.a);
      f.beginPath(); f.arc(p.x + ox, p.y + oy, p.r, 0, 6.283); f.fill();
    }
  }

  function weather(f, st, t, dt, sw) {
    var i, d;
    // fog: soft bands drifting along the lake and up the valley
    if (st.fog > 0 || st.rain > 0.6) {
      var fa = st.fog ? 0.55 : 0.2;
      for (i = 0; i < 4; i++) {
        var fy = H * (0.5 + i * 0.09), fx = ((t * (6 + i * 3) + i * 300) % (W + 600)) - 300;
        var fg = f.createLinearGradient(0, fy - 60, 0, fy + 60);
        var fc = mix(S.pal.hor, [220, 225, 235], 0.5);
        fg.addColorStop(0, rgb(fc, 0)); fg.addColorStop(0.5, rgb(fc, fa * (0.5 + 0.12 * i))); fg.addColorStop(1, rgb(fc, 0));
        f.fillStyle = fg; f.fillRect(fx - 400, fy - 60, W + 800, 120);
      }
    }
    // rain and snow: a pool of drops, as many as the reading says
    var want = st.rain ? Math.round((S.lighter ? 90 : 220) * st.rain) : st.snow ? Math.round((S.lighter ? 70 : 180) * st.snow) : 0;
    var r = Math.random;
    while (S.drops.length < want) S.drops.push({ x: r() * W, y: r() * H, z: 0.4 + r() * 0.6, p: r() * 6.28 });
    if (S.drops.length > want) S.drops.length = want;
    var lean = clamp(st.wind / 60, 0, 0.6) * (Math.sin((st.windDir - VIEW_AZ) * DEG) < 0 ? -1 : 1);
    if (st.rain) {
      f.strokeStyle = rgb(mix(S.pal.hor, [220, 230, 255], 0.6), 0.45);
      f.lineWidth = 1.2;
      f.beginPath();
      for (i = 0; i < S.drops.length; i++) {
        d = S.drops[i];
        var v = 900 * d.z;
        d.y += v * dt; d.x += v * lean * dt;
        if (d.y > H) { d.y = -20; d.x = r() * W; }
        if (d.x > W) d.x -= W; if (d.x < 0) d.x += W;
        var len = 14 + 10 * d.z;
        f.moveTo(d.x, d.y); f.lineTo(d.x - lean * len, d.y - len);
      }
      f.stroke();
    } else if (st.snow) {
      f.fillStyle = "rgba(245,248,255,0.9)";
      for (i = 0; i < S.drops.length; i++) {
        d = S.drops[i];
        d.y += (30 + 50 * d.z) * dt; d.x += (Math.sin(t * 0.8 + d.p) * 14 + lean * 120) * dt;
        if (d.y > H) { d.y = -6; d.x = r() * W; }
        if (d.x > W) d.x -= W; if (d.x < 0) d.x += W;
        var rad = 1 + d.z * 2.2;
        f.globalAlpha = 0.5 + 0.5 * d.z;
        f.beginPath(); f.arc(d.x, d.y, rad, 0, 6.283); f.fill();
      }
      f.globalAlpha = 1;
    }
    // lightning in a thunderstorm: the whole scene lights up for a moment
    if (st.storm) {
      if (t > S.nextFlash) { S.flash = 1; S.nextFlash = t + 6 + Math.random() * 16; }
      if (S.flash > 0.01) {
        f.fillStyle = "rgba(230,235,255," + (S.flash * 0.55).toFixed(3) + ")";
        f.fillRect(0, 0, W, H);
        S.flash *= 0.82;
      }
    }
  }

  // ------------------------------------------------------------------ readings
  function fetchJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  function readWeather() {
    var p = S.place && isFinite(S.place.lat) ? S.place : CALGARY;
    if (q("mock") && !q("wxlive")) return;   // previews talk to nobody
    fetchJson("https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
      "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth,is_day&timezone=auto")
      .then(function (j) {
        var c = j && j.current;
        if (!c) return;
        S.extra = { code: c.weather_code, cloud: c.cloud_cover, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, temp: c.temperature_2m, snowDepth: c.snow_depth };
        refresh(true);
      }, function () {});
  }
  function readKp() {
    if (q("mock") && !q("wxlive")) return;
    fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").then(function (j) {
      // a table: the first row names the columns, the last row is the latest three-hour reading
      if (!j || j.length < 2) return;
      var row = j[j.length - 1], kp = parseFloat(Array.isArray(row) ? row[1] : row.Kp);
      if (isFinite(kp)) { S.kp = kp; refresh(true); }
    }, function () {});
  }

  function refresh(force) {
    if (!S.on) return;
    S.st = state();
    var key = buildKey(S.st);
    if (force || key !== S.built) { S.built = key; build(S.st); }
  }

  // ------------------------------------------------------------------ the home's side
  var api = {
    // the two canvases of the scene: the sky (under the clock) and the land (over it)
    mount: function (back, front) {
      if (S.on && S.back === back) return;
      S.back = back; S.front = front;
      back.width = W; back.height = H; front.width = W; front.height = H;
      S.bctx = back.getContext("2d"); S.fctx = front.getContext("2d");
      S.on = true; S.paused = false; S.t0Wall = Date.now(); S.built = "";
      if (!S.stars) makeStars();
      refresh(true);
      // first frame now, so the scene is never blank while it fades in
      S.lastDraw = 0; frame(performance.now());
      S.timers.push(setInterval(function () { refresh(false); }, 60000));
      S.timers.push(setInterval(readWeather, 10 * 60000));
      S.timers.push(setInterval(readKp, 30 * 60000));
      readWeather(); readKp();
    },
    unmount: function () {
      S.on = false;
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = 0;
      S.timers.forEach(clearInterval); S.timers = [];
      S.drops = [];
    },
    pause: function () { S.paused = true; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; },
    resume: function () { if (!S.on) return; S.paused = false; refresh(false); if (!S.raf) S.raf = requestAnimationFrame(frame); },
    // the home's own reading (couch-tv's weather: temp, code, is_day) and its place ({lat, lon})
    setWeather: function (wx, place) {
      S.wx = wx || null;
      var moved = place && (!S.place || S.place.lat !== place.lat || S.place.lon !== place.lon);
      if (place && isFinite(place.lat) && isFinite(place.lon)) S.place = { lat: +place.lat, lon: +place.lon };
      if (moved && S.on) readWeather();
      refresh(false);
    },
    setLighter: function (on) { S.lighter = !!on; },
    setAuroraAlways: function (on) { S.auroraAlways = !!on; refresh(true); },
    // the clock's frosted fill, as a picture URL; the callback hears of each new one
    glassUrl: function () { return S.glass; },
    onGlass: function (cb) { S.glassCb = cb; },
    // for tests and previews
    _state: function () { return S.st; },
    _sunAt: sunAt, _moonAt: moonAt
  };

  root.AlbertaLive = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);

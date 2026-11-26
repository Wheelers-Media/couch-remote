// ---------- live conditions: the real sky over each location, and the real weather ----------
// Sun and moon: calculated here from the date and the place (no network). Weather: Open-Meteo (free, no key),
// every 10 minutes. Aurora: NOAA SWPC's planetary K index (free, no key), every 30 minutes. Nothing is sent
// anywhere but the place's coordinates, and if a reading fails the scene keeps the last one (or calm defaults).

// where each location is, and which way its view faces (compass degrees), so the sun and moon rise and set
// on the right side of the picture
const PLACES = {
  moraine: { lat: 51.322, lon: -116.186, face: 165, fov: 100 },  // Ten Peaks from the rockpile, looking south-east
  rundle:  { lat: 51.233, lon: -115.502, face: 215, fov: 100 },  // Mount Rundle from Two Jack Lake, looking south-west
  peyto:   { lat: 51.718, lon: -116.509, face: 340, fov: 100 },  // down the valley from Bow Summit, looking north
  cabin:   { lat: 50.950, lon: -115.150, face: 250, fov: 100 },  // a cabin in Kananaskis, looking west to the peaks
};
const HOME = { lat: 51.0447, lon: -114.0719 };   // Calgary: where the weather is read

// ---- the sun and the moon (the low-precision formulas of Vladimir Agafonkin's SunCalc, BSD) ----
const RAD = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, OBL = RAD * 23.4397;
const toDays = d => d.valueOf() / 864e5 - 0.5 + J1970 - J2000;
const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
const azOf = (Hh, phi, d) => Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
const altOf = (Hh, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(Hh));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
function sunCoords(d) { const M = RAD * (357.5291 + 0.98560028 * d), L = M + RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + RAD * 102.9372 + Math.PI; return { dec: decOf(L, 0), ra: raOf(L, 0) }; }
function moonCoords(d) { const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d), l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F); return { ra: raOf(l, b), dec: decOf(l, b), dist: 385001 - 20905 * Math.cos(M) }; }
function sunPos(date, lat, lon) { const lw = RAD * -lon, phi = RAD * lat, d = toDays(date), c = sunCoords(d), Hh = sidereal(d, lw) - c.ra; return { az: (azOf(Hh, phi, c.dec) / RAD + 180) % 360, alt: altOf(Hh, phi, c.dec) / RAD }; }
function moonPos(date, lat, lon) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date), c = moonCoords(d), Hh = sidereal(d, lw) - c.ra;
  let h = altOf(Hh, phi, c.dec); h += RAD * 0.017 / Math.tan(h + RAD * 10.26 / (h + RAD * 5.10));
  const s = sunCoords(d), sd = 149598000, ph = Math.acos(Math.sin(s.dec) * Math.sin(c.dec) + Math.cos(s.dec) * Math.cos(c.dec) * Math.cos(s.ra - c.ra));
  const inc = Math.atan2(sd * Math.sin(ph), c.dist - sd * Math.cos(ph));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - c.ra), Math.sin(s.dec) * Math.cos(c.dec) - Math.cos(s.dec) * Math.sin(c.dec) * Math.cos(s.ra - c.ra));
  return { az: (azOf(Hh, phi, c.dec) / RAD + 180) % 360, alt: h / RAD, lit: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
}
// the next full moon after a date (for previews): steps until the phase crosses 0.5
function nextFullMoon(from) { let t = from.valueOf(), prev = moonPos(new Date(t), 51, -114).phase; for (let i = 0; i < 24 * 32; i++) { t += 36e5; const p = moonPos(new Date(t), 51, -114).phase; if (prev < 0.5 && p >= 0.5) return new Date(t); prev = p; } return null; }

// ---- what the weather code means here (WMO codes, as Open-Meteo gives them) ----
function weatherFromCode(c) {
  const o = { rain: 0, snow: 0, fog: 0, storm: 0, cloud: null };
  if (c === 0) o.cloud = 0.03; else if (c === 1) o.cloud = 0.2; else if (c === 2) o.cloud = 0.5; else if (c === 3) o.cloud = 0.95;
  else if (c === 45 || c === 48) { o.fog = 1; o.cloud = 0.9; }
  else if (c >= 51 && c <= 57) { o.rain = c === 51 || c === 56 ? 0.25 : c === 53 ? 0.35 : 0.5; o.cloud = 0.95; }
  else if (c >= 61 && c <= 67) { o.rain = c === 61 || c === 66 ? 0.45 : c === 63 ? 0.7 : 1; o.cloud = 1; }
  else if (c >= 71 && c <= 77) { o.snow = c === 71 ? 0.35 : c === 73 ? 0.65 : c === 77 ? 0.3 : 1; o.cloud = 1; }
  else if (c >= 80 && c <= 82) { o.rain = c === 80 ? 0.5 : c === 81 ? 0.75 : 1; o.cloud = 0.85; }
  else if (c === 85 || c === 86) { o.snow = c === 85 ? 0.55 : 0.95; o.cloud = 0.9; }
  else if (c >= 95) { o.rain = 0.95; o.storm = 1; o.cloud = 1; }
  return o;
}

// ---- the readings, kept between refreshes ----
const LIVE = { wx: null, kp: null, at: 0 };
async function readWeather() {
  if (typeof Q !== 'undefined' && Q.has('offline')) return;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${HOME.lat}&longitude=${HOME.lon}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,snow_depth&timezone=auto`;
    const j = await (await fetch(u)).json(), c = j && j.current;
    if (c) LIVE.wx = { code: c.weather_code, cloud: c.cloud_cover / 100, wind: c.wind_speed_10m, windFrom: c.wind_direction_10m, temp: c.temperature_2m, snowDepth: c.snow_depth };
  } catch (e) { /* keep the last reading */ }
}
async function readKp() {
  if (typeof Q !== 'undefined' && Q.has('offline')) return;
  try {
    const j = await (await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')).json();
    const row = j && j[j.length - 1], kp = parseFloat(Array.isArray(row) ? row[1] : row && row.Kp);
    if (isFinite(kp)) LIVE.kp = kp;
  } catch (e) {}
}

// ---- the conditions for one location at one moment ----
function liveConditions(loc, date) {
  const P = PLACES[loc] || PLACES.moraine, sun = sunPos(date, P.lat, P.lon), moon = moonPos(date, P.lat, P.lon);
  const rel = az => ((az - P.face + 540) % 360) - 180;                  // degrees right of the view's centre
  const wx = LIVE.wx, w = wx ? weatherFromCode(wx.code) : { rain: 0, snow: 0, fog: 0, storm: 0, cloud: null };
  const month = date.getMonth(), day = date.getDate();
  const season = month === 11 || month <= 2 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn';
  // mountain lakes freeze from late November to about mid May
  const frozen = (month === 10 && day > 20) || month === 11 || month <= 3 || (month === 4 && day < 15);
  const cloud = wx && isFinite(wx.cloud) ? Math.max(wx.cloud, w.cloud ?? 0) : (w.cloud ?? 0.25);
  // the wind blows from windFrom: its sideways component across the view sets which way smoke and trees lean
  const windTo = wx ? (wx.windFrom + 180) % 360 : 90, side = Math.sin(rel(windTo) * RAD) < 0 ? -1 : 1;
  // the aurora: only when the K index is high enough at this latitude, on a dark and clear night
  const dark = clamp((-sun.alt - 8) / 8), kp = LIVE.kp, aur = kp == null ? 0 : clamp((kp - 3.5) / 3);
  // the moon: anywhere in the front half of the sky shows, on the correct side, kept in the open part of the frame
  // (between the framing pines); behind the viewer it is out of the picture but still lights the night
  const mRel = rel(moon.az), moonVisible = moon.alt > 0 && Math.abs(mRel) < 100;
  return {
    loc, sunAlt: sun.alt, sunSide: rel(sun.az) < 0 ? -1 : 1,
    moonAlt: moonVisible ? moon.alt : -5, moonX: 0.5 + clamp(mRel / 200, -0.33, 0.33), moonPhase: moon.phase,
    cloud, rain: w.rain, snow: w.snow, fog: w.fog, storm: w.storm,
    wind: wx ? wx.wind : 8, windDir: side, temp: wx ? wx.temp : 0,
    groundSnow: wx && wx.snowDepth != null ? clamp(wx.snowDepth / 0.08) : season === 'winter' ? 0.8 : 0,
    frozen, aurora: aur * dark * (1 - clamp((cloud - 0.3) / 0.5)), season,
    // for the record (shown in previews)
    info: { date: date.toISOString(), sun: sun, moon: moon, kp, wx },
  };
}

#!/usr/bin/env python3
"""Couch TV moving scenes: real photos turned into seamless 3D loops for the Loop look.

For each variant (dawn, day, dusk, night) it takes a 16:9 photo and its sky matte (white = land,
black = sky) and renders a loop where:
  - the land moves by exactly the Loop look's formula (zoom 0.06, sway 0.3), so the home's clock
    cut-out stays locked to the peak and the clock sits behind the mountains;
  - the sky is a separate, farther layer that zooms and sways less, so the skyline has real parallax;
  - coded effects play in the sky (stars, the Milky Way, aurora, sun glow, birds) and on the water.

Everything is a function of loop time t in [0, T), periodic in T, so the last frame flows into the
first. Raw frames go to ffmpeg; finish.sh then makes the Loop look's other files.

    python3 scenes/render.py --variant night --photo night.jpg --matte night-matte.png --out build/
"""
import argparse
import math
import subprocess

import numpy as np
from PIL import Image, ImageFilter

W, H = 1280, 720          # the Loop look's sharp file
FPS = 30
ZOOM, SWAY = 0.06, 0.3    # loop.json: the home moves the cut-out by these
SKY_DEPTH = 0.35          # the sky moves this share of the land's motion (farther away)
TAU = 2 * math.pi


def land_affine(t, T, k, depth=1.0):
    """Inverse affine (output pixel -> source pixel) for the land at loop time t.
    The home maps a neutral-position point p to W/2 + z*(p - W/2) - sway*(z - 1)/2*W*sin(2πt/T)."""
    z = 1 + depth * ZOOM * (1 - math.cos(TAU * t / T)) / 2
    s = math.sin(TAU * t / T)
    dx = SWAY * (z - 1) / 2 * W * s
    # In continuous coordinates (PIL's affine works on pixel centres at i+0.5 on both sides):
    # p = W/2 + (q - W/2 + dx)/z, and the source is the neutral frame scaled by k.
    return (k / z, 0, k * (W / 2 + (dx - W / 2) / z), 0, k / z, k * (H / 2 - H / 2 / z))


def warp(img, t, T, depth=1.0):
    k = img.width / W
    return img.transform((W, H), Image.AFFINE, land_affine(t, T, k, depth), resample=Image.BICUBIC)


def fill_sky_under_land(photo, matte):
    """The sky layer: the photo with the land replaced by the sky colour just above the skyline,
    so the farther-moving sky never shows a hole along the edge."""
    a = np.asarray(photo).astype(np.float32)
    m = np.asarray(matte.convert("L")).astype(np.float32) / 255
    h, w = m.shape
    out = a.copy()
    land = m > 0.5
    for x in range(w):
        col = land[:, x]
        idx = np.argmax(col) if col.any() else h
        src = out[max(0, idx - 6):max(1, idx - 2), x].mean(axis=0) if idx > 3 else out[0, x]
        out[idx:, x][col[idx:]] = src
    img = Image.fromarray(out.clip(0, 255).astype(np.uint8))
    # soften only the filled part
    blur = img.filter(ImageFilter.GaussianBlur(6))
    mm = matte.convert("L").filter(ImageFilter.MaxFilter(9))
    return Image.composite(blur, img, mm)


# ---------- coded effects (all periodic in T) ----------

class Stars:
    def __init__(self, seed, n, bright=1.0, band=None):
        r = np.random.default_rng(seed)
        self.x = r.uniform(0, W, n)
        self.y = r.uniform(0, H * 0.75, n)
        if band is not None:   # crowd them toward the Milky Way's line
            bx0, by0, bx1, by1 = band
            take = r.uniform(0, 1, n) < 0.55
            u = r.uniform(0, 1, n)
            off = r.normal(0, H * 0.06, n)
            nx, ny = -(by1 - by0), bx1 - bx0
            L = math.hypot(nx, ny)
            self.x = np.where(take, bx0 + u * (bx1 - bx0) + off * nx / L, self.x)
            self.y = np.where(take, by0 + u * (by1 - by0) + off * ny / L, self.y)
        self.mag = r.power(4, n) * bright
        self.freq = r.integers(3, 14, n)
        self.phase = r.uniform(0, TAU, n)
        self.size = np.where(r.uniform(0, 1, n) < 0.04, 2, 1)
        tint = r.uniform(0, 1, n)
        self.col = np.stack([0.85 + 0.15 * tint, 0.9 + 0.05 * tint, 1.0 - 0.2 * tint], 1)

    def draw(self, buf, t, T, alpha_mask=None):
        tw = 0.65 + 0.35 * np.sin(TAU * self.freq * t / T + self.phase)
        v = (self.mag * tw)[:, None] * self.col * 255
        xi = self.x.astype(int)
        yi = self.y.astype(int)
        ok = (xi >= 0) & (xi < W - 2) & (yi >= 0) & (yi < H - 2)
        for dy in (0, 1):
            for dx in (0, 1):
                sel = ok & ((self.size == 2) | ((dx == 0) & (dy == 0)))
                np.add.at(buf, (yi[sel] + dy, xi[sel] + dx), v[sel] * (1 if dx == dy == 0 else 0.45))


def milky_way(seed, p0, p1):
    """A soft band of light with dust lanes, made once."""
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    d = ((xx - x0) * (y1 - y0) - (yy - y0) * (x1 - x0)) / L        # distance from the band's line
    u = ((xx - x0) * (x1 - x0) + (yy - y0) * (y1 - y0)) / L / L    # 0..1 along it
    noise = Image.fromarray((r.uniform(0, 255, (H // 24, W // 24))).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    noise = np.asarray(noise.filter(ImageFilter.GaussianBlur(8))).astype(np.float32) / 255
    fine = Image.fromarray((r.uniform(0, 255, (H // 6, W // 6))).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    fine = np.asarray(fine.filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    width = 70 + 40 * np.sin(u * 5.0)
    core = np.exp(-(d / width) ** 2) * (0.55 + 0.45 * np.clip(1 - abs(u - 0.55) * 1.6, 0, 1))
    dust = np.exp(-((d + 12 * np.sin(u * 9)) / 16) ** 2) * (0.5 + 0.5 * noise)
    glow = core * (0.45 + 0.55 * noise) * (0.7 + 0.3 * fine) * (1 - 0.75 * dust)
    col = np.stack([glow * 0.95, glow * 0.85, glow * 1.0], -1)
    warm = np.exp(-((u - 0.6) / 0.18) ** 2)[..., None] * np.stack([glow * 0.35, glow * 0.15, glow * 0], -1)
    return (col + warm) * 120


class Aurora:
    """Curtains of light: rays along a wavy line, drawn small and blurred, then scaled up."""
    def __init__(self, seed, base_y, height, curtains=3):
        r = np.random.default_rng(seed)
        self.c = []
        for i in range(curtains):
            self.c.append(dict(
                y=base_y + r.uniform(-0.06, 0.06) * H,
                h=height * r.uniform(0.7, 1.2),
                k=[(int(r.integers(1, 4)), r.uniform(10, 40), r.uniform(0, TAU), int(r.integers(1, 3)) * (1 if r.uniform() < .5 else -1)) for _ in range(3)],
                amp=r.uniform(0.6, 1.0),
                phase=r.uniform(0, TAU),
            ))
        self.sw, self.sh = W // 4, H // 4
        xs = np.arange(self.sw) * 4.0
        self.xs = xs
        self.rays = np.random.default_rng(seed + 7).uniform(0.4, 1, self.sw)
        self.rayf = np.random.default_rng(seed + 8).integers(2, 7, self.sw)
        self.rayp = np.random.default_rng(seed + 9).uniform(0, TAU, self.sw)

    def draw(self, t, T):
        sw, sh = self.sw, self.sh
        out = np.zeros((sh, sw, 3), np.float32)
        yy = np.arange(sh)[:, None] * 4.0
        ph = TAU * t / T
        for c in self.c:
            yb = np.full(sw, c["y"])
            for (m, a, p, s) in c["k"]:
                yb = yb + a * np.sin(TAU * m * self.xs / W + p + s * ph)
            bright = c["amp"] * (0.55 + 0.45 * np.sin(TAU * self.xs / W * 2 + c["phase"] + ph)) ** 2
            ray = self.rays * (0.6 + 0.4 * np.sin(self.rayf * ph + self.rayp))
            hh = c["h"] * (0.8 + 0.2 * np.sin(TAU * self.xs / W * 3 + ph + c["phase"]))
            up = (yb[None, :] - yy) / hh[None, :]          # 0 at the base, 1 at the top
            below = (yy - yb[None, :]) / 10
            prof = np.where(up >= 0, np.exp(-up * 2.2) * (up < 1.4), np.exp(-below ** 2))
            I = prof * (bright * ray)[None, :]
            green = np.stack([I * 0.15, I * 1.0, I * 0.55], -1)
            top = np.clip(up, 0, 1.4)[..., None] * np.stack([I * 0.55, I * 0.0, I * 0.45], -1) * (up >= 0.45)[..., None]
            out += green + top * 0.8
        img = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
        return np.asarray(img.resize((W, H), Image.BICUBIC)).astype(np.float32)


class Birds:
    def __init__(self, seed, n, y, span, crossings=1, size=1.0, start=0.0):
        r = np.random.default_rng(seed)
        self.dx = r.normal(0, 40, n); self.dy = r.normal(0, 18, n)
        self.flap = r.integers(40, 60, n); self.fp = r.uniform(0, TAU, n)
        self.y, self.span, self.cross, self.size, self.start = y, span, crossings, size, start

    def draw(self, buf, t, T, color=(20, 16, 22)):
        from PIL import ImageDraw
        img = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(img)
        u = ((t / T) * self.cross + self.start) % 1
        x0 = -200 + u * (W + 400)
        if not (-150 < x0 < W + 150):
            return
        for i in range(len(self.dx)):
            x = x0 + self.dx[i]; y = self.y + self.dy[i] + 6 * math.sin(TAU * u * 2 + i)
            f = math.sin(TAU * self.flap[i] * t / T + self.fp[i])
            s = 7 * self.size
            d.line([(x - s, y - f * s * 0.6), (x, y), (x + s, y - f * s * 0.6)], fill=255, width=2)
        a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)[..., None] / 255
        buf[:] = buf * (1 - a * 0.85) + np.array(color, np.float32) * a * 0.85


def water_ripple(frame, water, t, T, strength=2.2):
    """Small horizontal ripples on the water only (periodic in T)."""
    if water is None:
        return frame
    ys = np.arange(H)
    sh = (strength * np.sin(ys * 0.9 + TAU * 9 * t / T) + strength * 0.6 * np.sin(ys * 0.37 - TAU * 5 * t / T))
    xs = (np.arange(W)[None, :] + sh[:, None]).clip(0, W - 1)
    x0 = np.floor(xs).astype(int); fx = (xs - x0)[..., None]; x1 = np.minimum(x0 + 1, W - 1)
    rows = ys[:, None]
    rip = frame[rows, x0] * (1 - fx) + frame[rows, x1] * fx
    return frame * (1 - water) + rip * water


class Sunset:
    """A coded Banff sunset: the gradient, a sun sinking behind the treeline, streaks of cloud lit from
    below drifting across, and the first faint stars at the top."""
    def __init__(self, seed, yh, sun_x):
        self.yh, self.sun_x = yh, sun_x
        y = np.linspace(0, 1, H)[:, None]
        r = np.clip(y / max(yh, 1e-3), 0, 1.2)        # 0 at the top, 1 at the horizon
        stops = [(0.0, (34, 36, 86)), (0.35, (92, 58, 120)), (0.62, (214, 96, 112)), (0.82, (250, 150, 80)), (1.0, (255, 206, 128)), (1.2, (255, 220, 150))]
        g = np.zeros((H, 1, 3), np.float32)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            m = (r >= p0) & (r <= p1)
            f = ((r - p0) / (p1 - p0))[..., None]
            g = np.where(m[..., None], np.array(c0) * (1 - f) + np.array(c1) * f, g)
        self.base = g * np.ones((1, W, 1), np.float32)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.hypot(xx - sun_x * W, (yy - yh * H) * 1.4)
        self.glow = (np.exp(-d / 260)[..., None] * np.array([255, 170, 90]) * 0.55 + np.exp(-d / 60)[..., None] * np.array([255, 230, 170]) * 0.9).astype(np.float32)
        self.disc = (np.clip(1 - (d - 26) / 3, 0, 1))[..., None].astype(np.float32)
        rr = np.random.default_rng(seed)
        self.clouds = [dict(x=rr.uniform(0, 1), y=rr.uniform(0.25, 0.85) * yh, w=rr.uniform(0.12, 0.35), h=rr.uniform(0.006, 0.02),
                            m=int(rr.integers(1, 3)), a=rr.uniform(0.35, 0.8)) for _ in range(16)]
        self.stars = Stars(seed + 1, 260, 0.5)
        self.top = np.clip(1 - y / (0.3 * yh), 0, 1)[..., None].astype(np.float32)

    def draw(self, t, T):
        from PIL import ImageDraw
        sky = self.base.copy()
        breath = 0.85 + 0.15 * math.sin(TAU * t / T)
        sky += self.glow * breath
        sky = sky * (1 - self.disc) + np.array([255, 236, 200], np.float32) * self.disc
        st = np.zeros_like(sky)
        self.stars.draw(st, t, T)
        sky += st * self.top
        sw, sh = W // 4, H // 4
        lit = Image.new("L", (sw, sh)); dark = Image.new("L", (sw, sh))
        dl, dd = ImageDraw.Draw(lit), ImageDraw.Draw(dark)
        for c in self.clouds:
            P = 1 + c["w"] + 0.1
            x = ((c["x"] + c["m"] * P * t / T) % P - c["w"] - 0.05) * sw
            y = c["y"] * sh; w = c["w"] * sw; h = max(1.5, c["h"] * H / 4)
            dl.ellipse([x, y, x + w, y + h], fill=int(255 * c["a"]))
            dd.ellipse([x + w * 0.05, y - h * 0.6, x + w * 0.95, y + h * 0.3], fill=int(255 * c["a"] * 0.8))
        lit = np.asarray(lit.filter(ImageFilter.GaussianBlur(2)).resize((W, H), Image.BICUBIC)).astype(np.float32)[..., None] / 255
        dark = np.asarray(dark.filter(ImageFilter.GaussianBlur(2)).resize((W, H), Image.BICUBIC)).astype(np.float32)[..., None] / 255
        y = np.linspace(0, 1, H)[:, None, None] / max(self.yh, 1e-3)
        litc = np.array([255, 150, 120], np.float32) * (0.6 + 0.4 * np.clip(y, 0, 1))
        sky = sky * (1 - dark * 0.55) + np.array([70, 44, 86], np.float32) * dark * 0.55
        sky = sky * (1 - lit * 0.7) + litc * lit * 0.7
        return sky


# ---------- the four variants ----------

def make_variant(name, photo, matte, T):
    """Returns a frame(t) function."""
    photo = photo.convert("RGB")
    matte = matte.convert("L")
    mt = np.asarray(matte.resize((W, H), Image.BILINEAR)).astype(np.float32) / 255
    # the fg rectangle the home covers with the still cut-out: effects stay out of it on the land
    rect = np.zeros((H, W), np.float32)
    rect[108 - 30:108 + 212 + 30, 320 - 30:320 + 640 + 30] = 1
    rect = np.asarray(Image.fromarray((rect * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))).astype(np.float32) / 255

    # water: turquoise/blue, low saturation edges excluded, below the skyline
    small = np.asarray(photo.resize((W, H), Image.BILINEAR).convert("HSV")).astype(np.float32)
    hue, sat, val = small[..., 0] * 360 / 255, small[..., 1] / 255, small[..., 2] / 255
    water = ((hue > 165) & (hue < 215) & (sat > 0.28) & (val > 0.25)).astype(np.float32) * (mt > 0.9)
    water[: int(H * 0.45)] = 0
    water = np.asarray(Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
    water = (water * (1 - rect))[..., None] if water.mean() > 0.01 else None

    sky_src = fill_sky_under_land(photo, matte)
    night = name == "night"
    if night:
        stars = Stars(11, 2600, 0.9, band=(W * 0.08, H * 0.02, W * 0.92, H * 0.62))
        mw = milky_way(5, (W * 0.08, H * 0.02), (W * 0.92, H * 0.62))
        aur = Aurora(21, H * 0.34, H * 0.30)
        yy = np.linspace(0, 1, H)[:, None, None]
        sky_base = (np.array([6, 9, 22]) * (1 - yy) + np.array([14, 32, 48]) * yy).astype(np.float32) * np.ones((1, W, 1))
        # land by moonlight: darker, cooler, a little desaturated
        a = np.asarray(photo).astype(np.float32)
        g = a.mean(-1, keepdims=True)
        a = (a * 0.5 + g * 0.5) * np.array([0.55, 0.66, 0.92]) * 0.62
        a = 255 * (a / 255) ** 1.15
        land_src = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    elif name == "dusk":
        cols = mt > 0.5
        first = np.where(cols.any(0), cols.argmax(0), H)
        yh = float(np.median(first)) / H
        sunset = Sunset(31, yh, 0.16)
        a = np.asarray(photo).astype(np.float32)
        lum = a.mean(-1, keepdims=True)
        hi = np.clip((lum - 150) / 90, 0, 1)
        lo = np.clip((110 - lum) / 110, 0, 1)
        a = a * np.array([0.92, 0.72, 0.66]) * 0.86 + hi * np.array([62, 18, 26])   # alpenglow on the snow
        a = a * (1 - lo * 0.35) + lo * np.array([18, 6, 34]) * 0.35                   # violet shadows
        land_src = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        # where the photo's lake reflects sky: blue, below the shoreline
        refl = ((hue > 185) & (hue < 240) & (sat > 0.18) & (val > 0.35)).astype(np.float32) * (mt > 0.9)
        rows = refl.mean(1)
        below = np.arange(H) > yh * H
        cand = np.where(below & (rows > 0.25))[0]
        shore = int(cand[0]) if len(cand) else int(yh * H)
        refl[:shore] = 0
        refl = np.asarray(Image.fromarray((refl * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
        refl_img = Image.fromarray((refl * 255).astype(np.uint8))
        if water is None:
            water = (refl * (1 - rect))[..., None]
        else:
            water = np.maximum(water, (refl * (1 - rect))[..., None])
        land_src = land_src
    else:
        land_src = photo
    if name == "dawn":
        birds = Birds(3, 7, H * 0.2, 0, 1, 0.9, 0.15)
    elif name == "dusk":
        birds = Birds(4, 9, H * 0.16, 0, 1, 0.8, 0.55)
    else:
        birds = None
    shooting = [(0.18, 0.12, 0.3), (0.63, 0.55, 0.12)]   # (time share, x share, y share)

    def frame(t):
        land = np.asarray(warp(land_src, t, T)).astype(np.float32)
        m = np.asarray(warp(matte, t, T)).astype(np.float32)[..., None] / 255
        if night:
            # the sky drifts on its own, farther: stars and the band shift by the sky's own motion
            sky = sky_base.copy()
            zs = 1 + SKY_DEPTH * ZOOM * (1 - math.cos(TAU * t / T)) / 2
            ox = -SWAY * (zs - 1) / 2 * W * math.sin(TAU * t / T)
            mwi = Image.fromarray(np.clip(mw, 0, 255).astype(np.uint8))
            mwi = mwi.transform((W, H), Image.AFFINE, (1 / zs, 0, W / 2 - (W / 2 - ox) / zs, 0, 1 / zs, H / 2 - H / 2 / zs), resample=Image.BILINEAR)
            sky += np.asarray(mwi).astype(np.float32)
            stars.draw(sky, t, T)
            for (ts, xs, ys) in shooting:
                u = ((t / T - ts) % 1) * T
                if u < 1.1:
                    x = xs * W + u * 520; y = ys * H + u * 190
                    from PIL import ImageDraw
                    im = Image.new("L", (W, H)); dd = ImageDraw.Draw(im)
                    for j in range(14):
                        dd.line([(x - j * 9, y - j * 3.3), (x - (j + 1) * 9, y - (j + 1) * 3.3)], fill=int(255 * (1 - j / 14) * math.sin(math.pi * u / 1.1)), width=2)
                    sky += np.asarray(im).astype(np.float32)[..., None] * np.array([0.9, 0.95, 1.0])
            aur_l = aur.draw(t, T)
            sky = sky + aur_l * 0.9
            # the aurora lights the snow a little, outside the clock's cut-out
            glow = aur_l[int(H * 0.30):int(H * 0.45)].mean((0, 1)) / 255
            land = land + (m * (1 - rect[..., None])) * glow * 70 * (np.asarray(land_src.resize((W, H))).astype(np.float32).mean(-1, keepdims=True) / 255) * (1 - (np.arange(H) / H)[:, None, None] * 0.3)
        elif name == "dusk":
            sky = sunset.draw(t, T)
            if birds is not None:
                birds.draw(sky, t, T)
            # the coded sky mirrored in the lake, about the shoreline where the land has moved it
            z = 1 + ZOOM * (1 - math.cos(TAU * t / T)) / 2
            s_y = H / 2 + z * (shore - H / 2)
            ys = np.clip((2 * s_y - np.arange(H)).astype(int), 0, H - 1)
            mirrored = sky[ys] * np.array([0.78, 0.74, 0.8], np.float32)
            r = np.asarray(warp(refl_img, t, T)).astype(np.float32)[..., None] / 255 * 0.85
            land = land * (1 - r * (1 - rect[..., None])) + mirrored * r * (1 - rect[..., None])
        else:
            sky = np.asarray(warp(sky_src, t, T, SKY_DEPTH)).astype(np.float32)
            if name == "dawn":
                # a slow breathing glow along the horizon
                yy = np.linspace(0, 1, H)[:, None, None]
                br = 0.5 + 0.5 * math.sin(TAU * t / T * 2)
                warm = np.array([255, 150, 80] if name == "dusk" else [255, 170, 120], np.float32)
                sky = sky + warm * np.exp(-((yy - 0.38) / 0.16) ** 2) * (0.06 + 0.05 * br)
            if birds is not None:
                birds.draw(sky, t, T)
        out = sky * (1 - m) + land * m
        out = water_ripple(out, water, t, T)
        return np.clip(out, 0, 255).astype(np.uint8)

    return frame


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", required=True, choices=["dawn", "day", "dusk", "night"])
    ap.add_argument("--photo", required=True)
    ap.add_argument("--matte", required=True)
    ap.add_argument("--seconds", type=int, default=34)
    ap.add_argument("--out", required=True, help="the raw-quality master .mp4 (finish.sh makes the rest)")
    ap.add_argument("--preview", help="write one frame at this loop time (seconds) as a PNG and stop")
    a = ap.parse_args()
    photo = Image.open(a.photo); matte = Image.open(a.matte)
    fr = make_variant(a.variant, photo, matte, a.seconds)
    if a.preview is not None:
        for i, tt in enumerate(a.preview.split(",")):
            Image.fromarray(fr(float(tt))).save(a.out.replace(".mp4", f"-p{i}.png"))
        return
    N = FPS * a.seconds
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10",
                          "-pix_fmt", "yuv444p", a.out], stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(fr(i / FPS).tobytes())
        if i % 150 == 0:
            print(a.variant, i, "/", N, flush=True)
    p.stdin.close(); p.wait()


if __name__ == "__main__":
    main()

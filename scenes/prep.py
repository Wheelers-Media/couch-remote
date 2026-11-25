#!/usr/bin/env python3
"""Frame a 16:9 photo for the Loop look's clock: move the skyline down by --drop (a share of the
height) so the peaks cross the lower part of the clock's digits (about y 231-405 of 1080), filling
the new strip at the top with the photo's own sky carried upward, and do the same to its matte.

    python3 scenes/prep.py photo-169.jpg scene-fg.webp --drop 0.15 --out prepped/day
writes prepped/day.jpg (2560x1440) and prepped/day-matte.png (white = land, 2560x1440).
"""
import argparse

import numpy as np
from PIL import Image, ImageFilter

PW, PH = 2560, 1440


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo"); ap.add_argument("fg", help="make-scene.py's scene-ID-fg.webp (alpha = land)")
    ap.add_argument("--drop", type=float, default=0.0)
    ap.add_argument("--darken", type=float, default=0.3, help="how much deeper the carried sky gets toward the top")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    photo = np.asarray(Image.open(a.photo).convert("RGB").resize((PW, PH), Image.LANCZOS)).astype(np.float32)
    alpha = np.asarray(Image.open(a.fg).convert("RGBA").getchannel("A").resize((PW, PH), Image.LANCZOS)).astype(np.float32) / 255
    d = int(round(a.drop * PH))
    if d > 0:
        sky = alpha < 0.05
        # the clear-sky colour near the top: sky pixels, without clouds (bright and grey), averaged
        # over the whole width so nothing streaks upward
        band = photo[:120]
        mx, mn = band.max(-1), band.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1)
        bmask = (sky[:120] & (sat > 0.25))[..., None]
        if bmask.sum() < 500:
            bmask = sky[:120][..., None]
        if bmask.sum() < 500:
            bmask = np.ones_like(bmask)
        clear = (band * bmask).sum((0, 1)) / bmask.sum()
        top = np.ones((PW, 3), np.float32) * clear
        g = np.linspace(1, 0, d)[:, None, None]          # 1 at the very top, 0 where the photo starts
        deep = top[None] * (1 - a.darken * g) - np.array([10, 6, 0]) * g
        strip = deep * np.ones((d, 1, 1))
        # a little grain so the carried sky matches the photo's
        strip += np.random.default_rng(1).normal(0, 1.2, strip.shape)
        # blend the photo's first 30 sky rows into the carried colour, so there is no line at the seam
        s = np.clip(np.arange(PH) / 160.0, 0, 1)[:, None, None]
        skyw = (alpha < 0.05)[..., None]
        photo = np.where(skyw, photo * s + top[None] * (1 - s), photo)
        photo = np.concatenate([strip, photo], 0)[:PH]
        alpha = np.concatenate([np.zeros((d, PW)), alpha], 0)[:PH]
    Image.fromarray(np.clip(photo, 0, 255).astype(np.uint8)).save(a.out + ".jpg", quality=95)
    Image.fromarray(np.clip(alpha * 255, 0, 255).astype(np.uint8)).save(a.out + "-matte.png")


if __name__ == "__main__":
    main()

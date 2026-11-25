#!/bin/bash
# Rebuild all four scenes from the photos in CREDITS.md, with the exact settings used.
#
#   scenes/make-all.sh <photos dir> <couch-tv checkout> [build dir]
#
# <photos dir> holds dawn.jpg, day.jpg, dusk.jpg and night.jpg: the 3840 px copies of the four
# Wikimedia Commons photos in CREDITS.md. Writes the Loop look's files to scenes/loop/.
# Needs python3 with numpy, Pillow, scipy and pymatting, and ffmpeg 7.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
P="$1"; CTV="$2"; B="${3:-build/scenes}"
mkdir -p "$B"
SECONDS_LEN=34

# 1. a 16:9 band of each photo at 2560x1440: name, top share (taller photos) or the panorama's
#    crop (height share from the top, sideways shift as a share of the crop's width)
python3 - "$P" "$B" <<'EOF'
import sys
from PIL import Image
P, B = sys.argv[1], sys.argv[2]
def band(name, top=0.5, pano=None):
    im = Image.open(f"{P}/{name}.jpg").convert("RGB"); w, h = im.size
    if pano:
        t0, share, shift = pano
        ch = int(h * share); cw = round(ch * 16 / 9); l = int((w - cw) * 0.5 + cw * shift); t = int(h * t0)
        im = im.crop((l, t, l + cw, t + ch))
    elif w / h > 16 / 9:
        cw = round(h * 16 / 9); l = (w - cw) // 2; im = im.crop((l, 0, l + cw, h))
    else:
        ch = round(w * 9 / 16); t = int((h - ch) * top); im = im.crop((0, t, w, t + ch))
    im.resize((2560, 1440), Image.LANCZOS).save(f"{B}/{name}-169.jpg", quality=95)
band("dawn", top=0.0)
band("day", top=0.5)
band("dusk", top=0.35)
band("night", pano=(0.2, 0.8, 0.15))
EOF

# 2. the sky cut-out, with couch-tv's own tool (scene ids may not be built-in names, hence the x)
MS="$CTV/tv-home/tools/make-scene.py"
python3 "$MS" "$B/dawn-169.jpg" dawnx --depth --smooth 4 --floor 0.6 --out "$B/dawn-scene"
python3 "$MS" "$B/day-169.jpg" dayx --depth --smooth 4 --paint 60 --floor 0.5 --out "$B/day-scene"
python3 "$MS" "$B/dusk-169.jpg" duskx --depth --out "$B/dusk-scene"
python3 "$MS" "$B/night-169.jpg" nightx --depth --step 5 --far 28 --floor 0.6 --out "$B/night-scene"

# 3. the skyline moved down so the peaks cross the bottom of the clock's digits
python3 "$HERE/prep.py" "$B/dawn-169.jpg" "$B/dawn-scene/scene-dawnx-fg.webp" --drop 0.12 --out "$B/dawn"
python3 "$HERE/prep.py" "$B/day-169.jpg" "$B/day-scene/scene-dayx-fg.webp" --drop 0.19 --out "$B/day"
python3 "$HERE/prep.py" "$B/dusk-169.jpg" "$B/dusk-scene/scene-duskx-fg.webp" --drop 0.09 --out "$B/dusk"
python3 "$HERE/prep.py" "$B/night-169.jpg" "$B/night-scene/scene-nightx-fg.webp" --drop 0.05 --out "$B/night"

# 4. the loops, in parallel (about 5 minutes each on one core)
for v in dawn day night; do
  python3 "$HERE/render.py" --variant $v --photo "$B/$v.jpg" --matte "$B/$v-matte.png" --seconds $SECONDS_LEN --out "$B/$v-master.mp4" &
done
python3 "$HERE/render.py" --variant dusk --photo "$B/dusk.jpg" --matte "$B/dusk-matte.png" --shore 0.62 --seconds $SECONDS_LEN --out "$B/dusk-master.mp4" &
wait

# 5. the Loop look's files
"$HERE/finish.sh" "$B" "$HERE/loop" $SECONDS_LEN

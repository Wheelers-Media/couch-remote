#!/bin/bash
# Turn rendered masters into the Loop look's files, the way couch-tv's scripts/make-loop.sh makes them
# for a photo with --matte (docs/LOOP.md): same encodes, same colour tags, same cut-out formula.
#
#   scenes/finish.sh <build dir> <out dir> <seconds>
#
# <build dir> holds, per variant: <variant>-master.mp4 (from render.py) and <variant>-matte.png
# (white = land, from prep.py). The masters are already seamless loops (every motion in render.py is
# periodic in the loop's length), so no xfade: frame N-1 flows into frame 0 on its own.
set -eu
B="$1"; OUT="$2"; L="$3"
mkdir -p "$OUT"
TO709="scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"
TAGS709="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
POSTER_VF="in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc,format=yuvj420p"
FG_X=480; FG_Y=162; FG_W=960; FG_H=318
FX=$((FG_X * 2 / 3)); FY=$((FG_Y * 2 / 3)); FW=$((FG_W * 2 / 3)); FH=$((FG_H * 2 / 3))
FEATHER=24
INK_R=11; INK_G=10; INK_B=16
SCRIM_TOP="0:0.66 28:0.56 37:0.20 43:0"
SCRIM_BOTTOM="44:0 55:0.55 64:0.74 76:0.84 100:0.84"
ramp() {
  printf '%s\n' "$1" | awk '{
    n = split($0, s, " ")
    for (i = 1; i <= n; i++) { split(s[i], kv, ":"); p[i] = kv[1] * 10.8; v[i] = kv[2] + 0 }
    e = sprintf("%g", v[n])
    for (i = n - 1; i >= 1; i--)
      e = sprintf("if(lt(ld(0),%g),%g+(%g)*(ld(0)-%g)/%g,%s)", p[i + 1], v[i], v[i + 1] - v[i], p[i], p[i + 1] - p[i], e)
    printf "if(lt(ld(0),%g),%g,%s)\n", p[1], v[1], e
  }'
}
scrim_channel() {
  echo "st(0,(Y+${FY})*1.5+0.75);st(1,$(ramp "$SCRIM_TOP"));st(2,$(ramp "$SCRIM_BOTTOM"));st(3,1-(1-ld(1))*(1-ld(2)));$1(X,Y)*(1-ld(3))+$2*ld(3)+0.5"
}
for v in dawn day dusk night; do
  [ -f "$B/$v-master.mp4" ] || { echo "skip $v (no master)"; continue; }
  sharp="$OUT/$v.mp4"; blur="$OUT/$v-blur.mp4"
  ffmpeg -hide_banner -loglevel error -y -i "$B/$v-master.mp4" -vf "${TO709},trim=duration=${L},setpts=PTS-STARTPTS" \
    -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p -preset slow -crf 20 \
    -maxrate 4M -bufsize 8M -r 30 -g 30 -keyint_min 30 -sc_threshold 0 $TAGS709 -an -movflags +faststart "$sharp"
  ffmpeg -hide_banner -loglevel error -y -i "$sharp" -vf "scale=160:90,gblur=sigma=2,fps=10" \
    -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p -preset slow -crf 26 \
    -maxrate 300k -bufsize 600k -r 10 -g 10 -keyint_min 10 -sc_threshold 0 $TAGS709 -an -movflags +faststart "$blur"
  ffmpeg -hide_banner -loglevel error -y -i "$sharp" -frames:v 1 -vf "scale=960:540:${POSTER_VF}" -q:v 3 "$OUT/$v.jpg"
  ffmpeg -hide_banner -loglevel error -y -i "$blur" -frames:v 1 -vf "scale=960:540:flags=lanczos:${POSTER_VF}" -q:v 3 "$OUT/$v-blur.jpg"
  # the matte as an image with transparency (alpha = land), the shape make-loop.sh's --matte takes
  ffmpeg -hide_banner -loglevel error -y -i "$B/$v-matte.png" -vf "format=gray,scale=1280:720:flags=area" -f rawvideo -pix_fmt gray - \
    | ffmpeg -hide_banner -loglevel error -y -f rawvideo -pix_fmt gray -s 1280x720 -i - -f lavfi -i "color=white:s=1280x720" \
      -filter_complex "[1:v][0:v]alphamerge,format=rgba" -frames:v 1 "$B/$v-matte-rgba.png"
  crop="crop=${FW}:${FH}:${FX}:${FY}"
  fgraph="[0:v]trim=end_frame=1,scale=in_color_matrix=bt709:in_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,format=gbrp,${crop},"
  fgraph="${fgraph}geq=r='$(scrim_channel r "$INK_R")':g='$(scrim_channel g "$INK_G")':b='$(scrim_channel b "$INK_B")',format=gbrap[c];"
  fgraph="${fgraph}[1:v]scale=1280:720:force_original_aspect_ratio=increase:flags=area,format=yuva444p,crop=1280:720,${crop},alphaextract,"
  fgraph="${fgraph}geq=lum='p(X,Y)*min(1,min(min(X+0.5,W-X-0.5),min(Y+0.5,H-Y-0.5))/${FEATHER})+0.5'[m];"
  fgraph="${fgraph}[c][m]alphamerge,format=rgba[fg]"
  ffmpeg -hide_banner -loglevel error -y -i "$sharp" -i "$B/$v-matte-rgba.png" -filter_complex "$fgraph" -map "[fg]" -frames:v 1 "$OUT/$v-fg.png"
  echo "$v: $(du -h "$sharp" | cut -f1) sharp, $(du -h "$blur" | cut -f1) glass"
done
printf '{"still": true, "seconds": %d, "fps": 30, "zoom": 0.06, "sway": 0.3, "fg": {"x": %d, "y": %d, "w": %d, "h": %d}}\n' \
  "$L" "$FG_X" "$FG_Y" "$FG_W" "$FG_H" > "$OUT/loop.json"
echo "done: $(ls "$OUT" | wc -l | tr -d ' ') files in $OUT"

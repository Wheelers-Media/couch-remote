# Alberta moving scenes for Couch TV's Loop look

Four real Alberta Rockies photos turned into seamless 3D loops for Couch TV's **Loop look**. Couch
TV picks one by the sun: dawn, day, dusk and night. The clock sits **behind the mountains**: the home
moves its cut-out of each peak by the same formula the land moves by, so the two stay locked.

| Variant | Photo | What is coded on top |
|---|---|---|
| dawn | Moraine Lake sunrise, the Ten Peaks in alpenglow | the sky on its own, farther layer (parallax), a breathing warm glow, a flock of birds, ripples on the lake |
| day | Peyto Lake in summer | sky parallax, ripples on the turquoise water |
| dusk | Mount Rundle over Two Jack Lake | a coded sunset sky: the gradient, a sinking sun, drifting cloud streaks lit from below, the first stars, birds, and all of it mirrored in the lake; alpenglow on the snow |
| night | Peyto Lake in winter, by moonlight | a coded night sky: the Milky Way, about 2,600 twinkling stars, shooting stars, a moving aurora (green curtains with violet tops) that lights the snow |

Each loop is 34 s at 30 fps and plays on from its last frame to its first with no seam, because
every motion is a whole number of cycles per loop.

## Put them on the TV

The files go in `tv-home/web/loop/` on the computer that runs the couch-tv bridge (the Samsung
streams them from there). On that computer:

```sh
git clone --depth 1 -b ccr-2623e368-ljklg2 https://github.com/wheelers-media/couch-remote /tmp/couch-scenes
mkdir -p ~/couch-tv/tv-home/web/loop          # use the path of your couch-tv checkout
cp /tmp/couch-scenes/scenes/loop/* ~/couch-tv/tv-home/web/loop/
```

No restart: the bridge lists the folder afresh. Then on the TV: **Home settings → Look**, pick
**Loop**. For the time-of-day switch, turn on **Follow the sun** (Look → Scenes) and set **Location**
to Calgary, because the home works out the sun from it.

## Make them again

```sh
pip install numpy Pillow scipy pymatting
# 1. the sky cut-out, with couch-tv's own tool, on a 16:9 copy of the photo
python3 couch-tv/tv-home/tools/make-scene.py photo-169.jpg day --depth --smooth 4 --paint 60 --floor 0.5 --out build/day
# 2. move the skyline down so the peaks cross the bottom of the clock, carrying the sky up
python3 scenes/prep.py photo-169.jpg build/day/scene-day-fg.webp --drop 0.19 --out build/day
# 3. render the loop (about 5 minutes on 4 cores)
python3 scenes/render.py --variant day --photo build/day.jpg --matte build/day-matte.png --out build/day-master.mp4
# 4. the Loop look's files, made the way couch-tv's scripts/make-loop.sh makes them
scenes/finish.sh build scenes/loop 34
```

`render.py --preview 0,8.5,17` writes still frames to check first.

See [CREDITS.md](CREDITS.md) for the photos and their licences.

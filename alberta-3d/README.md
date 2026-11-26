# Alberta Live 3D (prototype)

A real 3D version in three.js (from the animation skill pack's engine): flat-shaded Rockies, instanced
spruce forests, a reflecting lake, a cabin with lit windows and chimney smoke, sky with sun, moon and
stars, snow and rain, and a camera that flies between the trees. Fog in the sky's horizon colour gives
the layered, poster-like depth.

    cd alberta-3d && python3 -m http.server 8765
    open http://localhost:8765/index.html?loc=cabin&alt=-20&malt=25
    node stills.mjs "name|loc=moraine&alt=2&push=0.15"     (server running)  -> out/name.jpg
    node clip.mjs "loc=moraine&alt=2&speed=7.5" 12 12 out/clip.mp4

Same conditions in the address as `alberta-live/` (alt, az, malt, maz, phase, cloud, rain, snow, fog,
wind, gsnow, frozen, season, loc: moraine | rundle | peyto | cabin).

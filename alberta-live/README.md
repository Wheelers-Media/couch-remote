# Alberta Live: painted Rockies that follow the real sky and weather

Built on the "cinematic" painting kit (brush-stroke skies, gouache regions, cumulus, paper texture),
plus a Rockies kit in `src/05_alpine.js` (painted mountains with snow and shadow faces, spruces, a
mirror lake, a log cabin) and the live scene in `src/10_live.js`.

Four locations: `moraine`, `rundle`, `peyto`, `cabin` (Kananaskis). The painting is made once for the
current conditions (about a second), then the clouds drift with the wind, stars twinkle, the aurora
moves, the water glints, smoke rises from the cabin, and rain or snow falls, every frame.

    node build.mjs                                   -> build/alberta-live.html
    node stills.mjs "name|loc=cabin&alt=-20&malt=25" -> build/stills/name.jpg

Conditions in the address (the live version will fill these from Calgary's real sky and weather):
`alt` sun height in degrees, `side` -1 sun on the left / 1 right, `malt` moon height, `mx` moon across
(0..1), `phase` moon phase (0 new, 0.5 full), `cloud`, `rain`, `snow`, `fog`, `storm`, `aurora` (0..1),
`wind` km/h, `wdir` -1/1, `temp` C, `gsnow` snow on the ground (0..1), `frozen` 1, `season`.

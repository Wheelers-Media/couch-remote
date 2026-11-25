# Alberta Live (work in progress)

A live, all-code scene for Couch TV: real 3D Rockies rendered in a WebGL shader (raymarched
terrain, lakes with true reflections, forests, a cabin, sky, clouds, snow), painted with a Kuwahara
brush filter, and driven by Calgary's real sun, moon and weather. Not wired into Couch TV yet.

- `alberta-shader.js`: the GLSL (scene, brushwork, depth-layer split for the clock).
- `alberta-live.js`: the earlier 2D version of the live engine (astronomy, Open-Meteo weather,
  NOAA aurora, rain/snow/fog/smoke overlays), which the 3D renderer will plug into.
- `test-render.html`: renders one location in a browser. Put it next to `alberta-shader.js` and
  open `test-render.html?loc=moraine&alt=18&rel=-50` (`loc`: moraine, rundle, peyto, cabin; `alt`:
  sun height in degrees; `cloud`, `snow`, `fog`, `frozen` 0 to 1).

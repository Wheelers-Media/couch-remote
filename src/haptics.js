// A short buzz on the keys, where the phone allows it (iOS Safari ignores vibrate, silently).
export function tick(ms = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch { /* not supported */ }
}

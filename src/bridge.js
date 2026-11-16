// Every call goes to the bridge this phone was pointed at: http://<computer>:5400 on the same
// Wi-Fi, or an HTTPS tunnel when the phone is out. The address and pairing key live in
// localStorage, so the same build works on Vercel, on a LAN address, and behind a tunnel.

const BASE = 'couch.bridge';
const KEY = 'couch.key';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } };

export const bridgeUrl = () => (read(BASE) || '').replace(/\/+$/, '');
export const setBridgeUrl = (url) => write(BASE, (url || '').trim().replace(/\/+$/, ''));
export const pairingKey = () => read(KEY) || '';
export const setPairingKey = (key) => write(KEY, (key || '').trim());

export class BridgeError extends Error {
  constructor(message, status = 0, key = null) {
    super(message);
    this.status = status;
    this.key = key;
  }
}

async function call(method, path, body, ms = 15000) {
  const base = bridgeUrl();
  if (!base) throw new BridgeError('No bridge set yet', 0, 'err_no_bridge');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  const key = pairingKey();
  if (key) headers.authorization = `Bearer ${key}`;
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    const timeout = e.name === 'AbortError';
    throw new BridgeError(timeout ? 'The bridge is taking too long' : 'Can’t reach the bridge',
      timeout ? 408 : 0, timeout ? 'err_timeout' : 'err_unreachable');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data || data.ok === false) {
    const msg = (data && data.error) || `Something went wrong (${res.status})`;
    throw new BridgeError(msg, res.status, (data && data.error_key) || null);
  }
  return data;
}

export const api = {
  health: () => call('GET', '/api/health', null, 8000),
  now: () => call('GET', '/api/now', null, 8000),
  people: () => call('GET', '/api/people'),
  setWho: (who, pin) => call('POST', '/api/who', pin ? { who, pin } : { who }),
  key: (key, hold = false) => call('POST', '/api/key', hold ? { key, hold: true } : { key }),
  volume: (action) => call('POST', '/api/volume', { action }),
  power: (state) => call('POST', '/api/power', { state }, 40000),
  text: (text) => call('POST', '/api/text', { text }),
  message: (body) => call('POST', '/api/message', body, 30000),
  clearMessage: () => call('POST', '/api/message/clear', {}),
  currentMessage: () => call('GET', '/api/message'),
};

// The TV's state, polled while the tab is visible. Cheap (the bridge answers from memory) and it
// never leaves a dead EventSource behind when the phone changes network.
export function watchNow(onNow, onReach, everyMs = 2500) {
  let stopped = false;
  let timer = null;
  const beat = async () => {
    if (stopped) return;
    if (document.visibilityState === 'visible') {
      try {
        const data = await api.now();
        onNow(data);
        onReach(true);
      } catch (e) {
        onReach(!(e.status === 0 || e.status === 408));
      }
    }
    timer = setTimeout(beat, everyMs);
  };
  beat();
  const wake = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); beat(); } };
  document.addEventListener('visibilitychange', wake);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
  };
}

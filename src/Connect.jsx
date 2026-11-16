import { useState } from 'react';
import { api, bridgeUrl, setBridgeUrl, setPairingKey, pairingKey } from './bridge.js';

const looksLikeUrl = (v) => /^https?:\/\/[^\s]+$/i.test(v.trim());

// The app is only a remote: it needs to know which computer the bridge is on. That address lives on
// this phone (localStorage), never in the build, so one deploy serves every house.
export function Connect({ onDone, current, onCancel }) {
  const [url, setUrl] = useState(current || bridgeUrl());
  const [key, setKey] = useState(pairingKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const normalise = () => {
    let v = url.trim();
    if (v && !/^https?:\/\//i.test(v)) v = `http://${v}`;
    if (v && !/:\d+/.test(v.replace(/^https?:\/\//i, ''))) v = `${v.replace(/\/+$/, '')}:5400`;
    return v.replace(/\/+$/, '');
  };

  const test = async (e) => {
    e?.preventDefault();
    setError(''); setNote('');
    const v = normalise();
    if (!looksLikeUrl(v)) { setError('That does not look like an address. Try 192.168.1.20:5400'); return; }
    setBusy(true);
    setBridgeUrl(v);
    setPairingKey(key);
    setUrl(v);
    try {
      const health = await api.health();
      const tv = health.tv_connected ? 'The TV is connected.' : 'The bridge answered, but the TV is not connected.';
      setNote(`${tv}${health.auth === 'required' && !key ? ' This bridge wants a pairing key.' : ''}`);
      if (health.auth === 'required' && !key) { setError('A pairing key is needed for this bridge.'); return; }
      setTimeout(() => onDone(v), 700);
    } catch (err) {
      setError(err.status === 401 ? 'That pairing key was refused.' : 'No answer there. Is the bridge running on that computer?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="connect" onSubmit={test}>
      <div className="connect-mark" aria-hidden="true">▶</div>
      <h1>Couch Remote</h1>
      <p className="muted">
        Point this phone at the computer running the Couch TV bridge. On the same Wi-Fi that is
        usually its local address, with port 5400.
      </p>
      {error && <div className="note bad" role="alert">{error}</div>}
      {note && <div className="note good" role="status">{note}</div>}
      <label>
        Bridge address
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="192.168.1.20:5400"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
      </label>
      <label>
        Pairing key <span className="muted">(only if the bridge has one)</span>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="optional"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
      </label>
      <button className="btn primary wide" disabled={busy} type="submit">
        {busy ? 'Checking…' : current ? 'Save' : 'Connect'}
      </button>
      {current && <button type="button" className="btn ghost wide" onClick={onCancel}>Cancel</button>}
      <p className="hint">
        Voice needs HTTPS. On a plain <code>http://</code> address the microphone stays off; use the
        tunnel address to talk to the TV from anywhere.
      </p>
    </form>
  );
}

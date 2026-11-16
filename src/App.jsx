import { useCallback, useEffect, useRef, useState } from 'react';
import { api, bridgeUrl, setBridgeUrl, watchNow } from './bridge.js';
import { Connect } from './Connect.jsx';
import { Remote } from './Remote.jsx';
import { Messages } from './Messages.jsx';
import { Draw } from './Draw.jsx';
import './styles.css';

const friendly = (e) => {
  if (e?.status === 0 || e?.key === 'err_unreachable') return 'Can’t reach the bridge';
  if (e?.status === 401) return 'The bridge refused the pairing key';
  if (e?.status === 503) return 'The TV is not connected';
  return e?.message || 'Something went wrong';
};

export default function App() {
  const [base, setBase] = useState(bridgeUrl());
  const [editing, setEditing] = useState(!bridgeUrl());
  const [tv, setTv] = useState(null);
  const [reach, setReach] = useState(null);
  const [people, setPeople] = useState([]);
  const [who, setWho] = useState(() => { try { return localStorage.getItem('couch.who') || ''; } catch { return ''; } });
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const say = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    if (!base) return undefined;
    return watchNow(setTv, setReach);
  }, [base]);

  useEffect(() => {
    if (!base) return;
    let live = true;
    api.people()
      .then((j) => {
        if (!live) return;
        const list = j.people || [];
        setPeople(list);
        setWho((current) => (current && list.some((p) => p.id === current) ? current : (list[0]?.id || '')));
      })
      .catch(() => { /* the connect screen explains an unreachable bridge */ });
    return () => { live = false; };
  }, [base]);

  useEffect(() => {
    try {
      if (who) localStorage.setItem('couch.who', who);
    } catch { /* private mode */ }
  }, [who]);

  const run = useCallback(async (fn, closeSheet = false) => {
    try {
      await fn();
      if (closeSheet) setSheet(null);
    } catch (e) {
      say(friendly(e));
    }
  }, [say]);

  const onKey = (key, hold = false) => run(() => api.key(key, hold));

  const onVolume = (dir) => run(() => api.volume(dir));

  const onPower = () => {
    const off = tv?.power === 'on';
    run(() => api.power(off ? 'off' : 'on'));
  };

  const onWho = (id) => {
    setWho(id);
    run(() => api.setWho(id));
  };

  const saveBridge = (url) => {
    if (!url) { setEditing(false); return; }
    setBridgeUrl(url);
    setBase(url);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="app">
        <Connect current={base} onDone={saveBridge} onCancel={() => setEditing(false)} />
        <Toast text={toast} />
      </div>
    );
  }

  return (
    <div className="app">
      <Remote
        tv={tv}
        reach={reach}
        people={people}
        who={who}
        onWho={onWho}
        onKey={onKey}
        onPower={onPower}
        onVolume={onVolume}
        onMessage={() => setSheet('message')}
        onDraw={() => setSheet('draw')}
      />

      <footer className="footer">
        <span>{base ? base.replace(/^https?:\/\//, '') : 'no bridge'}</span>
        <button className="link" onClick={() => setEditing(true)}>Change</button>
      </footer>

      <Messages open={sheet === 'message'} onClose={() => setSheet(null)} who={who} people={people} onToast={say} />
      <Draw open={sheet === 'draw'} onClose={() => setSheet(null)} who={who} onToast={say} />
      <Toast text={toast} />
    </div>
  );
}

function Toast({ text }) {
  return <div className={`toast ${text ? 'on' : ''}`} role="status" aria-live="polite">{text}</div>;
}

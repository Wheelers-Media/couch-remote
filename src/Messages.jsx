import { useEffect, useRef, useState } from 'react';
import { api } from './bridge.js';
import { tick } from './haptics.js';

const PRESETS = [
  'Dinner’s ready',
  'Come help me for a minute',
  'Bedtime in 10',
  'I’m on my way',
  'Pause it, please',
  'Look out the window',
];

const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const canListen = Boolean(Speech) && typeof window !== 'undefined' && window.isSecureContext;

const friendly = (e) => {
  if (e?.status === 0 || e?.key === 'err_unreachable') return 'Can’t reach the bridge';
  if (e?.status === 401) return 'The bridge refused the pairing key';
  return e?.message || 'Something went wrong';
};

export function Messages({ open, onClose, who, people, onToast }) {
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [polish, setPolish] = useState(true);
  const [aiReady, setAiReady] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSent(null);
    setText('');
    api.currentMessage()
      .then((j) => setAiReady(Boolean(j.ai)))
      .catch(() => setAiReady(null));
  }, [open]);

  useEffect(() => () => { try { rec.current?.abort?.(); } catch { /* ignore */ } }, []);

  const stop = () => {
    try { rec.current?.stop?.(); } catch { /* ignore */ }
    setListening(false);
  };

  const listen = () => {
    if (!canListen) return;
    if (listening) { stop(); return; }
    const r = new Speech();
    r.lang = navigator.language || 'en-CA';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i += 1) said += e.results[i][0].transcript;
      setText(said.replace(/\s+/g, ' ').trim());
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onToast('Microphone is blocked. Allow it for this site.');
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      rec.current = r;
      setListening(true);
      tick();
    } catch {
      setListening(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await api.message({ text: body, who, seconds, polish });
      setSent(res.message);
      tick(14);
      onToast('Sent to the TV');
    } catch (e) {
      onToast(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    try {
      await api.clearMessage();
      setSent(null);
      onToast('Cleared from the TV');
    } catch (e) {
      onToast(friendly(e));
    }
  };

  const name = people.find((p) => p.id === who)?.name;

  return (
    <div className={`sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Message the TV" aria-hidden={!open}>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet-card">
        <div className="sheet-head">
          <h2>Message the TV</h2>
          <button className="round ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {sent ? (
          <div className="sent">
            <div className="note good">On the TV now{name ? `, from ${name}` : ''}{sent.ai ? ' · reworded by AI' : ''}</div>
            <p className="sent-line">{sent.text || (sent.image ? 'Your drawing' : '')}</p>
            <div className="row">
              <button className="btn primary" onClick={() => setSent(null)}>Send another</button>
              <button className="btn ghost" onClick={clear}>Clear it</button>
            </div>
          </div>
        ) : (
          <>
            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p} className="chip" onClick={() => { tick(); setText(p); }}>{p}</button>
              ))}
            </div>
            <div className="composer">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Say something short…"
                rows={3}
                maxLength={300}
                autoFocus={open && canListen}
              />
              <button
                type="button"
                className={`mic ${listening ? 'listening' : ''}`}
                onClick={listen}
                disabled={!canListen}
                aria-label={listening ? 'Stop dictating' : 'Dictate a message'}
                title={canListen ? 'Dictate' : 'Voice needs HTTPS'}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            </div>
            {!canListen && (
              <p className="hint">
                Dictation needs an <code>https://</code> address. Open the tunnel link to speak instead of typing.
              </p>
            )}
            <div className="row options">
              <label className="toggle">
                <input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} />
                <span>Let AI word it{aiReady === false ? ' (no key on the bridge)' : ''}</span>
              </label>
              <div className="chips small" role="radiogroup" aria-label="How long it stays on screen">
                {[15, 30, 60, 120].map((s) => (
                  <button key={s} role="radio" aria-checked={seconds === s}
                    className={`chip ${seconds === s ? 'on' : ''}`} onClick={() => setSeconds(s)}>{s}s</button>
                ))}
              </div>
            </div>
            <button className="btn primary wide" disabled={busy || !text.trim()} onClick={send}>
              {busy ? 'Sending…' : 'Send to the TV'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

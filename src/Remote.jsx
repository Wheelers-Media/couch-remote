import { tick } from './haptics.js';

const statusOf = (reach, tv) => {
  if (reach === false) return { text: 'Can’t reach the bridge', bad: true };
  if (!tv) return { text: 'Connecting…' };
  if (!tv.tv_connected) return { text: 'TV not connected', bad: true };
  if (tv.waking) return { text: 'Waking' };
  if (tv.power === 'off') return { text: 'Off' };
  if (tv.playing && tv.playing.title) return { text: tv.playing.title, sub: tv.playing.state === 'paused' ? 'paused' : 'playing' };
  if (tv.app && tv.app.name) return { text: tv.app.name };
  return { text: 'Home' };
};

export function Remote({ tv, reach, people, who, onWho, onKey, onPower, onVolume, onMessage, onDraw }) {
  const s = statusOf(reach, tv);
  const on = tv?.power === 'on';
  const press = (k) => () => { tick(); onKey(k); };

  return (
    <div className="remote">
      <header className="top">
        <div className={`state ${s.bad ? 'bad' : ''}`}>
          <span className={`pill ${on ? 'on' : ''}`} aria-hidden="true" />
          <div className="state-text">
            <b>{s.text}</b>
            {s.sub && <span>{s.sub}</span>}
          </div>
        </div>
        <button className="round" aria-label={on ? 'Turn the TV off' : 'Turn the TV on'} onClick={() => { tick(); onPower(); }}>
          <Power />
        </button>
      </header>

      {tv?.playing?.poster && (
        <div className="now" aria-label="Now playing">
          <img src={tv.playing.poster} alt="" />
          <div>
            <b>{tv.playing.title}</b>
            {tv.playing.episode_title && <span>{tv.playing.episode_title}</span>}
            {!!tv.playing.season && <span>Season {tv.playing.season}{tv.playing.episode ? ` · Episode ${tv.playing.episode}` : ''}</span>}
          </div>
        </div>
      )}

      <div className="pad" role="group" aria-label="Direction pad">
        <button className="dir up" aria-label="Up" onClick={press('up')}><Arrow /></button>
        <button className="dir left" aria-label="Left" onClick={press('left')}><Arrow /></button>
        <button className="ok" aria-label="OK" onClick={press('ok')} onContextMenu={(e) => { e.preventDefault(); onKey('ok', true); }}>OK</button>
        <button className="dir right" aria-label="Right" onClick={press('right')}><Arrow /></button>
        <button className="dir down" aria-label="Down" onClick={press('down')}><Arrow /></button>
      </div>

      <div className="row keys">
        <button className="btn" onClick={press('back')}>Back</button>
        <button className="btn" onClick={press('home')}>Home</button>
        <button className="btn" onClick={press('mute')}>Mute</button>
        <button className="btn" onClick={() => { tick(); onVolume('down'); }}>Vol −</button>
        <button className="btn" onClick={() => { tick(); onVolume('up'); }}>Vol +</button>
      </div>

      {people.length > 0 && (
        <div className="who" role="radiogroup" aria-label="Who is watching">
          {people.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={who === p.id}
              className={`chip ${who === p.id ? 'on' : ''}`}
              onClick={() => { tick(); onWho(p.id); }}
            >{p.name}</button>
          ))}
        </div>
      )}

      <div className="row actions">
        <button className="btn big" onClick={() => { tick(); onMessage(); }}>Message the TV</button>
        <button className="btn big ghost" onClick={() => { tick(); onDraw(); }}>Draw</button>
      </div>
    </div>
  );
}

function Power() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 3v9" />
      <path d="M6.2 6.2a8 8 0 1 0 11.6 0" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

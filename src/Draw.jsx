import { useEffect, useRef, useState } from 'react';
import { api } from './bridge.js';
import { tick } from './haptics.js';

const COLOURS = ['#ffffff', '#ffd60a', '#ff9f0a', '#ff375f', '#bf5af2', '#0a84ff', '#32d74b'];
const PAD = 900;   // the drawing is sent at this width; the TV scales it to the screen

const friendly = (e) => (e?.status === 0 ? 'Can’t reach the bridge' : e?.message || 'Something went wrong');

export function Draw({ open, onClose, who, onToast }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [colour, setColour] = useState(COLOURS[0]);
  const [size, setSize] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // One canvas, kept at the size it is shown: a phone turning or the keyboard closing must not blur
  // the picture or lose the sketch, so it is copied across when the box changes.
  useEffect(() => {
    if (!open) return undefined;
    const el = canvas.current;
    const box = el.parentElement;
    const fit = () => {
      const w = Math.max(120, Math.round(box.clientWidth));
      const h = Math.max(120, Math.round(box.clientHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const old = document.createElement('canvas');
      old.width = el.width; old.height = el.height;
      if (el.width && el.height) old.getContext('2d').drawImage(el, 0, 0);
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const ctx = el.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (old.width && old.height) ctx.drawImage(old, 0, 0, el.width / dpr, el.height / dpr);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
  }, [open]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
    canvas.current.setPointerCapture?.(e.pointerId);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvas.current.getContext('2d');
    const p = point(e);
    ctx.strokeStyle = colour;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!dirty) setDirty(true);
  };

  const end = (e) => {
    drawing.current = false;
    last.current = null;
    try { canvas.current.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const clear = () => {
    const el = canvas.current;
    const ctx = el.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.restore();
    setDirty(false);
    tick();
  };

  const send = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      // White strokes on nothing would vanish on a dark screen: the drawing is flattened onto a
      // transparent background, so the TV shows exactly what was drawn.
      const image = canvas.current.toDataURL('image/png');
      await api.message({ image, who, seconds: 45 });
      tick(14);
      onToast('Drawing sent to the TV');
      onClose();
    } catch (e) {
      onToast(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`sheet ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Draw on the TV" aria-hidden={!open}>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet-card draw">
        <div className="sheet-head">
          <h2>Draw on the TV</h2>
          <button className="round ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="pad-box">
          <canvas
            ref={canvas}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            aria-label="Drawing area: drag a finger to draw"
          />
          {!dirty && <div className="pad-hint">Draw with a finger</div>}
        </div>
        <div className="row swatches" role="radiogroup" aria-label="Colour">
          {COLOURS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={colour === c}
              aria-label={`Colour ${c}`}
              className={`swatch ${colour === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => { setColour(c); tick(); }}
            />
          ))}
          <input
            className="range"
            type="range"
            min="2"
            max="24"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Brush size"
          />
        </div>
        <div className="row">
          <button className="btn ghost" onClick={clear}>Clear</button>
          <button className="btn primary" disabled={busy || !dirty} onClick={send}>{busy ? 'Sending…' : 'Send drawing'}</button>
        </div>
        <p className="hint">The TV shows it full screen for 45 seconds. Hold OK on the remote to dismiss it sooner.</p>
      </div>
    </div>
  );
}

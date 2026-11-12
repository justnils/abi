import * as E from './engine.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const ctx = canvas.getContext('2d');
const body = document.body;

const COLORS = [
  { main: '#ff6b5e', dark: '#c94236', light: '#ffb3a8', name: 'Rot' },
  { main: '#2ec4b6', dark: '#1a8c82', light: '#9cede5', name: 'Türkis' },
];

// ---------------- Einstellungen ----------------
const settings = { level: 'mittel', target: 15, sound: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('wabbel-settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('wabbel-settings', JSON.stringify(settings)); } catch {} };

function bindRow(sel, key, parse = (v) => v) {
  const row = $(sel);
  const sync = () => row.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', String(parse(b.dataset.v)) === String(settings[key])));
  row.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    settings[key] = parse(b.dataset.v); saveSettings(); sync(); sfx('tick');
  });
  sync();
}
bindRow('#lvl', 'level');
bindRow('#pts', 'target', Number);
bindRow('#snd', 'sound', (v) => v === '1');

// ---------------- Layout ----------------
let isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function setTouch(on) {
  isTouch = on;
  body.classList.toggle('touch', on);
  $('#helpKeys').style.display = on ? 'none' : '';
  $('#helpTouch').style.display = on ? '' : 'none';
  fit();
}

let scale = 1;
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const portrait = vh > vw;
  body.classList.toggle('portrait', portrait);
  body.classList.toggle('landscape', !portrait);
  let w, h;
  if (isTouch && portrait) {
    const padH = 130;
    w = Math.min(vw - 16, (vh - padH - 24) * 16 / 9);
    h = w * 9 / 16;
  } else {
    const m = isTouch ? 0 : 24;
    w = Math.min(vw - m, (vh - m) * 16 / 9);
    h = w * 9 / 16;
  }
  const stage = $('#stage');
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = canvas.width / E.W;
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 150));

// ---------------- Eingabe ----------------
const keys = new Set();
const touch = [{ left: false, right: false, jump: false }, { left: false, right: false, jump: false }];

addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (isTouch && !e.repeat) setTouch(false);
  keys.add(e.code);
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) togglePause();
  unlockAudio();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Touch-Buttons: Pointer-Tracking, damit man zwischen Buttons gleiten kann
const btns = [...document.querySelectorAll('.btn')];
const active = new Map(); // pointerId -> btn
function refreshTouch() {
  for (const t of touch) t.left = t.right = t.jump = false;
  btns.forEach((b) => b.classList.remove('on'));
  for (const b of active.values()) {
    touch[+b.dataset.p][b.dataset.k] = true;
    b.classList.add('on');
  }
}
function btnAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.classList.contains('btn') ? el : null;
}
$('#pads').addEventListener('pointerdown', (e) => {
  const b = btnAt(e.clientX, e.clientY); if (!b) return;
  e.preventDefault();
  if (e.pointerType === 'touch' && !isTouch) setTouch(true);
  active.set(e.pointerId, b); refreshTouch(); unlockAudio();
});
addEventListener('pointermove', (e) => {
  if (!active.has(e.pointerId)) return;
  const b = btnAt(e.clientX, e.clientY);
  // Nur innerhalb derselben Spielerseite wechseln
  if (b && b.dataset.p === active.get(e.pointerId).dataset.p) { active.set(e.pointerId, b); refreshTouch(); }
});
const release = (e) => { if (active.delete(e.pointerId)) refreshTouch(); };
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
addEventListener('touchstart', () => { if (!isTouch) setTouch(true); }, { passive: true });
document.addEventListener('contextmenu', (e) => e.preventDefault());

function padInput(i) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const gp = pads[i];
  if (!gp) return { left: false, right: false, jump: false };
  const ax = gp.axes[0] || 0;
  const pressed = (n) => gp.buttons[n] && gp.buttons[n].pressed;
  return { left: ax < -0.4 || pressed(14), right: ax > 0.4 || pressed(15), jump: pressed(0) || pressed(1) || pressed(12) };
}

function readInput() {
  const wasd = { left: keys.has('KeyA'), right: keys.has('KeyD'), jump: keys.has('KeyW') || keys.has('Space') };
  const arrows = { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp') };
  const or = (...xs) => ({ left: xs.some((x) => x.left), right: xs.some((x) => x.right), jump: xs.some((x) => x.jump) });
  if (mode === 1) {
    return [or(wasd, arrows, touch[0], padInput(0)), E.aiInput(ai, game)];
  }
  return [or(wasd, touch[0], padInput(0)), or(arrows, touch[1], padInput(1))];
}

// ---------------- Audio ----------------
let ac = null;
function unlockAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ac.state === 'suspended') ac.resume();
}
function tone(freq, dur, type = 'sine', vol = 0.18, slide = 0, delay = 0) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 800) {
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
}
function sfx(name, e = {}) {
  if (!settings.sound || !ac || ac.state !== 'running') return;
  switch (name) {
    case 'hit': tone(260 + (e.v || 500) * 0.25, 0.12, 'sine', 0.25, -120); tone(130, 0.08, 'triangle', 0.15); break;
    case 'jump': tone(300, 0.1, 'sine', 0.07, 250); break;
    case 'ground': noise(0.18, e.soft ? 0.08 : 0.3, 600); break;
    case 'net': tone(180, 0.15, 'square', 0.05, -60); noise(0.1, 0.08, 2000); break;
    case 'wall': tone(220, 0.06, 'triangle', 0.1); break;
    case 'point': tone(660, 0.12, 'triangle', 0.15); tone(880, 0.18, 'triangle', 0.15, 0, 0.1); break;
    case 'fault': tone(220, 0.25, 'sawtooth', 0.07, -80); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 0, i * 0.12)); break;
    case 'tick': tone(900, 0.04, 'sine', 0.06); break;
  }
}

// ---------------- Spielzustand ----------------
let mode = 1;           // 1 = gegen Computer, 2 = zwei Spieler
let game = null, ai = null;
let running = false, paused = false;
let particles = [];
let banner = null;      // { text, sub, t, color }
let shake = 0;
let lastServer = 0;

function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach((o) => o.classList.toggle('show', o.id === id));
  body.classList.toggle('playing', !id && running);
}

function start(m) {
  unlockAudio();
  if (isTouch) {
    // Auf dem Handy: Vollbild + Querformat, falls der Browser es erlaubt
    const el = document.documentElement;
    const fs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fs && !document.fullscreenElement) {
      Promise.resolve(fs.call(el)).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}).finally(() => setTimeout(fit, 200));
    }
  }
  mode = m;
  body.classList.toggle('two', m === 2);
  game = E.createGame({ target: settings.target });
  lastServer = Math.random() < 0.5 ? 0 : 1;
  E.resetForServe(game, lastServer);
  ai = E.createAI(1, settings.level);
  particles = []; banner = { text: 'Los geht\'s!', sub: aufschlagText(lastServer), t: 1.6, color: '#fff' };
  running = true; paused = false;
  showOverlay(null);
  fit();
}

function aufschlagText(s) {
  if (mode === 1) return s === 0 ? 'Dein Aufschlag' : 'Computer schlägt auf';
  return `Aufschlag ${s === 0 ? 'links' : 'rechts'}`;
}

function togglePause() {
  if (!running || game.state === 'over') return;
  paused = !paused;
  showOverlay(paused ? 'pause' : null);
}

$('#btn1p').onclick = () => start(1);
$('#btn2p').onclick = () => start(2);
$('#btnResume').onclick = () => togglePause();
$('#pauseBtn').onclick = () => togglePause();
$('#btnQuit').onclick = $('#btnMenu').onclick = () => { running = false; paused = false; body.classList.remove('two'); makeDemo(); showOverlay('menu'); };
$('#btnAgain').onclick = () => start(mode);
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !paused && game.state !== 'over') togglePause(); });

function handleEvents() {
  for (const e of game.events) {
    sfx(e.type, e);
    if (e.type === 'hit') {
      burst(e.x, e.y, COLORS[e.side].light, 6, 120);
    } else if (e.type === 'ground') {
      burst(e.x, E.GROUND, '#f3d9a4', e.soft ? 5 : 16, e.soft ? 80 : 200);
      if (!e.soft) shake = 6;
    } else if (e.type === 'point') {
      const who = mode === 1 ? (e.side === 0 ? 'Punkt für dich!' : 'Punkt für den Computer') : `Punkt ${e.side === 0 ? 'links' : 'rechts'}`;
      banner = { text: who, sub: e.reason === 'Boden' ? '' : e.reason, t: 1.5, color: COLORS[e.side].light };
      if (e.reason !== 'Boden') sfx('fault');
    } else if (e.type === 'win') {
      setTimeout(gameOver, 1300);
    }
  }
  game.events.length = 0;
}

function gameOver() {
  if (!running) return;
  const w = game.winner;
  $('#overTitle').textContent = mode === 1 ? (w === 0 ? 'Gewonnen! 🎉' : 'Verloren …') : `${w === 0 ? 'Links' : 'Rechts'} gewinnt! 🎉`;
  $('#overScore').textContent = `${game.score[0]} : ${game.score[1]}`;
  showOverlay('over');
}

function burst(x, y, color, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * Math.random();
    const v = sp * (0.4 + Math.random() * 0.6);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, color, r: 2 + Math.random() * 3 });
  }
}

// ---------------- Darstellung ----------------
const clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 190 + Math.random() * 80, y: 40 + Math.random() * 90, s: 0.6 + Math.random() * 0.7, v: 6 + Math.random() * 10 }));
let time = 0;

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, E.GROUND);
  sky.addColorStop(0, '#3a5ba0');
  sky.addColorStop(0.55, '#f08a7e');
  sky.addColorStop(1, '#ffd29a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, E.W, E.GROUND);

  // Sonne
  const sx = 610, sy = 285;
  const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
  glow.addColorStop(0, 'rgba(255,240,180,.9)'); glow.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = glow; ctx.fillRect(sx - 140, sy - 140, 280, 280);
  ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.arc(sx, sy, 42, 0, Math.PI * 2); ctx.fill();

  // Wolken
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (const c of clouds) {
    c.x += c.v / 60; if (c.x > E.W + 80) c.x = -120;
    const s = c.s;
    ctx.beginPath();
    for (const [ox, oy, rx, ry] of [[0, 0, 50, 14], [22, -8, 28, 14], [-20, -5, 22, 11]]) {
      ctx.moveTo(c.x + ox * s + rx * s, c.y + oy * s);
      ctx.ellipse(c.x + ox * s, c.y + oy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Meer
  const seaTop = 305;
  const sea = ctx.createLinearGradient(0, seaTop, 0, E.GROUND - 30);
  sea.addColorStop(0, '#3b7fb8'); sea.addColorStop(1, '#5cb3c9');
  ctx.fillStyle = sea; ctx.fillRect(0, seaTop, E.W, E.GROUND - 30 - seaTop);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) {
    const y = seaTop + 10 + r * 18;
    ctx.beginPath();
    for (let x = 0; x <= E.W; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.04 + time * (1.5 + r * 0.3) + r) * 2);
    ctx.stroke();
  }
  // Glitzern der Sonne auf dem Wasser
  ctx.fillStyle = 'rgba(255,240,190,.55)';
  for (let i = 0; i < 6; i++) {
    const w = 60 - i * 7 + Math.sin(time * 2 + i) * 6;
    ctx.fillRect(sx - w / 2, seaTop + 6 + i * 9, w, 2);
  }

  // Sand
  const sand = ctx.createLinearGradient(0, E.GROUND - 30, 0, E.H);
  sand.addColorStop(0, '#f6dca6'); sand.addColorStop(1, '#e2b877');
  ctx.fillStyle = sand;
  ctx.beginPath();
  ctx.moveTo(0, E.GROUND - 30);
  for (let x = 0; x <= E.W; x += 40) ctx.lineTo(x, E.GROUND - 30 + Math.sin(x * 0.02) * 4);
  ctx.lineTo(E.W, E.H); ctx.lineTo(0, E.H); ctx.fill();
  // Spielfeldlinie
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(8, E.GROUND + 2); ctx.lineTo(E.W - 8, E.GROUND + 2); ctx.stroke();
}

function drawNet() {
  const x = E.NET_X, top = E.NET_TOP;
  // Pfosten
  ctx.fillStyle = '#7a5434';
  ctx.fillRect(x - 4, top - 4, 8, E.GROUND - top + 8);
  // Netz
  const nh = 70;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(x - E.NET_HALF, top, E.NET_HALF * 2, nh);
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = top - 12; y <= top + nh; y += 6) {
    ctx.moveTo(x - E.NET_HALF, Math.max(top, y)); ctx.lineTo(x + E.NET_HALF, Math.min(top + nh, y + 12));
    ctx.moveTo(x + E.NET_HALF, Math.max(top, y)); ctx.lineTo(x - E.NET_HALF, Math.min(top + nh, y + 12));
  }
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - E.NET_HALF, top); ctx.lineTo(x - E.NET_HALF, top + nh); ctx.moveTo(x + E.NET_HALF, top); ctx.lineTo(x + E.NET_HALF, top + nh); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - E.NET_HALF - 1, top - 3, E.NET_HALF * 2 + 2, 6);
  ctx.beginPath(); ctx.arc(x, top, E.NET_HALF, Math.PI, 0); ctx.fill();
  // Fähnchen
  ctx.fillStyle = '#ffcf3f';
  ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, top - 26); ctx.lineTo(x + 16 + Math.sin(time * 6) * 2, top - 20); ctx.lineTo(x, top - 14); ctx.fill();
  ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top - 27); ctx.stroke();
}

function shadow(x, height, w) {
  const k = Math.max(0.25, 1 - height / 400);
  ctx.fillStyle = `rgba(80,50,20,${0.28 * k})`;
  ctx.beginPath(); ctx.ellipse(x, E.GROUND + 4, w * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill();
}

function drawPlayer(p, i) {
  const c = COLORS[i];
  const b = game.ball;
  const air = E.GROUND - p.y;
  shadow(p.x, air, 34);

  // Wackel-Verformung: Landung/Treffer stauchen, Flug streckt
  const stretch = p.onGround ? 0 : Math.min(0.18, Math.abs(p.vy) / 3500);
  const wob = Math.sin(time * 18 + i) * p.squash * 0.12;
  const sq = p.squash * 0.22 + wob;
  const rx = 33 * (1 + sq - stretch * 0.6);
  const ry = 38 * (1 - sq + stretch);
  const lean = (p.vx / E.P_SPEED) * 0.12;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.transform(1, 0, -lean, 1, 0, 0);

  // Körper (Gummibärchen-Tropfen)
  const grad = ctx.createRadialGradient(-10, -ry * 1.3, 4, 0, -ry * 0.8, ry * 1.4);
  grad.addColorStop(0, c.light); grad.addColorStop(0.45, c.main); grad.addColorStop(1, c.dark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  ctx.bezierCurveTo(-rx * 1.05, -ry * 0.9, -rx * 0.6, -ry * 2, 0, -ry * 2);
  ctx.bezierCurveTo(rx * 0.6, -ry * 2, rx * 1.05, -ry * 0.9, rx, 0);
  ctx.quadraticCurveTo(0, 5, -rx, 0);
  ctx.fill();
  // Glanzlicht
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(-rx * 0.42, -ry * 1.45, rx * 0.16, ry * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();

  // Augen folgen dem Ball
  const ex = -0, ey = -ry * 1.25;
  const ang = Math.atan2(b.y - (p.y + ey), b.x - p.x);
  for (const sx of [-11, 11]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(ex + sx, ey, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b2a4a';
    ctx.beginPath(); ctx.arc(ex + sx + Math.cos(ang) * 3.5, ey + Math.sin(ang) * 4.5, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Mund
  ctx.strokeStyle = c.dark; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  if (!p.onGround) ctx.ellipse(0, ey + 17, 4, 5, 0, 0, Math.PI * 2);
  else ctx.arc(0, ey + 12, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawBall() {
  const b = game.ball;
  shadow(b.x, E.GROUND - b.y, 18);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin);
  const r = E.B_R;
  const cols = ['#ff6b5e', '#ffcf3f', '#2ec4b6'];
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? '#ffffff' : cols[(k / 2) | 0];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, (k * Math.PI) / 3, ((k + 1) * Math.PI) / 3); ctx.fill();
  }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.arc(b.x - 5, b.y - 6, 4, 0, Math.PI * 2); ctx.fill();

  // Ball über dem Bildschirm -> Markierung
  if (b.y < -E.B_R) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(b.x, 6); ctx.lineTo(b.x - 9, 20); ctx.lineTo(b.x + 9, 20); ctx.fill();
  }
}

function drawHUD() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? 70 : E.W - 70;
    ctx.font = '800 46px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(27,42,74,.55)';
    ctx.strokeText(game.score[i], x, 42);
    ctx.fillStyle = COLORS[i].light; ctx.fillText(game.score[i], x, 42);
    // Berührungen
    for (let k = 0; k < E.MAX_TOUCHES; k++) {
      ctx.fillStyle = k < game.touches[i] ? '#ffcf3f' : 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.arc(x - 16 + k * 16, 78, 5, 0, Math.PI * 2); ctx.fill();
    }
    if (game.state === 'serve' && game.server === i) {
      ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('AUFSCHLAG', x, 98);
    }
  }
  ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.fillText(`Spiel bis ${game.target}`, E.W / 2, E.H - 18);
  if (mode === 1) {
    ctx.fillText('DU', 70, 116 - (game.state === 'serve' && game.server === 0 ? 0 : 18));
    ctx.fillText('CPU', E.W - 70, 116 - (game.state === 'serve' && game.server === 1 ? 0 : 18));
  }

  if (banner && banner.t > 0) {
    const a = Math.min(1, banner.t * 2);
    ctx.globalAlpha = a;
    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(27,42,74,.7)';
    const y = 165 - (1 - a) * 10;
    ctx.strokeText(banner.text, E.W / 2, y);
    ctx.fillStyle = banner.color; ctx.fillText(banner.text, E.W / 2, y);
    if (banner.sub) {
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.lineWidth = 5; ctx.strokeText(banner.sub, E.W / 2, y + 32);
      ctx.fillStyle = '#fff'; ctx.fillText(banner.sub, E.W / 2, y + 32);
    }
    ctx.globalAlpha = 1;
  }
}

function drawParticles(dt) {
  for (const p of particles) {
    p.life -= dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > E.GROUND + 4) { p.y = E.GROUND + 4; p.vy *= -0.3; p.vx *= 0.6; }
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);
}

function render(dt) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 30); }
  drawBackground();
  drawNet();
  drawPlayer(game.players[0], 0);
  drawPlayer(game.players[1], 1);
  drawBall();
  drawParticles(dt);
  drawHUD();
}

// Im Hauptmenü spielen zwei Computer gegeneinander
function makeDemo() {
  game = E.createGame({ target: 99 });
  demoAI = [E.createAI(0, 'schwer'), E.createAI(1, 'schwer')];
}
let demoAI = null;
makeDemo();

// ---------------- Hauptschleife ----------------
let last = performance.now(), acc = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  if (!paused) {
    acc += dt;
    while (acc >= E.DT) {
      if (running) {
        E.step(game, readInput());
        handleEvents();
      } else {
        E.step(game, [E.aiInput(demoAI[0], game), E.aiInput(demoAI[1], game)]);
        game.events.length = 0;
        if (game.state === 'over') makeDemo();
      }
      acc -= E.DT;
    }
    if (banner) banner.t -= dt;
  } else {
    acc = 0;
  }
  render(paused ? 0 : dt);
  requestAnimationFrame(frame);
}

setTouch(isTouch);
requestAnimationFrame(frame);

// Offline-Fähigkeit / installierbar als App
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

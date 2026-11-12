// Wabbel Volley – Spiel-Logik (rendering-frei, läuft auch in Node für Tests)

export const W = 800;
export const H = 450;
export const GROUND = 400;
export const NET_X = 400;
export const NET_HALF = 6;
export const NET_TOP = 250;

export const P_R = 32;          // Kollisionsradius Spieler
export const P_OFF = 34;        // Abstand Füße -> Kollisionsmittelpunkt
export const P_SPEED = 310;
export const P_JUMP = 590;
export const P_GRAV = 1550;

export const B_R = 15;
export const B_GRAV = 620;
export const B_MIN = 430;
export const B_MAX = 720;

export const DT = 1 / 120;
export const MAX_TOUCHES = 3;

const HOME = [200, 600];

function makePlayer(side) {
  return { side, x: HOME[side], y: GROUND, vx: 0, vy: 0, onGround: true, contact: false, squash: 0 };
}

export function createGame(opts = {}) {
  const g = {
    target: opts.target ?? 15,
    winBy: opts.winBy ?? 2,
    players: [makePlayer(0), makePlayer(1)],
    ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0 },
    score: [0, 0],
    touches: [0, 0],
    lastSide: -1,
    server: 0,
    state: 'serve',   // serve | play | point | over
    timer: 0,
    winner: -1,
    pointReason: '',
    events: [],       // für Sound/Effekte: {type, x, y, ...}
  };
  resetForServe(g, 0);
  return g;
}

export function resetForServe(g, server) {
  g.server = server;
  g.players = [makePlayer(0), makePlayer(1)];
  const b = g.ball;
  b.x = HOME[server];
  b.y = 190;
  b.vx = 0; b.vy = 0; b.spin = 0;
  g.touches = [0, 0];
  g.lastSide = -1;
  g.state = 'serve';
  g.timer = 0;
}

// input: [{left,right,jump}, {left,right,jump}]
export function step(g, input) {
  g.timer += DT;
  for (let i = 0; i < 2; i++) stepPlayer(g, g.players[i], input[i] || {});

  const b = g.ball;
  if (g.state === 'over') { stepBallFree(b); return; }

  if (g.state === 'serve') {
    // Ball schwebt, bis er berührt wird
    b.y = 190 + Math.sin(g.timer * 3) * 4;
    for (const p of g.players) collidePlayer(g, p, b);
    if (g.state === 'serve' && g.lastSide !== -1) g.state = 'play';
    return;
  }

  const prevX = b.x;
  b.vy += B_GRAV * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.spin += b.vx * DT * 0.05;

  collideWalls(g, b);
  collideNet(g, b);

  if (g.state === 'play') {
    // Ball wechselt die Seite -> Berührungen der verlassenen Seite zurücksetzen
    if ((prevX < NET_X) !== (b.x < NET_X)) g.touches[prevX < NET_X ? 0 : 1] = 0;
    for (const p of g.players) collidePlayer(g, p, b);
  }

  if (b.y + B_R >= GROUND) {
    b.y = GROUND - B_R;
    if (g.state === 'play') {
      const side = b.x < NET_X ? 0 : 1;
      g.events.push({ type: 'ground', x: b.x, y: GROUND, v: Math.abs(b.vy) });
      awardPoint(g, 1 - side, 'Boden');
    } else if (Math.abs(b.vy) > 60) {
      g.events.push({ type: 'ground', x: b.x, y: GROUND, v: Math.abs(b.vy), soft: true });
    }
    b.vy = -Math.abs(b.vy) * 0.45;
    b.vx *= 0.7;
  }

  if (g.state === 'point' && g.timer > 1.6) {
    resetForServe(g, g.server);
  }
}

function stepBallFree(b) {
  b.vy += B_GRAV * DT;
  b.x += b.vx * DT; b.y += b.vy * DT;
  if (b.x < B_R) { b.x = B_R; b.vx = Math.abs(b.vx) * 0.8; }
  if (b.x > W - B_R) { b.x = W - B_R; b.vx = -Math.abs(b.vx) * 0.8; }
  if (b.y + B_R >= GROUND) { b.y = GROUND - B_R; b.vy = -Math.abs(b.vy) * 0.45; b.vx *= 0.7; }
}

function awardPoint(g, side, reason) {
  g.score[side]++;
  g.pointReason = reason;
  g.events.push({ type: 'point', side, reason });
  const [a, c] = g.score;
  const lead = Math.abs(a - c);
  if (g.score[side] >= g.target && lead >= g.winBy) {
    g.state = 'over';
    g.winner = side;
    g.events.push({ type: 'win', side });
  } else {
    g.state = 'point';
    g.timer = 0;
    g.server = side;
  }
}

function stepPlayer(g, p, inp) {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  p.vx = dir * P_SPEED;
  if (inp.jump && p.onGround) {
    p.vy = -P_JUMP;
    p.onGround = false;
    g.events.push({ type: 'jump', side: p.side });
  }
  if (!p.onGround) {
    // Halten der Sprungtaste = etwas höher (wie bei vielen Plattformern)
    p.vy += P_GRAV * DT * (inp.jump && p.vy < 0 ? 0.78 : 1);
    p.y += p.vy * DT;
    if (p.y >= GROUND) {
      p.y = GROUND; p.vy = 0; p.onGround = true; p.squash = 1;
    }
  }
  p.x += p.vx * DT;
  const minX = p.side === 0 ? P_R : NET_X + NET_HALF + P_R;
  const maxX = p.side === 0 ? NET_X - NET_HALF - P_R : W - P_R;
  p.x = Math.max(minX, Math.min(maxX, p.x));
  p.squash = Math.max(0, p.squash - DT * 5);
}

function collideWalls(g, b) {
  if (b.x < B_R) { b.x = B_R; b.vx = Math.abs(b.vx) * 0.9; g.events.push({ type: 'wall', x: b.x, y: b.y }); }
  if (b.x > W - B_R) { b.x = W - B_R; b.vx = -Math.abs(b.vx) * 0.9; g.events.push({ type: 'wall', x: b.x, y: b.y }); }
}

function collideNet(g, b) {
  // Abgerundete Netzkante
  const dx = b.x - NET_X, dy = b.y - NET_TOP;
  const rr = B_R + NET_HALF;
  if (b.y < NET_TOP && dx * dx + dy * dy < rr * rr) {
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    b.x = NET_X + nx * rr; b.y = NET_TOP + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= 1.85 * vn * nx;
      b.vy -= 1.85 * vn * ny;
      g.events.push({ type: 'net', x: b.x, y: b.y });
    }
    return;
  }
  // Netzpfosten (seitlich)
  if (b.y >= NET_TOP && Math.abs(dx) < NET_HALF + B_R) {
    if (dx < 0) { b.x = NET_X - NET_HALF - B_R; b.vx = -Math.abs(b.vx) * 0.75; }
    else { b.x = NET_X + NET_HALF + B_R; b.vx = Math.abs(b.vx) * 0.75; }
    g.events.push({ type: 'net', x: b.x, y: b.y });
  }
}

function collidePlayer(g, p, b) {
  const cx = p.x, cy = p.y - P_OFF;
  const dx = b.x - cx, dy = b.y - cy;
  const rr = P_R + B_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) { p.contact = false; return; }

  const d = Math.sqrt(d2) || 1;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * rr;
  b.y = cy + ny * rr;

  // Reflexion relativ zur Spielerbewegung + Anteil der Spielergeschwindigkeit
  const rvx = b.vx - p.vx, rvy = b.vy - p.vy;
  const vn = rvx * nx + rvy * ny;
  let vx = b.vx, vy = b.vy;
  if (vn < 0) { vx = rvx - 2 * vn * nx; vy = rvy - 2 * vn * ny; }
  vx += p.vx * 0.35 + nx * 140;
  vy += Math.min(0, p.vy) * 0.25 + ny * 140;
  let sp = Math.hypot(vx, vy);
  const target = Math.max(B_MIN, Math.min(B_MAX, sp));
  if (sp < 1) { vx = nx; vy = ny; sp = 1; }
  b.vx = vx / sp * target;
  b.vy = vy / sp * target;

  if (!p.contact) {
    p.contact = true;
    p.squash = Math.max(p.squash, 0.6);
    g.events.push({ type: 'hit', side: p.side, x: b.x, y: b.y, v: target });
    if (g.state === 'serve' || g.state === 'play') {
      if (g.lastSide !== p.side) g.touches[1 - p.side] = 0;
      g.lastSide = p.side;
      g.touches[p.side]++;
      if (g.touches[p.side] > MAX_TOUCHES) {
        g.events.push({ type: 'fault', side: p.side });
        awardPoint(g, 1 - p.side, 'Zu viele Berührungen');
      }
    }
  }
}

// --------- Computer-Gegner ---------

// Sagt voraus, wo der Ball die Höhe yLine (fallend) erreicht.
export function predictBall(g, yLine, maxT = 3) {
  const b = { ...g.ball };
  if (g.state === 'serve') return { x: b.x, t: 0 };
  const dummy = { events: [] };
  for (let t = 0; t < maxT; t += DT) {
    b.vy += B_GRAV * DT;
    b.x += b.vx * DT; b.y += b.vy * DT;
    collideWalls(dummy, b);
    collideNet(dummy, b);
    if (b.vy > 0 && b.y >= yLine) return { x: b.x, t };
  }
  return { x: b.x, t: maxT };
}

const LEVELS = {
  leicht: { err: 38, react: 0.22, jumpChance: 0.55, speed: 0.72 },
  mittel: { err: 16, react: 0.1, jumpChance: 0.85, speed: 0.9 },
  schwer: { err: 4, react: 0.03, jumpChance: 1, speed: 1 },
};

export function createAI(side, level = 'mittel') {
  return { side, cfg: LEVELS[level] || LEVELS.mittel, think: 0, targetX: HOME[side], jumpPlan: false, err: 0, frame: 0 };
}

export function aiInput(ai, g) {
  const p = g.players[ai.side];
  const b = g.ball;
  const s = ai.side;
  const toNet = s === 0 ? 1 : -1;   // Richtung zum Netz
  const cfg = ai.cfg;
  ai.frame++;

  ai.think -= DT;
  if (ai.think <= 0) {
    ai.think = cfg.react;
    ai.err = (Math.random() * 2 - 1) * cfg.err;
    const mySide = (x) => (s === 0 ? x < NET_X : x > NET_X);

    if (g.state === 'serve') {
      if (g.server === s) {
        // Leicht hinter den Ball stellen und anspringen
        ai.targetX = b.x - toNet * 14;
        ai.jumpPlan = Math.abs(p.x - ai.targetX) < 6;
      } else {
        ai.targetX = HOME[s]; ai.jumpPlan = false;
      }
    } else if (g.state === 'play') {
      const pred = predictBall(g, GROUND - P_OFF * 2 - 10);
      if (mySide(pred.x)) {
        // Je mehr Berührungen, desto aggressiver Richtung Netz spielen
        const urgency = g.touches[s] >= 2 ? 22 : 10;
        ai.targetX = pred.x - toNet * urgency + ai.err;
        ai.jumpPlan = Math.random() < cfg.jumpChance;
      } else {
        ai.targetX = HOME[s] + toNet * 30;
        ai.jumpPlan = false;
      }
    } else {
      ai.targetX = HOME[s]; ai.jumpPlan = false;
    }
  }

  const dx = ai.targetX - p.x;
  const dead = 4;
  let left = dx < -dead, right = dx > dead;
  // langsamere Stufen bewegen sich nicht jeden Frame
  if (cfg.speed < 1 && (ai.frame % 10) / 10 >= cfg.speed) { left = right = false; }

  let jump = !p.onGround && p.vy < 0; // Sprungtaste halten
  if (ai.jumpPlan && p.onGround) {
    const bdx = Math.abs(b.x - p.x);
    const h = p.y - b.y; // Ballhöhe über Füßen
    if (g.state === 'serve') jump = bdx < 20;
    else if (bdx < 60 && h > 95 && h < 220 && b.vy > -50) jump = true;
  }
  return { left, right, jump };
}

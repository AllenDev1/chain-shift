// Canvas drawing for the board. Used by the live game and by the share card.

import { SIZE, F, P, DIRS, idx, isArrow, arrowDir } from './engine.js';

export const COLORS = {
  board: '#171830',
  cell: '#22244a',
  cellEdge: '#2b2e5c',
  wall: '#3d4178',
  wallTop: '#555aa3',
  pit: '#05050c',
  arrow: '#7b80ff',
  target: '#5ef2ff',
  cube: '#5ef2ff',
  preview: 'rgba(255,255,255,0.10)',
  previewEdge: 'rgba(255,255,255,0.55)',
  impact: '#ffd166',
  blocks: ['#ff7a59', '#ffc145', '#ff5d8f', '#b18cff', '#4cd08a', '#efe6d2'],
};

export const blockColor = (id) => COLORS.blocks[(id - 1) % COLORS.blocks.length];

export function layout(size) {
  const pad = size * 0.035;
  const cell = (size - pad * 2) / SIZE;
  return { size, pad, cell, gap: cell * 0.07 };
}

export function cellAt(L, px, py) {
  const x = Math.floor((px - L.pad) / L.cell), y = Math.floor((py - L.pad) / L.cell);
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cellRect(L, x, y, inset = 0) {
  const g = L.gap / 2 + inset;
  return { x: L.pad + x * L.cell + g, y: L.pad + y * L.cell + g, w: L.cell - g * 2, h: L.cell - g * 2 };
}

function drawArrow(ctx, r, dir, color, alpha) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = r.w * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = r.w * 0.075;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const off of [-s * 0.55, s * 0.55]) {
    ctx.beginPath();
    ctx.moveTo(-s, off + s * 0.6);
    ctx.lineTo(0, off - s * 0.4);
    ctx.lineTo(s, off + s * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloor(ctx, L, s, x, y, time) {
  const f = s.floor[idx(x, y)];
  const r = cellRect(L, x, y);
  const rad = L.cell * 0.14;

  if (f === F.WALL) {
    roundRect(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.fillStyle = COLORS.wall;
    ctx.fill();
    roundRect(ctx, r.x, r.y, r.w, r.h * 0.82, rad);
    ctx.fillStyle = COLORS.wallTop;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = L.cell * 0.05;
    for (let k = -1; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(r.x + k * r.w * 0.33, r.y + r.h);
      ctx.lineTo(r.x + k * r.w * 0.33 + r.h, r.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = COLORS.cell;
  ctx.fill();

  if (f === F.PIT) {
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.5);
    g.addColorStop(0, COLORS.pit);
    g.addColorStop(0.75, '#0b0b1c');
    g.addColorStop(1, '#1a1b3a');
    roundRect(ctx, r.x + r.w * 0.08, r.y + r.h * 0.08, r.w * 0.84, r.h * 0.84, rad * 1.6);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (f === F.TARGET) {
    const pulse = 0.65 + 0.35 * Math.sin(time / 380);
    ctx.save();
    ctx.shadowColor = COLORS.target;
    ctx.shadowBlur = L.cell * 0.25 * pulse;
    ctx.strokeStyle = COLORS.target;
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.lineWidth = L.cell * 0.05;
    roundRect(ctx, r.x + r.w * 0.16, r.y + r.h * 0.16, r.w * 0.68, r.h * 0.68, rad);
    ctx.stroke();
    ctx.restore();
  } else if (isArrow(f)) {
    drawArrow(ctx, r, arrowDir(f), COLORS.arrow, 0.85);
  }
}

function drawBlock(ctx, L, px, py, id, alpha = 1, scale = 1) {
  const r = cellRect(L, px, py, L.cell * 0.05);
  const w = r.w * scale, h = r.h * scale;
  const x = r.x + (r.w - w) / 2, y = r.y + (r.h - h) / 2;
  const rad = L.cell * 0.16 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = L.cell * 0.12;
  ctx.shadowOffsetY = L.cell * 0.05;
  roundRect(ctx, x, y, w, h, rad);
  ctx.fillStyle = blockColor(id);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  roundRect(ctx, x + w * 0.1, y + h * 0.08, w * 0.8, h * 0.32, rad * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();
  ctx.restore();
}

function drawCube(ctx, L, px, py, time, alpha = 1, scale = 1) {
  const r = cellRect(L, px, py, L.cell * 0.12);
  const w = r.w * scale, h = r.h * scale;
  const x = r.x + (r.w - w) / 2, y = r.y + (r.h - h) / 2;
  const pulse = 0.6 + 0.4 * Math.sin(time / 300);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = COLORS.cube;
  ctx.shadowBlur = L.cell * (0.35 + 0.25 * pulse);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, COLORS.cube);
  g.addColorStop(1, '#1fb6d6');
  roundRect(ctx, x, y, w, h, L.cell * 0.12 * scale);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = L.cell * 0.03;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h * 0.22);
  ctx.lineTo(x + w * 0.78, y + h / 2);
  ctx.lineTo(x + w / 2, y + h * 0.78);
  ctx.lineTo(x + w * 0.22, y + h / 2);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawPreview(ctx, L, s, preview, origin) {
  if (preview.end === 'blocked') {
    const r = cellRect(L, origin.x, origin.y);
    ctx.save();
    ctx.strokeStyle = '#ff5d6c';
    ctx.lineWidth = L.cell * 0.05;
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.14);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  for (const p of preview.path) {
    const r = cellRect(L, p.x, p.y);
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.14);
    ctx.fillStyle = COLORS.preview;
    ctx.fill();
  }
  // Dotted trail from the swiped block to where it stops.
  const pts = [origin, ...preview.path].map((p) => ({ x: L.pad + (p.x + 0.5) * L.cell, y: L.pad + (p.y + 0.5) * L.cell }));
  ctx.strokeStyle = COLORS.previewEdge;
  ctx.lineWidth = L.cell * 0.04;
  ctx.setLineDash([L.cell * 0.06, L.cell * 0.1]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);

  if (preview.end === 'fall' || preview.end === 'wall') {
    const last = preview.path[preview.path.length - 1] || origin;
    const cx = L.pad + (last.x + 0.5) * L.cell, cy = L.pad + (last.y + 0.5) * L.cell;
    ctx.fillStyle = COLORS.previewEdge;
    ctx.beginPath();
    ctx.arc(cx, cy, L.cell * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Drawn above the pieces: ring around the piece the swipe hits, plus a "?" badge —
// what happens after that impact is for the player to work out.
function drawImpact(ctx, L, preview) {
  if (preview.end !== 'hit') return;
  const r = cellRect(L, preview.hit.x, preview.hit.y, -L.cell * 0.02);
  ctx.save();
  ctx.strokeStyle = COLORS.impact;
  ctx.lineWidth = L.cell * 0.055;
  ctx.shadowColor = COLORS.impact;
  ctx.shadowBlur = L.cell * 0.2;
  roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.16);
  ctx.stroke();
  ctx.shadowBlur = 0;
  const bx = r.x + r.w - L.cell * 0.04, by = r.y + L.cell * 0.04, br = L.cell * 0.17;
  ctx.fillStyle = COLORS.impact;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1d00';
  ctx.font = `800 ${L.cell * 0.24}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', bx, by + L.cell * 0.01);
  ctx.restore();
}

// Tap targets around a selected block, one per legal direction. Tapping one previews
// that swipe; tapping it again commits. The chosen one is filled in.
function drawHandles(ctx, L, sel, { dirs, active }) {
  for (const d of dirs) {
    const cx = L.pad + (sel.x + 0.5 + DIRS[d].dx * 0.86) * L.cell;
    const cy = L.pad + (sel.y + 0.5 + DIRS[d].dy * 0.86) * L.cell;
    const r = L.cell * 0.22;
    const on = d === active;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = L.cell * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? COLORS.target : 'rgba(241,242,255,0.92)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.translate(cx, cy);
    ctx.rotate((d * Math.PI) / 2);
    ctx.strokeStyle = on ? '#062029' : '#171830';
    ctx.lineWidth = L.cell * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, r * 0.2);
    ctx.lineTo(0, -r * 0.22);
    ctx.lineTo(r * 0.42, r * 0.2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFlash(ctx, L, f, now) {
  const age = (now - f.born) / 380;
  if (age >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = f.color || COLORS.impact;
  ctx.lineWidth = L.cell * 0.05 * (1 - age);
  ctx.beginPath();
  ctx.arc(L.pad + (f.x + 0.5) * L.cell, L.pad + (f.y + 0.5) * L.cell, L.cell * (0.15 + age * 0.45), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// view: { state, display?, preview?, origin?, selected?, handles?, hint?, nudge?, flashes?, time, still?, shake? }
// `display` (Map id → {x, y, kind, alpha, scale}) overrides piece positions during animation.
export function drawBoard(ctx, size, view) {
  const L = layout(size);
  const { state: s, time = 0 } = view;
  ctx.save();
  if (view.shake) ctx.translate(view.shake, 0);

  roundRect(ctx, 0, 0, size, size, size * 0.045);
  ctx.fillStyle = COLORS.board;
  ctx.fill();

  // Pulses freeze when the player prefers reduced motion.
  const pulse = view.still ? 0 : time;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) drawFloor(ctx, L, s, x, y, pulse);

  if (view.hint) {
    const r = cellRect(L, view.hint.x, view.hint.y, -L.cell * 0.03);
    ctx.save();
    ctx.globalAlpha = view.still ? 1 : 0.5 + 0.5 * Math.sin(time / 160);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = L.cell * 0.05;
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.16);
    ctx.stroke();
    ctx.restore();
    drawArrow(ctx, cellRect(L, view.hint.x + DIRS[view.hint.dir].dx * 0.75, view.hint.y + DIRS[view.hint.dir].dy * 0.75), view.hint.dir, '#ffffff', 0.9);
  }

  if (view.preview && view.origin) drawPreview(ctx, L, s, view.preview, view.origin);

  if (view.display) {
    for (const [id, p] of view.display) {
      if (p.kind === P.CUBE) drawCube(ctx, L, p.x, p.y, pulse, p.alpha, p.scale);
      else drawBlock(ctx, L, p.x, p.y, id, p.alpha, p.scale);
    }
  } else {
    // `nudge` shifts one block a fraction of a cell: it follows the finger while
    // dragging and bumps toward a wall when a move is blocked.
    const n = view.nudge;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const ox = n && n.x === x && n.y === y ? n.ox : 0, oy = n && n.x === x && n.y === y ? n.oy : 0;
      if (s.piece[i] === P.BLOCK) drawBlock(ctx, L, x + ox, y + oy, s.ids[i]);
      else if (s.piece[i] === P.CUBE) drawCube(ctx, L, x, y, pulse);
    }
  }

  if (view.preview && view.origin) drawImpact(ctx, L, view.preview);

  if (view.selected) {
    const r = cellRect(L, view.selected.x, view.selected.y, -L.cell * 0.03);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = L.cell * 0.04;
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.16);
    ctx.stroke();
    if (view.handles) drawHandles(ctx, L, view.selected, view.handles);
  }

  for (const f of view.flashes || []) drawFlash(ctx, L, f, time);
  ctx.restore();
  return L;
}

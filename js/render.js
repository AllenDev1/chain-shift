// Canvas drawing for the board. Used by the live game and by the share card.
//
// Art direction: a tabletop tray. The board is a sand-coloured tray of inlaid tiles,
// pieces are solid extruded tiles (a top face over a darker side), walls are raised
// parts of the tray itself, and the cube is the one signal-red piece. Its white ring
// lines up with the ring printed on the target. No glows, no gloss.

import { SIZE, F, P, DIRS, idx, isArrow, arrowDir } from './engine.js';

export const FONT = "ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export const COLORS = {
  tray: '#d8cdb9',
  cell: '#e6ddcc',
  wallTop: '#bcae96',
  wallSide: '#9c8d75',
  pit: '#2b241f',
  pitRim: '#7a6a58',
  arrow: '#a6977e',
  target: '#f0532f',
  cube: '#f0532f',
  ink: '#1e1b26',
  muted: '#8a8070',
  bad: '#d23f27',
  impact: '#1e1b26',
  blocks: ['#3f6fe0', '#2ea37c', '#ebb23a', '#8c62d0', '#de6fa1', '#56627a'],
};

export const blockColor = (id) => COLORS.blocks[(id - 1) % COLORS.blocks.length];

// Darken a #rrggbb colour by k (0..1). Pieces use it for their side face.
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

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

const centre = (L, p) => ({ x: L.pad + (p.x + 0.5) * L.cell, y: L.pad + (p.y + 0.5) * L.cell });

function drawChevrons(ctx, r, dir, color, alpha) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = r.w * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((dir * Math.PI) / 2);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = r.w * 0.09;
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

// An extruded tile: a darker side face peeking out below the top face.
function drawSlab(ctx, x, y, w, h, rad, top, side, depth) {
  roundRect(ctx, x, y + depth, w, h - depth, rad);
  ctx.fillStyle = side;
  ctx.fill();
  roundRect(ctx, x, y, w, h - depth, rad);
  ctx.fillStyle = top;
  ctx.fill();
}

function drawFloor(ctx, L, s, x, y, time) {
  const f = s.floor[idx(x, y)];
  const r = cellRect(L, x, y);
  const rad = L.cell * 0.13;

  if (f === F.WALL) {
    drawSlab(ctx, r.x, r.y, r.w, r.h, rad, COLORS.wallTop, COLORS.wallSide, L.cell * 0.08);
    // Four rivets: walls are bolted to the tray.
    ctx.fillStyle = COLORS.wallSide;
    const top = r.h - L.cell * 0.08;
    for (const [u, v] of [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {
      ctx.beginPath();
      ctx.arc(r.x + r.w * u, r.y + top * v, L.cell * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = COLORS.cell;
  ctx.fill();

  if (f === F.PIT) {
    // A hole: the far inner wall shows as a band along the top, the opposite of a piece,
    // whose side shows along the bottom.
    const i = r.w * 0.1, wall = L.cell * 0.13;
    const hx = r.x + i, hy = r.y + i, hw = r.w - i * 2, hh = r.h - i * 2;
    roundRect(ctx, hx, hy, hw, hh, hw * 0.32);
    ctx.fillStyle = COLORS.pitRim;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, hy + wall, 0, hy + hh);
    g.addColorStop(0, '#0f0c0a');
    g.addColorStop(1, COLORS.pit);
    roundRect(ctx, hx - 1, hy + wall, hw + 2, hh, hw * 0.32);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  } else if (f === F.TARGET) {
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const pulse = 0.5 + 0.5 * Math.sin(time / 420);
    ctx.save();
    ctx.fillStyle = 'rgba(240, 83, 47, 0.13)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r.w * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.target;
    ctx.globalAlpha = 0.75 + 0.25 * pulse;
    ctx.lineWidth = L.cell * 0.065;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r.w * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.target;
    ctx.beginPath();
    ctx.arc(c.x, c.y, L.cell * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (isArrow(f)) {
    drawChevrons(ctx, r, arrowDir(f), COLORS.arrow, 1);
  }
}

function pieceBox(L, px, py, scale) {
  const r = cellRect(L, px, py, L.cell * 0.045);
  const w = r.w * scale, h = r.h * scale;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

function withShadow(ctx, L, alpha, fn) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(70, 50, 25, 0.28)';
  ctx.shadowBlur = L.cell * 0.1;
  ctx.shadowOffsetY = L.cell * 0.05;
  fn();
  ctx.restore();
}

function drawBlock(ctx, L, px, py, id, alpha = 1, scale = 1) {
  const b = pieceBox(L, px, py, scale);
  const color = blockColor(id);
  withShadow(ctx, L, alpha, () => {
    roundRect(ctx, b.x, b.y, b.w, b.h, L.cell * 0.15 * scale);
    ctx.fillStyle = shade(color, 0.28);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    roundRect(ctx, b.x, b.y, b.w, b.h - L.cell * 0.085 * scale, L.cell * 0.15 * scale);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

function drawCube(ctx, L, px, py, alpha = 1, scale = 1) {
  const b = pieceBox(L, px, py, scale);
  const depth = L.cell * 0.085 * scale;
  withShadow(ctx, L, alpha, () => {
    roundRect(ctx, b.x, b.y, b.w, b.h, L.cell * 0.15 * scale);
    ctx.fillStyle = shade(COLORS.cube, 0.3);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    roundRect(ctx, b.x, b.y, b.w, b.h - depth, L.cell * 0.15 * scale);
    ctx.fillStyle = COLORS.cube;
    ctx.fill();
    // The ring matches the one on the target, so "cube on target" reads as rings aligned.
    const cx = b.x + b.w / 2, cy = b.y + (b.h - depth) / 2;
    ctx.strokeStyle = '#fff7ef';
    ctx.lineWidth = L.cell * 0.065 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, b.w * 0.24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff7ef';
    ctx.beginPath();
    ctx.arc(cx, cy, L.cell * 0.05 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
}

// The target ring, drawn over a block that covers it: signal red with a light halo, so it
// reads on every block colour and never looks like the cube (red tile, white ring).
function drawTargetMark(ctx, L, x, y) {
  const c = centre(L, { x, y });
  const cy = c.y - L.cell * 0.04; // centred on the block's top face
  const r = L.cell * 0.2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 253, 248, 0.9)';
  ctx.lineWidth = L.cell * 0.11;
  ctx.beginPath();
  ctx.arc(c.x, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = COLORS.target;
  ctx.lineWidth = L.cell * 0.055;
  ctx.stroke();
  ctx.fillStyle = COLORS.target;
  ctx.beginPath();
  ctx.arc(c.x, cy, L.cell * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPreview(ctx, L, s, preview, origin) {
  if (preview.end === 'blocked') {
    const r = cellRect(L, origin.x, origin.y, -L.cell * 0.01);
    ctx.save();
    ctx.strokeStyle = COLORS.bad;
    ctx.lineWidth = L.cell * 0.05;
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.15);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  for (const p of preview.path) {
    const r = cellRect(L, p.x, p.y);
    roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.13);
    ctx.fillStyle = 'rgba(30, 27, 38, 0.08)';
    ctx.fill();
  }
  // Dotted trail from the swiped block to where it stops.
  const pts = [origin, ...preview.path].map((p) => centre(L, p));
  ctx.strokeStyle = 'rgba(30, 27, 38, 0.6)';
  ctx.lineWidth = L.cell * 0.05;
  ctx.setLineDash([0.01, L.cell * 0.13]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);

  if (preview.end === 'fall' || preview.end === 'wall') {
    const c = centre(L, preview.path[preview.path.length - 1] || origin);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = L.cell * 0.045;
    ctx.beginPath();
    ctx.arc(c.x, c.y, L.cell * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Drawn above the pieces: an outline around the piece the swipe hits, plus a "?" badge.
// What happens after that impact is for the player to work out.
function drawImpact(ctx, L, preview) {
  if (preview.end !== 'hit') return;
  const r = cellRect(L, preview.hit.x, preview.hit.y, -L.cell * 0.015);
  ctx.save();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = L.cell * 0.05;
  ctx.setLineDash([L.cell * 0.12, L.cell * 0.08]);
  roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.17);
  ctx.stroke();
  ctx.setLineDash([]);
  const bx = r.x + r.w - L.cell * 0.05, by = r.y + L.cell * 0.05, br = L.cell * 0.17;
  ctx.fillStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${L.cell * 0.24}px ${FONT}`;
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
    ctx.shadowColor = 'rgba(70, 50, 25, 0.3)';
    ctx.shadowBlur = L.cell * 0.1;
    ctx.shadowOffsetY = L.cell * 0.03;
    // A light halo lifts the handle off whatever piece it sits on.
    ctx.beginPath();
    ctx.arc(cx, cy, r + L.cell * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 253, 248, 0.85)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    // Ink by default so a handle reads over any piece, the cube's white ring included.
    ctx.fillStyle = on ? '#fffdf8' : COLORS.ink;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (on) {
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = L.cell * 0.04;
      ctx.stroke();
    }
    ctx.translate(cx, cy);
    ctx.rotate((d * Math.PI) / 2);
    ctx.strokeStyle = on ? COLORS.ink : '#fffdf8';
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
  const c = centre(L, f);
  ctx.save();
  ctx.globalAlpha = (1 - age) * 0.8;
  ctx.strokeStyle = f.color || COLORS.impact;
  ctx.lineWidth = L.cell * 0.05 * (1 - age);
  ctx.beginPath();
  ctx.arc(c.x, c.y, L.cell * (0.15 + age * 0.45), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function outline(ctx, L, cell, alpha = 1) {
  const r = cellRect(L, cell.x, cell.y, -L.cell * 0.02);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = L.cell * 0.05;
  roundRect(ctx, r.x, r.y, r.w, r.h, L.cell * 0.17);
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

  roundRect(ctx, 0, 0, size, size, size * 0.05);
  ctx.fillStyle = COLORS.tray;
  ctx.fill();

  // Pulses freeze when the player prefers reduced motion.
  const pulse = view.still ? 0 : time;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) drawFloor(ctx, L, s, x, y, pulse);

  if (view.hint) {
    outline(ctx, L, view.hint, view.still ? 1 : 0.55 + 0.45 * Math.sin(time / 160));
    const d = DIRS[view.hint.dir];
    drawChevrons(ctx, cellRect(L, view.hint.x + d.dx * 0.75, view.hint.y + d.dy * 0.75), view.hint.dir, COLORS.ink, 0.9);
  }

  if (view.preview && view.origin) drawPreview(ctx, L, s, view.preview, view.origin);

  if (view.display) {
    for (const [id, p] of view.display) {
      if (p.kind === P.CUBE) drawCube(ctx, L, p.x, p.y, p.alpha, p.scale);
      else drawBlock(ctx, L, p.x, p.y, id, p.alpha, p.scale);
    }
  } else {
    // `nudge` shifts one block a fraction of a cell: it follows the finger while
    // dragging and bumps toward a wall when a move is blocked.
    const n = view.nudge;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const on = n && n.x === x && n.y === y;
      if (s.piece[i] === P.BLOCK) drawBlock(ctx, L, x + (on ? n.ox : 0), y + (on ? n.oy : 0), s.ids[i]);
      else if (s.piece[i] === P.CUBE) drawCube(ctx, L, x, y);
    }
  }

  // A block parked on the target would hide it, so the target is printed on top of it.
  const t = s.floor.indexOf(F.TARGET);
  if (t >= 0) {
    const tx = t % SIZE, ty = (t / SIZE) | 0;
    const covered = view.display
      ? [...view.display.values()].some((p) => p.kind === P.BLOCK && Math.abs(p.x - tx) < 0.5 && Math.abs(p.y - ty) < 0.5)
      : s.piece[t] === P.BLOCK;
    if (covered) drawTargetMark(ctx, L, tx, ty);
  }

  if (view.preview && view.origin) drawImpact(ctx, L, view.preview);

  if (view.selected) {
    outline(ctx, L, view.selected);
    if (view.handles) drawHandles(ctx, L, view.selected, view.handles);
  }

  for (const f of view.flashes || []) drawFlash(ctx, L, f, time);
  ctx.restore();
  return L;
}

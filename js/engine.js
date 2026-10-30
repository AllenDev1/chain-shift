// Chain Shift rules engine. Pure functions, no DOM — runs in the browser and in Node tests.
//
// Board: 6×6. Each cell has a floor (empty, wall, target, pit, or an arrow) and
// optionally a piece (block or cube) resting on it.
//
// A move: swipe a block in a direction. The active piece slides cell by cell:
//   - wall / board edge ahead  → it stops, the chain ends
//   - piece ahead              → it stops, and that piece becomes active (same direction)
//   - lands on an arrow        → its direction changes to the arrow's
//   - lands on a pit           → it falls in, the pit becomes floor, the chain ends
// The cube can't be swiped directly; it only moves when hit. The puzzle is solved
// when the cube comes to rest on the target.

export const SIZE = 6;
export const N = SIZE * SIZE;

export const F = { EMPTY: 0, WALL: 1, TARGET: 2, PIT: 3, UP: 4, RIGHT: 5, DOWN: 6, LEFT: 7 };
export const P = { NONE: 0, BLOCK: 1, CUBE: 2 };
export const DIRS = [
  { dx: 0, dy: -1, name: 'up' },
  { dx: 1, dy: 0, name: 'right' },
  { dx: 0, dy: 1, name: 'down' },
  { dx: -1, dy: 0, name: 'left' },
];

// Longest chain we simulate before declaring the move an infinite loop.
export const MAX_STEPS = 400;

export const idx = (x, y) => y * SIZE + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const isArrow = (f) => f >= F.UP;
export const arrowDir = (f) => f - F.UP;

const open = (s, x, y) => inBounds(x, y) && s.floor[idx(x, y)] !== F.WALL;

export function emptyState() {
  return { floor: new Array(N).fill(F.EMPTY), piece: new Array(N).fill(P.NONE), ids: new Array(N).fill(0) };
}

export function clone(s) {
  return { floor: s.floor.slice(), piece: s.piece.slice(), ids: s.ids.slice() };
}

// Give every piece a stable id (reading order) so the renderer can track and color it.
export function withIds(s) {
  let next = 1;
  return { floor: s.floor.slice(), piece: s.piece.slice(), ids: s.piece.map((p) => (p ? next++ : 0)) };
}

export function isWin(s) {
  const c = s.piece.indexOf(P.CUBE);
  return c >= 0 && s.floor[c] === F.TARGET;
}

export function hasCube(s) {
  return s.piece.includes(P.CUBE);
}

export function stateKey(s) {
  let k = '';
  for (let i = 0; i < N; i++) k += String.fromCharCode(48 + s.floor[i] * 3 + s.piece[i]);
  return k;
}

// Problems that make a board unplayable, as user-facing strings. Empty array = valid.
export function validate(s) {
  const problems = [];
  const cubes = s.piece.filter((p) => p === P.CUBE).length;
  const targets = s.floor.filter((f) => f === F.TARGET).length;
  if (cubes !== 1) problems.push('Place exactly one cube.');
  if (targets !== 1) problems.push('Place exactly one target.');
  if (!s.piece.includes(P.BLOCK)) problems.push('Add at least one block.');
  if (cubes === 1 && isWin(s)) problems.push('The cube already sits on the target.');
  return problems;
}

export function legalMoves(s) {
  const moves = [];
  for (let i = 0; i < N; i++) {
    if (s.piece[i] !== P.BLOCK) continue;
    const x = i % SIZE, y = (i / SIZE) | 0;
    for (let dir = 0; dir < 4; dir++) {
      if (open(s, x + DIRS[dir].dx, y + DIRS[dir].dy)) moves.push({ x, y, dir });
    }
  }
  return moves;
}

// Run one full move. Returns { ok:false, reason } for rejected moves, otherwise
// { ok:true, state, events, outcome: 'win'|'fail'|'none', hits }.
// Events drive the animation: move, hit, turn, fall, stop.
export function simulate(s0, x, y, dir) {
  if (!inBounds(x, y) || s0.piece[idx(x, y)] !== P.BLOCK) return { ok: false, reason: 'not-movable' };
  if (!open(s0, x + DIRS[dir].dx, y + DIRS[dir].dy)) return { ok: false, reason: 'blocked' };

  const s = clone(s0);
  const events = [];
  let cx = x, cy = y, d = dir, hits = 0, outcome = 'none';

  for (let step = 0; ; step++) {
    if (step > MAX_STEPS) return { ok: false, reason: 'loop' };
    const ci = idx(cx, cy);
    const id = s.ids[ci];
    const nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;

    if (!open(s, nx, ny)) {
      events.push({ type: 'stop', id, x: cx, y: cy, dir: d });
      break;
    }
    const ni = idx(nx, ny);
    if (s.piece[ni] !== P.NONE) {
      hits++;
      events.push({ type: 'hit', id, target: s.ids[ni], x: cx, y: cy, dir: d });
      cx = nx; cy = ny;
      continue;
    }

    const kind = s.piece[ci];
    s.piece[ni] = kind; s.ids[ni] = id;
    s.piece[ci] = P.NONE; s.ids[ci] = 0;
    events.push({ type: 'move', id, kind, fx: cx, fy: cy, x: nx, y: ny, dir: d });
    cx = nx; cy = ny;

    const f = s.floor[ni];
    if (f === F.PIT) {
      s.piece[ni] = P.NONE; s.ids[ni] = 0; s.floor[ni] = F.EMPTY;
      events.push({ type: 'fall', id, kind, x: nx, y: ny });
      if (kind === P.CUBE) outcome = 'fail';
      break;
    }
    if (isArrow(f) && arrowDir(f) !== d) {
      d = arrowDir(f);
      events.push({ type: 'turn', id, x: nx, y: ny, dir: d });
    }
  }

  if (outcome !== 'fail' && isWin(s)) outcome = 'win';
  return { ok: true, state: s, events, outcome, hits };
}

// The part of a move the player is allowed to see before committing: the swiped
// block's own path up to its first impact. Everything after that is theirs to predict.
export function firstReaction(s, x, y, dir) {
  if (!inBounds(x, y) || s.piece[idx(x, y)] !== P.BLOCK) return null;
  if (!open(s, x + DIRS[dir].dx, y + DIRS[dir].dy)) return { path: [], end: 'blocked' };

  const path = [];
  const seen = new Set();
  let cx = x, cy = y, d = dir;
  for (;;) {
    const key = cx * 100 + cy * 10 + d;
    if (seen.has(key)) return { path, end: 'loop' };
    seen.add(key);
    const nx = cx + DIRS[d].dx, ny = cy + DIRS[d].dy;
    if (!open(s, nx, ny)) return { path, end: 'wall', at: { x: cx, y: cy }, dir: d };
    const ni = idx(nx, ny);
    if (s.piece[ni] !== P.NONE && !(nx === x && ny === y)) {
      return { path, end: 'hit', at: { x: cx, y: cy }, hit: { x: nx, y: ny }, dir: d };
    }
    path.push({ x: nx, y: ny });
    cx = nx; cy = ny;
    const f = s.floor[ni];
    if (f === F.PIT) return { path, end: 'fall', at: { x: cx, y: cy }, dir: d };
    if (isArrow(f)) d = arrowDir(f);
  }
}

// Breadth-first search for the fewest-move solution.
// Returns { moves, path } when solved, { moves: null, exhausted } otherwise.
export function solve(start, { maxDepth = 8, maxStates = 200000 } = {}) {
  if (isWin(start)) return { moves: 0, path: [] };
  const startKey = stateKey(start);
  const parent = new Map([[startKey, null]]);
  let frontier = [{ s: start, key: startKey }];

  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = [];
    for (const { s, key } of frontier) {
      for (const m of legalMoves(s)) {
        const r = simulate(s, m.x, m.y, m.dir);
        if (!r.ok || r.outcome === 'fail') continue;
        const k = stateKey(r.state);
        if (parent.has(k)) continue;
        parent.set(k, { prev: key, move: m });
        if (r.outcome === 'win') return { moves: depth, path: tracePath(parent, k) };
        if (parent.size > maxStates) return { moves: null, exhausted: true };
        next.push({ s: r.state, key: k });
      }
    }
    frontier = next;
  }
  return { moves: null, exhausted: frontier.length > 0 };
}

function tracePath(parent, key) {
  const path = [];
  for (let node = parent.get(key); node; node = parent.get(node.prev)) path.unshift(node.move);
  return path;
}

// Every first move that wins immediately — used to build "one move" puzzles.
export function winningMoves(s) {
  return legalMoves(s).filter((m) => {
    const r = simulate(s, m.x, m.y, m.dir);
    return r.ok && r.outcome === 'win';
  });
}

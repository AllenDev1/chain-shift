// Seeded puzzle generation. Everything here is deterministic for a given seed, which is
// what lets every player get the same Daily puzzle without a server.

import { N, F, P, emptyState, withIds, legalMoves, simulate, solve, winningMoves, stateKey } from './engine.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const randInt = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled(rng, n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Boards are generated without a target first. The target is passive floor, so we can
// simulate the board, see where the cube can come to rest, and only then decide where
// the target goes — far more reliable than hoping a random target happens to work.
export function randomBoard(rng, cfg) {
  const s = emptyState();
  const cells = shuffled(rng, N);
  let k = 0;
  for (let n = randInt(rng, cfg.walls); n > 0; n--) s.floor[cells[k++]] = F.WALL;
  for (let n = randInt(rng, cfg.pits); n > 0; n--) s.floor[cells[k++]] = F.PIT;
  for (let n = randInt(rng, cfg.arrows); n > 0; n--) s.floor[cells[k++]] = F.UP + Math.floor(rng() * 4);
  s.piece[cells[k++]] = P.CUBE;
  for (let n = randInt(rng, cfg.blocks); n > 0; n--) s.piece[cells[k++]] = P.BLOCK;
  return withIds(s);
}

export const CONFIGS = {
  basic: { walls: [2, 5], pits: [0, 0], arrows: [0, 0], blocks: [3, 6] },
  arrows: { walls: [2, 4], pits: [0, 0], arrows: [2, 4], blocks: [3, 6] },
  pits: { walls: [2, 4], pits: [1, 2], arrows: [0, 1], blocks: [4, 7] },
  full: { walls: [2, 5], pits: [0, 2], arrows: [1, 4], blocks: [4, 8] },
  // One-move puzzles need crowded boards, or the cube is rarely touched at all.
  dense: { walls: [2, 4], pits: [0, 2], arrows: [1, 3], blocks: [7, 10] },
};

// How much happens during a move: distinct pieces that travel, cube distance, turns.
export function chainStats(events) {
  const movers = new Set();
  let cubeSteps = 0, turns = 0, hits = 0;
  for (const e of events) {
    if (e.type === 'move') {
      movers.add(e.id);
      if (e.kind === P.CUBE) cubeSteps++;
    } else if (e.type === 'turn') turns++;
    else if (e.type === 'hit') hits++;
  }
  return { movers: movers.size, cubeSteps, turns, hits };
}

const cubeCell = (s) => s.piece.indexOf(P.CUBE);

function placeTarget(s, cell) {
  const out = withIds(s);
  out.floor[cell] = F.TARGET;
  return out;
}

// A "one move" puzzle: exactly one move lands the cube on the target, and that move
// sets off a real chain (several pieces travel, the cube goes a distance) while other
// moves also shove the cube around as decoys. Collects `pool` candidates and keeps the
// one with the richest chain.
export function generateOneMove(seed, { cfg = CONFIGS.dense, minMovers = 3, minCubeSteps = 2, minMoves = 12, pool = 1, maxTries = 50000 } = {}) {
  const rng = mulberry32(seed);
  let best = null, found = 0;
  for (let t = 0; t < maxTries && found < pool; t++) {
    const s = randomBoard(rng, cfg);
    const moves = legalMoves(s);
    if (moves.length < minMoves) continue;
    const start = cubeCell(s);
    const byCell = new Map();
    let decoys = 0;
    for (const m of moves) {
      const r = simulate(s, m.x, m.y, m.dir);
      if (!r.ok) continue;
      const c = cubeCell(r.state);
      if (c < 0 || c === start) continue;
      decoys++;
      if (!byCell.has(c)) byCell.set(c, []);
      byCell.get(c).push(chainStats(r.events));
    }
    if (decoys < 3) continue;
    let pick = null;
    for (const [cell, list] of byCell) {
      if (list.length !== 1 || s.floor[cell] !== F.EMPTY) continue;
      const stats = list[0];
      if (stats.movers < minMovers || stats.cubeSteps < minCubeSteps) continue;
      const score = stats.movers * 4 + stats.turns * 3 + stats.hits * 2 + stats.cubeSteps + decoys;
      if (!pick || score > pick.score) pick = { cell, score };
    }
    if (!pick) continue;
    const puzzle = placeTarget(s, pick.cell);
    const wins = winningMoves(puzzle);
    if (wins.length !== 1) continue;
    found++;
    if (!best || pick.score > best.score) best = { state: puzzle, par: 1, solution: wins, score: pick.score };
  }
  return best;
}

// First depth at which the cube can come to rest on each cell (BFS, target-free board).
function cubeReach(s, maxDepth, maxStates) {
  const reach = new Map();
  const seen = new Map([[stateKey(s), null]]);
  let frontier = [{ s, key: stateKey(s) }];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = [];
    for (const { s: cur, key } of frontier) {
      for (const m of legalMoves(cur)) {
        const r = simulate(cur, m.x, m.y, m.dir);
        if (!r.ok || r.outcome === 'fail') continue;
        const k = stateKey(r.state);
        if (seen.has(k)) continue;
        seen.set(k, { prev: key, move: m });
        const c = cubeCell(r.state);
        if (!reach.has(c)) reach.set(c, depth);
        if (seen.size > maxStates) return reach;
        next.push({ s: r.state, key: k });
      }
    }
    frontier = next;
  }
  return reach;
}

// A multi-move puzzle whose optimal solution length lies in [minPar, maxPar].
export function generatePuzzle(seed, { cfg = CONFIGS.full, minPar = 2, maxPar = 4, maxTries = 200 } = {}) {
  const rng = mulberry32(seed);
  for (let t = 0; t < maxTries; t++) {
    const s = randomBoard(rng, cfg);
    if (legalMoves(s).length < 8) continue;
    const start = cubeCell(s);
    const reach = cubeReach(s, maxPar, 30000);
    const candidates = [...reach]
      .filter(([cell, depth]) => cell !== start && s.floor[cell] === F.EMPTY && depth >= minPar)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (!candidates.length) continue;
    const top = candidates.filter((c) => c[1] === candidates[0][1]);
    const [cell] = top[Math.floor(rng() * top.length)];
    const puzzle = placeTarget(s, cell);
    const r = solve(puzzle, { maxDepth: maxPar, maxStates: 60000 });
    if (r.moves === null || r.moves < minPar) continue;
    return { state: puzzle, par: r.moves, solution: r.path };
  }
  return null;
}

// Daily puzzles are numbered from launch day, in the player's local calendar.
const LAUNCH = Date.UTC(2026, 9, 30);

export function todayString(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dailyNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 86400000) + 1;
}

export function generateDaily(dateStr) {
  return generateOneMove(hashString(`chain-shift-daily-${dateStr}`), { pool: 12 });
}
